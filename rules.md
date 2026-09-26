# Rule tính lương (Kim Sơn Tiến / VIOT)

Rule **chung của công ty**, được chia sẻ qua git. Claude đọc file này trước khi tính lương.
- Con số cá nhân (lương, phụ cấp, bảo hiểm) nằm ở `config.json`, tự đồng bộ từ 1Office bằng `sync_profile`.
- Ghi chú riêng của từng người nằm ở `notes.md`. Hai file này không đưa lên git.
- Phát hiện rule mới áp dụng cho mọi người thì ghi vào đây; rule chỉ đúng với riêng mình thì ghi vào `notes.md`.

## Công thức (mẫu "Bảng lương VIOT 2026", đã khớp từng đồng với phiếu lương thật)
- **Tổng công** = tổng giờ trên bảng công ÷ 8. Gồm cả giờ tăng ca, ngày lễ và ngày công tác.
- **Lương CB thực nhận** = "Lương ngày công" (trong lịch sử lương) × tổng công ÷ công chuẩn, làm tròn đến 1.000đ.
  - Công chuẩn = số ngày trong tháng trừ Chủ nhật. Thứ 7 là ngày làm.
- **PCCT thực lãnh** = "Phụ cấp công trình" (150.000đ/ngày) × số ngày có **đơn công tác** (mission).
  - Đơn bổ sung chấm công lý do "TC công trình" **không** được tính phụ cấp này.
- **Phụ cấp cơm trưa** trả đủ (26 × 40.000đ = 1.040.000đ), sau đó trừ 40.000đ cho mỗi bữa ăn ở công ty. Khoản trừ nằm ở dòng **"Tạm ứng"** trên phiếu; ghi chú ẩn của dòng đó ghi rõ, ví dụ "Trừ cơm trưa tháng 8: 17 phần x 40,000".
  - Bữa ăn ở công ty = ngày có công và ở công ty.
  - **Không tính bữa:** ngày lễ, Chủ nhật, ngày công tác, ngày làm online, ngày đi công trình, ngày nghỉ cả ngày.
  - Ngày nghỉ nửa ngày mà vẫn lên công ty thì vẫn tính bữa.
- **BHXH** = 10,5% × "Lương đóng bảo hiểm" (lấy từ phiếu lương gần nhất).
- **Thực lãnh** = lương CB + các phụ cấp + PCCT − BHXH − tạm ứng (tiền cơm), làm tròn đến 1.000đ.

## Chưa kiểm chứng
- Khi tổng công dưới 26, phụ cấp cơm, trách nhiệm, đi lại và điện thoại có bị tính theo tỷ lệ công không. Chưa có phiếu lương tháng thiếu công để kiểm chứng. Hiện đang để `prorate: false`.
- Đi muộn hoặc về sớm có bị phạt tiền riêng không. Đã có phiếu đi muộn vài lần mà không thấy dòng phạt nào.

## Đọc bảng công
- **Mã trên ô ngày:**
  - L: lễ
  - N: Chủ nhật
  - CT: công tác
  - IO: có đơn bổ sung chấm công
  - KL: nghỉ không lương
  - P: nghỉ phép
  - OT hoặc "+": tăng ca
  - ×: không có công
- Ngày chưa chấm công ra (hôm nay) hiện 0 công. Bộ tính tự giả định là đi làm ở công ty (`assumeFutureDays`).

## Việc cần soát mỗi tháng
- Ngày × hoặc 0 công mà không có đơn: tạo đơn công tác, nghỉ hoặc bổ sung chấm công.
- Ngày đi công trình phải tạo **đơn công tác**, không dùng đơn bổ sung chấm công, để được phụ cấp công trình.
- Đơn nghỉ có thời lượng 0 ngày (00:00–00:00) là nhập sai.
