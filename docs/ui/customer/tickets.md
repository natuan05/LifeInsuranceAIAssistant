# C07 — Yêu cầu hỗ trợ

[Quay lại menu](../menu.md) · [Tiến độ và gap](../implementation-status.md)

> Phạm vi UI cho MVP; tạo Ticket thủ công được bổ sung theo trao đổi, chưa có implementation.

Đối chiếu 30/10/2026: chưa có UI/API nghiệp vụ tương ứng. WebSocket hiện có chỉ invalidation account/profile/assignment; không hoàn thành chat, Ticket hoặc notification. Các bước dưới là phạm vi dự kiến.

## 1. Mục đích

Customer tự tạo Ticket hoặc dùng bản AI tóm tắt từ chat; xem lại/xác nhận và theo dõi yêu cầu đã gửi.

## 2. Thành phần hiển thị

- Danh sách mã Ticket, tiêu đề, ngày tạo và trạng thái; nút **Tạo yêu cầu mới**.
- Form: **Tiêu đề**, **Nội dung yêu cầu**, **Hợp đồng liên quan** nếu có; không bắt buộc có hội thoại.
- Bản xem lại với nút **Xác nhận gửi** và **Quay lại chỉnh sửa**.
- Chi tiết có nội dung đã xác nhận, Staff phụ trách nếu có, trạng thái và nút **Mở hội thoại** khi có liên kết được phép xem.

## 3. Chức năng và thao tác

1. **Tạo bằng tay:** Bấm Tạo yêu cầu mới, điền form, xem lại rồi xác nhận gửi. Luồng này không cần Agent hoạt động.
2. **Tạo từ chat:** AI chuẩn bị bản nháp; Customer xem/sửa rồi xác nhận. Xem [Chat](chat.md).
3. Core xác thực, kiểm quyền, xác nhận và chống trùng; lưu Ticket + outbox rồi mới trả mã Ticket.
4. Customer mở chi tiết để theo dõi. Ticket thủ công không gắn chat thì chưa có nút tiếp quản cuộc trò chuyện; không tạo hội thoại giả.

MVP dùng cùng luồng xem/theo dõi/tiếp nhận cho hai cách tạo. Workflow hoàn tất/đóng/phản hồi Ticket không thuộc phạm vi trang này.

## 4. Trạng thái

- Chưa có Ticket; form thiếu nội dung; đang gửi; gửi thành công; lưu thất bại.
- Không rõ kết quả sau timeout: tra cứu lần gửi cũ trước khi cho gửi lại.
- Ticket đã lưu nhưng thông báo lỗi: vẫn hiển thị Ticket đã ghi nhận.
- Nội dung chưa xác nhận chỉ là bản nháp; đổi nội dung phải xem lại/xác nhận lại.

## 5. Checklist

- [ ] Có form thủ công, xem lại/xác nhận và kiểm tra trường bắt buộc.
- [ ] Tạo thủ công vẫn dùng được khi Agent lỗi; không bắt buộc liên kết chat.
- [ ] Danh sách/chi tiết đúng quyền; lưu Ticket và chống trùng do Core thực thi.
- [ ] Phân biệt yêu cầu đã ghi nhận với Staff đã tiếp nhận cuộc chat.

