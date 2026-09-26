#!/usr/bin/env node
// MCP server: 1Office payroll — fetch timesheet/payslip/applications, calculate, audit, compare.
import fs from 'node:fs';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { fetchMonth } from './fetch.mjs';
import { calculate, audit, comparePayslip } from './calc.mjs';
import { loadConfig, patchConfig, readNotes, RULES_PATH, NOTES_PATH } from './config.mjs';
import { ensureProfile, syncProfile } from './profile.mjs';

const server = new McpServer({ name: '1office-payroll', version: '1.0.0' });

const now = new Date();
const monthArgs = {
  month: z.number().int().min(1).max(12).describe('Tháng (1-12)'),
  year: z.number().int().optional().describe(`Năm, mặc định ${now.getFullYear()}`),
};
const calcArgs = {
  dayOverrides: z
    .record(z.string(), z.union([z.string(), z.number(), z.record(z.string(), z.any())]))
    .optional()
    .describe(
      'Ghi đè từng ngày, key là ngày trong tháng ("25") hoặc ISO date. Value: "CT" (công tác có đơn: 8h, có PCCT, không ăn cty), ' +
        '"SITE" (đi công trình không có đơn công tác: 8h, không PCCT), "WFH", "OFFICE" (8h, ăn cty), "OFF" (0 công), ' +
        'số giờ, hoặc object {hours, mission, wfh, site, meal, note}.',
    ),
  adjustments: z
    .array(z.object({ label: z.string(), amount: z.number().describe('Dương = cộng, âm = trừ') }))
    .optional()
    .describe('Khoản cộng/trừ ngoài công thức: thưởng, phạt, tạm ứng thêm...'),
  meals: z.number().int().optional().describe('Ép số bữa ăn ở công ty (mặc định tự đếm)'),
  assumeFutureDays: z.enum(['office', 'WFH', 'CT', 'OFF', 'none']).optional().describe('Giả định cho các ngày chưa tới (mặc định theo config)'),
  refresh: z.boolean().optional().describe('Tải lại dữ liệu từ 1Office thay vì dùng cache'),
};

const json = (obj) => ({ content: [{ type: 'text', text: JSON.stringify(obj, null, 2) }] });
const wrap = (fn) => async (args) => {
  try {
    return await fn(args);
  } catch (e) {
    return { isError: true, content: [{ type: 'text', text: String(e.message || e) }] };
  }
};
const load = ({ month, year = now.getFullYear(), refresh }) => fetchMonth(month, year, { refresh });
const calcOpts = (a) => ({ dayOverrides: a.dayOverrides, adjustments: a.adjustments, meals: a.meals, assumeFutureDays: a.assumeFutureDays });

server.registerTool(
  'fetch_month',
  {
    description:
      'Lấy dữ liệu thô 1 tháng từ 1Office: bảng công từng ngày + thống kê, phiếu lương (kèm ghi chú ẩn), các đơn từ (công tác, nghỉ, OT, bổ sung chấm công). ' +
      'Có cache; dùng refresh=true để tải mới (mất ~1-2 phút). Nếu báo CHƯA ĐĂNG NHẬP, nhờ user đăng nhập trong cửa sổ Chrome rồi gọi lại.',
    inputSchema: { ...monthArgs, refresh: calcArgs.refresh },
  },
  wrap(async (a) => json(await load(a))),
);

server.registerTool(
  'calculate_salary',
  {
    description:
      'Tính lương dự kiến của tháng theo config + rules.md. Trả từng dòng (công, lương CB, PCCT, phụ cấp, BHXH, trừ cơm, net), danh sách ngày giả định/ghi đè, bảng từng ngày. ' +
      'Đọc get_rules trước; chuyển các rule ngoài user nói thành dayOverrides/adjustments thay vì tự tính tay.',
    inputSchema: { ...monthArgs, ...calcArgs },
  },
  wrap(async (a) => json(calculate(await load(a), await ensureProfile(), calcOpts(a)))),
);

server.registerTool(
  'audit_month',
  {
    description:
      'Soát bảng công + đơn từ: ngày 0 công/× không có đơn, thiếu giờ, đơn nhập sai (0 ngày, chọn nhầm loại), đơn chưa duyệt, bị phạt. Kèm số tiền ước tính bị mất.',
    inputSchema: { ...monthArgs, refresh: calcArgs.refresh },
  },
  wrap(async (a) => json(audit(await load(a), await ensureProfile()))),
);

server.registerTool(
  'compare_payslip',
  {
    description:
      'So sánh phiếu lương thật (khi đã công bố) với số tự tính, từng dòng, kèm ghi chú ẩn trên phiếu. Dùng để phát hiện sai lệch hoặc rule mới cần ghi vào rules.md/config.',
    inputSchema: { ...monthArgs, ...calcArgs },
  },
  wrap(async (a) => json(comparePayslip(await load(a), await ensureProfile(), calcOpts(a)))),
);

server.registerTool(
  'sync_profile',
  {
    description:
      'Đồng bộ con số cá nhân từ 1Office vào config.json: lương ngày công, các phụ cấp (mục Lịch sử lương), lương đóng bảo hiểm và tỷ lệ trích (từ phiếu lương gần nhất). ' +
      'Tự chạy lần đầu; gọi lại khi lương/phụ cấp thay đổi. Trả về danh sách thay đổi.',
    inputSchema: {},
  },
  wrap(async () => json(await syncProfile())),
);

server.registerTool(
  'get_rules',
  {
    description: 'Đọc rules.md (rule chung công ty), notes.md (ghi chú cá nhân) và config.json (con số: lương, phụ cấp, giá cơm, BHXH...).',
    inputSchema: {},
  },
  wrap(async () => ({
    content: [
      { type: 'text', text: fs.readFileSync(RULES_PATH, 'utf8') },
      { type: 'text', text: 'notes.md (cá nhân):\n' + (readNotes() || '(trống)') },
      { type: 'text', text: 'config.json:\n' + JSON.stringify(loadConfig(), null, 2) },
    ],
  })),
);

server.registerTool(
  'update_rules',
  {
    description:
      'Cập nhật rule. `rulesMarkdown` ghi đè toàn bộ rules.md (rule chung, chia sẻ qua git). `notesMarkdown` ghi đè notes.md (ghi chú cá nhân). ' +
        'Đọc get_rules trước và giữ nội dung cũ. `configPatch` deep-merge vào config.json (null để xoá key), ' +
      'ví dụ {"salary":{"dailyWageSalary":9000000}} hoặc {"allowances":{"Phụ cấp cơm trưa":{"prorate":true}}}.',
    inputSchema: {
      rulesMarkdown: z.string().optional(),
      notesMarkdown: z.string().optional(),
      configPatch: z.record(z.string(), z.any()).optional(),
    },
  },
  wrap(async ({ rulesMarkdown, notesMarkdown, configPatch }) => {
    if (rulesMarkdown) fs.writeFileSync(RULES_PATH, rulesMarkdown);
    if (notesMarkdown) fs.writeFileSync(NOTES_PATH, notesMarkdown);
    const cfg = configPatch ? patchConfig(configPatch) : loadConfig();
    return json({ ok: true, rulesUpdated: !!rulesMarkdown, notesUpdated: !!notesMarkdown, config: cfg });
  }),
);

await server.connect(new StdioServerTransport());
