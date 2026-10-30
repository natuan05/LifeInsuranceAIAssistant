# C09 — Thông báo

[Quay lại menu](../menu.md) · [Tiến độ và gap](../implementation-status.md)

> Phạm vi UI cho MVP theo trao đổi; chưa có implementation. Model Notification hiện chỉ có người nhận Staff, cần bổ sung người nhận và quyền Customer trước khi code.

Đối chiếu 30/10/2026: chưa có UI/API nghiệp vụ tương ứng. WebSocket hiện có chỉ invalidation account/profile/assignment; không hoàn thành chat, Ticket hoặc notification. Các bước dưới là phạm vi dự kiến.

## 1. Mục đích

Customer biết yêu cầu của mình đã được ghi nhận, Staff đã tiếp nhận hoặc có tin nhắn Staff chưa đọc.

## 2. Thành phần hiển thị

- Chuông trên header, số thông báo chưa đọc và danh sách mở khi bấm chuông.
- Mỗi mục có nội dung ngắn, thời gian, dấu chưa đọc và liên kết tới Ticket/cuộc chat.

## 3. Chức năng và thao tác

| Sự kiện | Nội dung hiển thị |
| --- | --- |
| Ticket được lưu | Yêu cầu đã được ghi nhận, kèm mã Ticket. Áp dụng cả form thủ công và bản AI tóm tắt. |
| Staff tiếp quản thành công | Staff đã tiếp nhận cuộc trò chuyện; bấm để mở chat. |
| Có tin Staff chưa đọc | Báo tin mới khi Customer không đang đọc cuộc chat đó. |

Bấm thông báo để đánh dấu đã đọc và mở đối tượng. Đọc thông báo không thay trạng thái Ticket hay tiếp quản. Chỉ hiển thị nội dung tối thiểu và kiểm quyền lại khi mở.

## 4. Trạng thái

- Không có thông báo; đang tải; lỗi tải; đã đọc/chưa đọc.
- Link không còn truy cập được: thông báo an toàn và cho quay lại danh sách.
- Phát lỗi/thử lại không tạo thông báo trùng; lịch sử Ticket/chat vẫn xem được.

## 5. Checklist

- [ ] Có chuông, số chưa đọc và danh sách riêng của Customer.
- [ ] Nhận thông báo từ sự kiện đã được Core ghi nhận, không dựa vào lời Agent.
- [ ] Đánh dấu đọc, mở đúng đối tượng và chống phát trùng.
- [ ] Kiểm quyền người nhận và không phát nội dung riêng tư không cần thiết.
