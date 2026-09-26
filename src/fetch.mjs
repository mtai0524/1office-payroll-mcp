// Scrapers for the 1Office timesheet, payslip and applications.
// Page-side code is written as real functions and injected via toString(),
// so it must be self-contained (no closures over module scope).
import { withPage } from './browser.mjs';
import { loadConfig, readCache, writeCache } from './config.mjs';

const call = (fn, ...args) => `(${fn.toString()})(...${JSON.stringify(args)})`;
const pad = (n) => String(n).padStart(2, '0');

// ---------------------------------------------------------------- timesheet

function pageReadTimesheet(month) {
  const mm = String(month).padStart(2, '0');
  const tds = [...document.querySelectorAll('.attendance-table td')];
  const days = [];
  let inMonth = false;
  for (const td of tds) {
    const label = td.querySelector('.at-day-label')?.textContent.trim() || '';
    if (label.includes('/')) inMonth = label.endsWith('/' + mm);
    if (!inMonth || !label) continue;
    const day = parseInt(label, 10);
    days.push({
      day,
      point: td.querySelector('.at-box-point')?.textContent.trim() || '',
      time: (td.querySelector('.at-box-time')?.textContent || '').replace(/\s+/g, ' ').trim(),
      shift: td.querySelector('.at-box-subs')?.textContent.trim() || '',
      status: td.className,
    });
  }
  // Statistic block: alternating "label" / "number" lines.
  const text = document.body.innerText;
  const start = text.search(/Statistic|Thống kê/);
  const stats = {};
  if (start >= 0) {
    const lines = text.slice(start).split('\n').map((s) => s.trim()).filter(Boolean);
    for (let i = 1; i < lines.length - 1; i++) {
      if (!/^-?[\d.]+(\/[\d.]+)?$/.test(lines[i]) && /^-?[\d.]+(\/[\d.]+)?$/.test(lines[i + 1])) {
        stats[lines[i]] = lines[i + 1];
        i++;
      }
    }
  }
  return { days, stats };
}

const CODES = ['OT', '+', 'CT', 'KL', 'IO', 'L', 'P', 'N'];

function parsePoint(point) {
  if (point === '×' || point === 'x') return { hours: 0, codes: [], absent: true };
  const m = point.match(/^([\d.]+)?(.*)$/);
  const hours = m[1] ? parseFloat(m[1]) : 0;
  let rest = m[2] || '';
  const codes = [];
  while (rest) {
    const c = CODES.find((k) => rest.startsWith(k));
    if (!c) {
      codes.push(rest);
      break;
    }
    codes.push(c === '+' ? 'OT' : c);
    rest = rest.slice(c.length);
  }
  return { hours, codes, absent: false };
}

export async function fetchTimesheet(month, year) {
  const { baseUrl } = loadConfig().browser;
  const mm = pad(month);
  return withPage(async (p) => {
    await p.goto(
      `${baseUrl}/user?customMenu=user-board-attendance&month=${month}&year=${year}`,
      `[...document.querySelectorAll('.attendance-table .at-day-label')].some(e=>e.textContent.trim()==='01/${mm}') && /Statistic|Thống kê/.test(document.body.innerText)`,
    );
    const raw = await p.eval(call(pageReadTimesheet, month));
    const days = raw.days.map((d) => {
      const date = `${year}-${mm}-${pad(d.day)}`;
      const weekday = new Date(`${date}T00:00:00`).getDay();
      return { date, weekday, ...d, ...parsePoint(d.point) };
    });
    return { month, year, days, stats: raw.stats };
  });
}

// ------------------------------------------------------------------ payslip

function pageReadPayslip() {
  const tabs = [...document.querySelectorAll('.wst .tabs-head .tab-label')].map((e) => e.textContent.trim());
  const items = [...document.querySelectorAll('.wst .wst-list-item')].map((e) => {
    const [label, value] = [...e.children].map((c) => c.textContent.replace(/\s+/g, ' ').trim());
    return { label, value, sub: e.classList.contains('wst-sub') };
  });
  return { tabs, items };
}

function decodeEntities(s) {
  for (let i = 0; i < 4; i++) {
    s = s
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#0?39;/g, "'")
      .replace(/&amp;/g, '&')
      .replace(/\\"/g, '"')
      .replace(/\\\//g, '/');
  }
  return s;
}

const toNumber = (v) => {
  if (v == null) return null;
  const s = String(v).replace(/[₫\s]/g, '');
  if (!/^-?[\d.,]+$/.test(s)) return null;
  // Values use either "8,000,000" or "8.000.000"; decimals like "26.4462" have one separator.
  if (/^-?\d{1,3}([.,]\d{3})+$/.test(s)) return Number(s.replace(/[.,]/g, ''));
  return Number(s.replace(',', '.'));
};

export async function fetchPayslip(month, year) {
  const { baseUrl } = loadConfig().browser;
  return withPage(async (p) => {
    await p.goto(`${baseUrl}/user?customMenu=user-board-salary`, `typeof $==='function' && document.querySelector('.wsy-month')`);
    const rawText = await p.eval(
      `fetch('/user/board/index/salarydetail?year=${year}&month=${month}',{headers:{'X-Requested-With':'XMLHttpRequest'}}).then(r=>r.text()).then(t=>{const j=JSON.parse(t);eval(j.callback);return t})`,
    );
    // Header renders first; items load a few seconds later (or never, if not published).
    await p.waitFor(`document.querySelectorAll('.wst .wst-list-item').length>0`, 25000);
    const { tabs, items } = await p.eval(call(pageReadPayslip));

    const hints = {};
    const decoded = decodeEntities(rawText);
    const re = /([^<>'"]{2,80})<elem name='hint' data-props='\{"content":"([^"]*)"/g;
    for (let m; (m = re.exec(decoded)); ) hints[m[1].trim()] = m[2];

    const lines = items.map((it) => ({ ...it, amount: toNumber(it.value), hint: hints[it.label] || null }));
    return { month, year, published: lines.length > 0, tables: tabs, lines, hints };
  });
}

// ------------------------------------------------------------- applications

const APP_TYPES = {
  inout: 'approval-inout-inout',
  leave: 'approval-leave-leave',
  mission: 'approval-mission-mission',
  overtime: 'approval-overtime-overtime',
};

function pageReadList() {
  return [...document.querySelectorAll('tr')]
    .map((tr) => {
      const a = tr.querySelector('a[href*="/view?ID="]');
      if (!a) return null;
      const cells = [...tr.children].map((td) => td.innerText.replace(/\s+/g, ' ').trim());
      const dates = cells.filter((c) => /^\d{2}\/\d{2}\/\d{4}$/.test(c));
      return { id: a.getAttribute('href').match(/ID=(\d+)/)[1], created: dates[dates.length - 1] || null, cells };
    })
    .filter(Boolean);
}

function pageReadDetail() {
  const fields = {};
  for (const l of document.querySelectorAll('.detail-field-label')) {
    fields[l.textContent.trim()] = (l.nextElementSibling?.innerText || '').replace(/\s+/g, ' ').trim();
  }
  const rows = [];
  const table = [...document.querySelectorAll('table')].find((t) => !/Người tạo|Created by/.test(t.innerText.slice(0, 200)));
  if (table) {
    for (const tr of table.querySelectorAll('tr')) {
      const cells = [...tr.children].map((c) => c.innerText.replace(/\s+/g, ' ').trim());
      if (cells.some((c) => /\d{2}\/\d{2}\/\d{4}/.test(c))) rows.push(cells);
    }
  }
  return { fields, rows };
}

const dmyToIso = (s) => {
  const m = s.match(/(\d{2})\/(\d{2})\/(\d{4})/);
  return m ? `${m[3]}-${m[2]}-${m[1]}` : null;
};
const pick = (fields, re) => {
  const k = Object.keys(fields).find((x) => re.test(x));
  return k ? fields[k] : null;
};
function eachDate(fromIso, toIso) {
  const out = [];
  for (let d = new Date(fromIso + 'T00:00:00'); d <= new Date(toIso + 'T00:00:00'); d.setDate(d.getDate() + 1)) {
    out.push(`${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`);
  }
  return out;
}

// Turn a raw detail page into { type, status, entries: [{date, ...}] }.
export function normalizeApp(type, id, raw) {
  const f = raw.fields;
  const status = pick(f, /^(Trạng thái|Status)$/) || '';
  const approved = /duyệt|Approved/i.test(status) && !/Chờ|Waiting|Từ chối|Reject/i.test(status);
  const base = { type, id, status, approved, description: pick(f, /^(Mô tả|Description)$/) };

  if (type === 'inout') {
    const entries = raw.rows.map((r) => ({ date: dmyToIso(r[0]), time: r[1], reason: r[2], penalty: /Yes|Có/i.test(r[3] || '') }));
    return { ...base, entries };
  }
  if (type === 'leave') {
    const reason = pick(f, /^(Lý do|Reason)$/);
    const paid = /Yes|Có/i.test(pick(f, /^(Tính công|Paid leave)$/) || '');
    const entries = [];
    for (const r of raw.rows) {
      const from = dmyToIso(r[0]);
      const to = dmyToIso(r[1]) || from;
      const days = parseFloat((r.find((c) => /Ngày|Days/.test(c)) || '').replace(',', '.')) || 0;
      const [fromTime, toTime] = [r[0].match(/\d{1,2}:\d{2}/)?.[0], r[1].match(/\d{1,2}:\d{2}/)?.[0]];
      for (const date of eachDate(from, to)) entries.push({ date, fromTime, toTime, days, reason, paid });
    }
    return { ...base, reason, paid, entries };
  }
  if (type === 'mission') {
    const span = Object.values(f).find((v) => (v.match(/\d{2}\/\d{2}\/\d{4}/g) || []).length >= 2) || '';
    const [from, to] = span.match(/\d{2}\/\d{2}\/\d{4}/g) || [];
    const kind = pick(f, /^(Hình thức công tác|Type)$/);
    const place = pick(f, /^(Địa điểm|Place)$/);
    const entries = from ? eachDate(dmyToIso(from), dmyToIso(to)).map((date) => ({ date, place })) : [];
    return { ...base, span, kind, place, entries };
  }
  if (type === 'overtime') {
    const entries = raw.rows.map((r) => ({ date: dmyToIso(r[0]), time: r[1], hours: parseFloat(r[2]) || 0, kind: r[3] }));
    return { ...base, entries };
  }
  return { ...base, entries: [] };
}

// Applications affecting `month`: scan each list for items created within a window, open each detail.
export async function fetchApplications(month, year, { refresh = false } = {}) {
  const { baseUrl } = loadConfig().browser;
  const cache = readCache('applications.json') || {};
  const monthStart = new Date(year, month - 1, 1);
  const monthEnd = new Date(year, month, 0);
  const lower = new Date(monthStart.getTime() - 45 * 864e5);
  const inWindow = (dmy) => {
    const iso = dmy && dmyToIso(dmy);
    return iso && new Date(iso + 'T00:00:00') >= lower;
  };

  return withPage(async (p) => {
    const apps = [];
    for (const [type, slug] of Object.entries(APP_TYPES)) {
      await p.goto(
        `${baseUrl}/apps/${slug}/list?v=list&tab=private_all&sort_by=date_created&sort_type=desc`,
        `document.querySelector('a[href*="/view?ID="]') || /No results|Không có/.test(document.body.innerText)`,
      );
      const list = (await p.eval(call(pageReadList))).filter((r) => inWindow(r.created));
      for (const row of list) {
        const key = `${type}:${row.id}`;
        let app = cache[key];
        if (!app || refresh || !app.approved) {
          await p.goto(`${baseUrl}/apps/${slug}/view?ID=${row.id}`, `document.querySelector('.detail-field-label')`);
          const raw = await p.eval(call(pageReadDetail));
          app = { ...normalizeApp(type, row.id, raw), created: row.created, url: `${baseUrl}/apps/${slug}/view?ID=${row.id}` };
          cache[key] = app;
        }
        apps.push(app);
      }
    }
    writeCache('applications.json', cache);
    const startIso = `${year}-${pad(month)}-01`;
    const endIso = `${year}-${pad(month)}-${pad(monthEnd.getDate())}`;
    return apps.filter((a) => a.entries.some((e) => e.date >= startIso && e.date <= endIso) || a.entries.length === 0);
  });
}

// Everything for one month, cached to disk.
export async function fetchMonth(month, year, { refresh = false } = {}) {
  const key = `month-${year}-${pad(month)}.json`;
  if (!refresh) {
    const cached = readCache(key);
    if (cached) return cached;
  }
  const timesheet = await fetchTimesheet(month, year);
  const payslip = await fetchPayslip(month, year);
  const applications = await fetchApplications(month, year, { refresh });
  const data = { fetchedAt: new Date().toISOString(), month, year, timesheet, payslip, applications };
  writeCache(key, data);
  return data;
}

// ------------------------------------------------------- salary & allowances

// Latest entry of "Salary & Allowance Histories" / "Lịch sử lương" on the salary board.
function pageReadSalaryHistory() {
  const lines = document.body.innerText.split('\n').map((s) => s.trim()).filter(Boolean);
  const isDate = (s) => /^\d{2}\/\d{2}\/\d{4}$/.test(s);
  const start = lines.findIndex(isDate);
  if (start < 0) return null;
  const items = {};
  for (let i = start + 1; i < lines.length - 1 && !isDate(lines[i]); i++) {
    if (/₫/.test(lines[i + 1])) {
      items[lines[i]] = lines[i + 1];
      i++;
    }
  }
  return { effectiveFrom: lines[start], items, otherDates: lines.slice(start + 1).filter(isDate) };
}

export async function fetchSalaryProfile() {
  const { baseUrl } = loadConfig().browser;
  return withPage(async (p) => {
    await p.goto(`${baseUrl}/user?customMenu=user-board-salary`, `/\d{2}\/\d{2}\/\d{4}\s*\n[^\n]+\n[\d.,]+ ₫/.test(document.body.innerText)`);
    const raw = await p.eval(call(pageReadSalaryHistory));
    if (!raw) throw new Error('Không đọc được lịch sử lương trên trang Lương');
    return { ...raw, items: Object.fromEntries(Object.entries(raw.items).map(([k, v]) => [k, toNumber(v)])) };
  });
}
