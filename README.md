# 1office-payroll-mcp

MCP server giúp Claude tính lương hằng tháng từ **1Office** (kimsontien.1office.vn). Tool làm 4 việc:

1. Đọc bảng công, phiếu lương (kể cả ghi chú ẩn) và đơn từ của bạn.
2. Tính lương dự kiến theo công thức đã kiểm chứng với phiếu lương thật.
3. Soát lỗi: ngày thiếu đơn, đơn nhập sai, thiếu giờ, kèm số tiền bị ảnh hưởng.
4. So sánh với phiếu lương khi công ty công bố.

Các rule ngoài công thức (thưởng, phạt, ngày đi công trình...) bạn chỉ cần nói với Claude bằng lời. Claude chuyển chúng thành tham số, còn phép tính do code làm nên không bị lệch.

## Yêu cầu
- Đã cài **Google Chrome**.
- **Node.js 22 trở lên** ([tải ở đây](https://nodejs.org)).
- **Claude Code** hoặc **Claude Desktop**.
- Tài khoản 1Office của chính bạn.

## Cài đặt (1 lệnh, không cần clone, không cần Git)

### Claude Code
**Windows – PowerShell** (dấu `--` phải nằm trong nháy đơn, nếu không PowerShell sẽ nuốt mất và báo `unknown option '-y'`):
```powershell
claude mcp add 1office-payroll --scope user '--' cmd /c npx -y https://codeload.github.com/mtai0524/1office-payroll-mcp/tar.gz/refs/heads/main
```
**Windows – Command Prompt (cmd) hoặc Git Bash:**
```bash
claude mcp add 1office-payroll --scope user -- cmd /c npx -y https://codeload.github.com/mtai0524/1office-payroll-mcp/tar.gz/refs/heads/main
```
**macOS / Linux:**
```bash
claude mcp add 1office-payroll --scope user -- npx -y https://codeload.github.com/mtai0524/1office-payroll-mcp/tar.gz/refs/heads/main
```

### Claude Desktop
Thêm đoạn sau vào `claude_desktop_config.json`:
- Windows: `%APPDATA%\Claude\claude_desktop_config.json`
- macOS: `~/Library/Application Support/Claude/claude_desktop_config.json`

```json
{
  "mcpServers": {
    "1office-payroll": {
      "command": "npx",
      "args": ["-y", "https://codeload.github.com/mtai0524/1office-payroll-mcp/tar.gz/refs/heads/main"]
    }
  }
}
```

Trên Windows, nếu không chạy được thì đổi thành:
```json
"command": "cmd",
"args": ["/c", "npx", "-y", "https://codeload.github.com/mtai0524/1office-payroll-mcp/tar.gz/refs/heads/main"]
```

Sau khi cài, khởi động lại Claude.

### Báo "disconnected" / "failed"
1. **Đã cài theo lệnh cũ `github:mtai0524/...`?** Lệnh cũ cần Git, máy không có Git sẽ lỗi. Xoá đi rồi cài lại bằng lệnh ở trên:
   ```
   claude mcp remove 1office-payroll --scope user
   ```
2. **Kiểm tra Node:** chạy `node -v`, phải từ **v22** trở lên.
3. **Chạy thử tay để xem lỗi thật** (không báo lỗi gì và đứng im là **đúng**, bấm Ctrl+C để thoát):
   ```
   npx -y https://codeload.github.com/mtai0524/1office-payroll-mcp/tar.gz/refs/heads/main
   ```
4. **Mạng chậm, lần đầu tải lâu quá thời gian chờ:** chạy lệnh ở bước 3 một lần cho tải xong, rồi mở lại Claude. Hoặc tăng thời gian chờ trước khi mở Claude Code:
   - PowerShell: `$env:MCP_TIMEOUT=120000; claude`
   - bash: `MCP_TIMEOUT=120000 claude`
5. Xem trạng thái: `claude mcp get 1office-payroll`, hoặc gõ `/mcp` trong Claude Code.

### Muốn sửa code hoặc góp rule
```bash
git clone https://github.com/mtai0524/1office-payroll-mcp.git
cd 1office-payroll-mcp
npm install
claude mcp add 1office-payroll --scope user -- node "<đường-dẫn-tuyệt-đối>/1office-payroll-mcp/src/server.mjs"
```

## Lần chạy đầu tiên
1. Hỏi Claude, ví dụ: *"Tính lương tháng này cho tôi"*.
2. Tool mở một cửa sổ Chrome riêng và báo **CHƯA ĐĂNG NHẬP**.
3. Bạn **tự đăng nhập** 1Office trong cửa sổ đó, tick "Duy trì đăng nhập", rồi bảo Claude chạy lại.
4. Tool tự đồng bộ lương ngày công, phụ cấp và mức đóng bảo hiểm của bạn từ 1Office. Bạn không cần nhập tay.

Lần sau không cần đăng nhập lại, trừ khi phiên hết hạn.

> Tool không bao giờ hỏi hay lưu mật khẩu. Mỗi người chỉ xem được dữ liệu của chính mình.
> Khi dùng xong nên đóng cửa sổ Chrome đó, vì nó mở cổng debug cho phép chương trình khác trên máy điều khiển phiên đăng nhập.

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

## Dữ liệu lưu ở đâu
Dữ liệu cá nhân nằm trong thư mục home của bạn: `~/.1office-payroll/`. Trên Windows là `C:\Users\<tên>\.1office-payroll\`. Thư mục này không bao giờ lên git.

| File | Nội dung |
|---|---|
| `config.json` | Con số cá nhân (lương, phụ cấp, bảo hiểm), tự tạo và tự đồng bộ |
| `notes.md` | Ghi chú cá nhân |
| `cache/` | Bảng công và phiếu lương đã tải |
| `chrome-profile/` | Phiên đăng nhập 1Office. **Tuyệt đối không chia sẻ** |
| `rules.md` | Chỉ có khi bạn tự sửa rule lúc chạy qua npx; bản này được ưu tiên hơn bản chung |

Rule chung của công ty nằm trong [`rules.md`](rules.md) của repo. Muốn đổi chỗ lưu dữ liệu thì đặt biến môi trường `OFFICE_PAYROLL_HOME`.

## Lưu ý
- Công thức mới được kiểm chứng với mẫu **"Bảng lương VIOT 2026"**. Nếu bạn ở phòng ban khác, hãy chạy `compare_payslip` với một tháng đã có phiếu lương trước. Nếu có dòng lệch, nhờ Claude tìm nguyên nhân rồi cập nhật rule.
- Phát hiện rule mới áp dụng cho mọi người thì tạo issue hoặc pull request sửa `rules.md`.
- Nếu port 9222 đã bị chiếm, đổi `browser.port` trong `~/.1office-payroll/config.json`.
- Nếu cài Chrome ở chỗ khác, đặt biến môi trường `CHROME_PATH`.
