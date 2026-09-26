# 1office-payroll-mcp

MCP server giúp Claude tính lương hằng tháng từ **1Office** (kimsontien.1office.vn). Tool làm 4 việc:

1. Đọc bảng công, phiếu lương (kể cả ghi chú ẩn) và đơn từ của bạn.
2. Tính lương dự kiến theo công thức đã kiểm chứng với phiếu lương thật.
3. Soát lỗi: ngày thiếu đơn, đơn nhập sai, thiếu giờ, kèm số tiền bị ảnh hưởng.
4. So sánh với phiếu lương khi công ty công bố.

Các rule ngoài công thức (thưởng, phạt, ngày đi công trình...) bạn chỉ cần nói với Claude bằng lời. Claude chuyển chúng thành tham số, còn phép tính do code làm nên không bị lệch.

## Yêu cầu
- Windows, macOS hoặc Linux, đã cài **Google Chrome**.
- **Node.js 22 trở lên**.
- **Claude Code** hoặc **Claude Desktop**.
- Tài khoản 1Office của chính bạn.

## Cài đặt

```bash
git clone https://github.com/mtai0524/1office-payroll-mcp.git
cd 1office-payroll-mcp
npm install
```

### Đăng ký với Claude Code
```bash
claude mcp add 1office-payroll --scope user -- node "<đường-dẫn-tuyệt-đối>/1office-payroll-mcp/src/server.mjs"
```

### Hoặc với Claude Desktop
Thêm đoạn sau vào `claude_desktop_config.json`:
- Windows: `%APPDATA%\Claude\claude_desktop_config.json`
- macOS: `~/Library/Application Support/Claude/claude_desktop_config.json`

```json
{
  "mcpServers": {
    "1office-payroll": {
      "command": "node",
      "args": ["<đường-dẫn-tuyệt-đối>/1office-payroll-mcp/src/server.mjs"]
    }
  }
}
```

Sau khi cài, khởi động lại Claude.

## Lần chạy đầu tiên
1. Hỏi Claude, ví dụ: *"Tính lương tháng này cho tôi"*.
2. Tool mở một cửa sổ Chrome riêng và báo **CHƯA ĐĂNG NHẬP**.
3. Bạn **tự đăng nhập** 1Office trong cửa sổ đó, tick "Duy trì đăng nhập", rồi bảo Claude chạy lại.
4. Tool tự đồng bộ lương ngày công, phụ cấp và mức đóng bảo hiểm của bạn từ 1Office vào `config.json`. Bạn không cần nhập tay.

Phiên đăng nhập được lưu trong thư mục `.chrome-profile/` ngay trong repo. Lần sau không cần đăng nhập lại, trừ khi phiên hết hạn.

> Tool không bao giờ hỏi hay lưu mật khẩu. Mỗi người chỉ xem được dữ liệu của chính mình.

## Hỏi Claude kiểu gì
- *"Tính lương tháng 9, ngày 25 tôi đi công trình, ngày 26 làm online"*
- *"Soát bảng công tháng này xem còn thiếu đơn gì"*
- *"Phiếu lương tháng 9 ra rồi, so với số tự tính xem lệch chỗ nào"*
- *"Tháng này có thưởng lễ 500k, tính lại"*
- *"Lương tôi mới tăng, đồng bộ lại"* (gọi `sync_profile`)

## Tools
| Tool | Việc |
|---|---|
| `fetch_month` | Lấy dữ liệu thô của một tháng. Có cache; `refresh: true` để tải lại (mất khoảng 1–2 phút) |
| `calculate_salary` | Tính lương; nhận thêm `dayOverrides`, `adjustments`, `meals` |
| `audit_month` | Soát lỗi bảng công và đơn từ |
| `compare_payslip` | So phiếu lương thật với số tự tính |
| `sync_profile` | Đồng bộ lương, phụ cấp và bảo hiểm từ 1Office |
| `get_rules` / `update_rules` | Đọc và sửa rule |

## Các file
| File | Nội dung | Có lên git không |
|---|---|---|
| `rules.md` | Rule tính lương **chung của công ty** | ✅ Có |
| `config.example.json` | Config mẫu | ✅ Có |
| `config.json` | Con số **cá nhân**, tự tạo khi chạy lần đầu | ❌ Không |
| `notes.md` | Ghi chú **cá nhân** | ❌ Không |
| `cache/` | Bảng công và phiếu lương đã tải | ❌ Không |
| `.chrome-profile/` | Phiên đăng nhập 1Office | ❌ Không, **tuyệt đối không chia sẻ** |

## Lưu ý
- Công thức mới được kiểm chứng với mẫu **"Bảng lương VIOT 2026"**. Nếu bạn ở phòng ban khác, hãy chạy `compare_payslip` với một tháng đã có phiếu lương trước. Nếu có dòng lệch, nhờ Claude tìm nguyên nhân rồi cập nhật `rules.md` hoặc `config.json`.
- Phát hiện rule mới áp dụng cho mọi người thì sửa `rules.md` và tạo pull request để cả nhóm cùng dùng.
- Nếu port 9222 đã bị chiếm, đổi `browser.port` trong `config.json`.
- Nếu cài Chrome ở chỗ khác, đặt biến môi trường `CHROME_PATH`.
