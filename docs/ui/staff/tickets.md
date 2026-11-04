# S06 — Ticket hỗ trợ: danh sách và chi tiết

[Chỉ mục Staff](README.md) · [Tiến độ](../implementation-status.md) · [Bản đồ API](api-map.md) · [Khoảng trống](gap-review.md)

Đối chiếu 30/10/2026. Căn cứ: FR-009/010; UC-005; NFR-005; Ticket thủ công là bổ sung menu MVP. API P và đường dẫn UI chưa có chỉ là đề xuất.


## Hiện trạng 30/10/2026 — Khung route/trạng thái chưa kết nối; A21–23 chưa có

- [x] `/staff/tickets` và `/staff/tickets/:ticketId` riêng, không dùng danh sách khách làm Ticket.
- [x] Bỏ thẻ/số đếm Ticket giả; chưa hiển thị thành công nghiệp vụ.
- [ ] Bảng list/filter/pagination và detail thật A21–22.
- [ ] Accept A23, liên kết takeover A11, Ticket không chat và retry/concurrency.
- [ ] Nội dung khách xác nhận/provenance/manual-vs-AI, confirmation/idempotency/Ticket+outbox ở Core.

Các phần yêu cầu bên dưới mô tả đích triển khai; chỉ các dòng `[x]` là đã làm.

## Thành phần

Tickets cần danh sách thực với ticketCode/title/Customer/createdAt/status/assignee, phân trang/tìm kiếm/lọc; chọn một Ticket mở chi tiết. Không dùng danh sách khách thay Ticket và không hard-code count. Một khách có nhiều Ticket.

Chi tiết gồm nội dung khách xác nhận và confirmedAt, hợp đồng/conversation liên quan nếu có, nguồn tạo, aiSummary ở phần riêng. Không bắt buộc Ticket tự điền có conversation hoặc tóm tắt AI. Thẻ proposal trong chat chưa đồng nghĩa Ticket đã commit.

## Thao tác và API

- Danh sách, filter theo khách hoặc mở từ notification: A21 P; chi tiết A22 P.
- Tiếp nhận: A23 P. Nếu Ticket là handoff, cần Core đảm bảo nhất quán với A11; chỉ sau thành công mới mở quyền composer và thông báo Customer theo kế hoạch MVP.
- Ticket không chat: nhận yêu cầu theo quy tắc cần chốt, không tự tạo cuộc chat/takeover. “Mở hội thoại” chỉ hiện nếu có liên kết và đủ quyền.
- Giữ nguyên nội dung Customer đã duyệt; summary Copilot mới không ghi đè. Staff không thay Customer xác nhận/tạo Ticket từ gợi ý chưa duyệt.

## Trạng thái riêng / checklist

- [ ] OPEN/ASSIGNED/IN_PROGRESS cần mapping hành động được duyệt; RESOLVED/CLOSED có thể đọc dữ liệu lịch sử, chưa cung cấp workflow đóng/hoàn tất/phản hồi.
- [ ] Đã nhận bởi người khác/mất assignment/version stale → chặn và tải lại trạng thái.
- [ ] Nhận bị timeout → kiểm lại trước retry; thông báo lỗi không biến Ticket đã lưu thành thất bại.
- [ ] Phân biệt aiSummary/extractedDetails với nội dung xác nhận. Model cho Ticket thủ công cần rà content/source trước DTO.

## Yêu cầu trạng thái khi triển khai đầy đủ

Đang tải, danh sách rỗng/không có kết quả, lỗi có nút thử lại. Phiên hết hạn chuyển đăng nhập; mất phân công/không còn quyền xóa dữ liệu riêng đang mở và tải lại scope. Không lấy quyền từ state client. Mọi dữ liệu mẫu phải có nhãn mô phỏng; chỉ báo thao tác thật thành công sau phản hồi Core.
