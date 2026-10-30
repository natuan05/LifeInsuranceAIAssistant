# C06 — Trợ lý và lịch sử chat

[Quay lại menu](../menu.md) · [Tiến độ và gap](../implementation-status.md)

> Phạm vi UI cho MVP; chưa phải chức năng đã triển khai.

Đối chiếu 30/10/2026: chưa có UI/API nghiệp vụ tương ứng. WebSocket hiện có chỉ invalidation account/profile/assignment; không hoàn thành chat, Ticket hoặc notification. Các bước dưới là phạm vi dự kiến.

## 1. Mục đích

Hỏi AI về sản phẩm/hợp đồng, xem nguồn, xem lại trao đổi và chat với Staff khi được tiếp nhận.

## 2. Thành phần hiển thị

- Danh sách hội thoại, khung tin nhắn, ô nhập và nút Gửi.
- Nhãn người gửi AI/Staff, nguồn trích dẫn và hợp đồng đang hỏi nếu có.
- Hai nút: **Tạo yêu cầu hỗ trợ** và **Yêu cầu Staff**.
- Bản xem trước Ticket gồm tiêu đề, nội dung tóm tắt, hợp đồng liên quan; cho sửa, xác nhận gửi hoặc quay lại.
- Chuông thông báo trên header; xem [Thông báo](notifications.md).

## 3. Chức năng và thao tác

| Thao tác | Kết quả |
| --- | --- |
| Gửi tin nhắn | AI trả lời có nguồn hoặc Staff trả lời khi đã tiếp quản. |
| Tạo yêu cầu hỗ trợ | Agent tóm tắt phần chat liên quan thành bản nháp; Customer xem/sửa và xác nhận trước khi Core tạo Ticket. |
| Yêu cầu Staff | Chuẩn bị cùng bản nháp để xác nhận, liên kết cuộc chat và gửi yêu cầu tiếp quản sau khi lưu. Ticket đã chờ cho lần chuyển giao này thì mở lại, không tạo thêm. |
| Xác nhận gửi | Chỉ hiện mã Ticket sau khi Core lưu; tạo Ticket không đồng nghĩa Staff đã nhận chat. |
| Quay lại bản nháp | Chưa gửi Ticket, tiếp tục chat hoặc sửa nội dung. |
| Mở lịch sử/nguồn | Xem lại hội thoại hoặc mở đúng tài liệu được cấp quyền. |

Nếu AI tóm tắt lỗi, Customer có thể tự điền nội dung để tiếp tục xác nhận gửi. Luồng tạo bằng tay xem tại [Yêu cầu hỗ trợ](tickets.md). Khi nội dung bản nháp thay đổi, phải xác nhận lại nội dung mới.

## 4. Trạng thái

- **AI đang hỗ trợ:** Gửi câu hỏi và sử dụng hai nút hỗ trợ.
- **Chờ Staff:** Hiện mã yêu cầu và trạng thái chờ, không báo Staff đang chat.
- **Staff đang hỗ trợ:** Hiện tên Staff; AI dừng trả lời Customer và Core chặn Agent ghi nghiệp vụ. Copilot nội bộ vẫn dùng theo quyền.
- **Chưa có Staff/Staff không khả dụng:** Nêu rõ chưa thể tiếp quản; Ticket đã lưu vẫn xem được.
- **AI lỗi/mất kết nối/gửi chưa rõ kết quả:** Giữ nội dung để thử lại, tra cứu yêu cầu cũ trước khi tạo lại.

Quy tắc AI có tiếp tục trả lời trong lúc chờ Staff cần chốt trước khi triển khai; UI luôn thể hiện đúng người đang hỗ trợ.

## 5. Checklist

- [ ] Có hai nút hỗ trợ, tóm tắt AI và bản xem trước sửa được.
- [ ] Xác nhận hợp lệ, chống trùng và báo mã Ticket sau khi lưu.
- [ ] Tiếp quản trong cùng hội thoại, hiển thị đúng người đang hỗ trợ.
- [ ] Tóm tắt lỗi vẫn cho tự nhập; xử lý mất mạng và Staff không khả dụng.

