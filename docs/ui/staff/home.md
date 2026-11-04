# S02 — Tổng quan và hàng đợi

[Chỉ mục Staff](README.md) · [Tiến độ](../implementation-status.md) · [Bản đồ API](api-map.md) · [Khoảng trống](gap-review.md)

Đối chiếu 30/10/2026. Căn cứ: FR-006/010/013; menu MVP. API P và đường dẫn UI chưa có chỉ là đề xuất.


## Hiện trạng 30/10/2026 — Khung UI; chưa có hàng đợi nghiệp vụ

- [x] Sidebar All/Requests/Active/New và URL filter mở được Inbox.
- [x] Vùng giữa sidebar/chat là chỗ dành cho danh sách hội thoại, không phải danh sách khách.
- [ ] A07–10/count/search/pagination và trạng thái hàng đợi thật.
- [ ] Chốt nghĩa New; hiện chưa ánh xạ nó thành AI_ACTIVE.

Các phần yêu cầu bên dưới mô tả đích triển khai; chỉ các dòng `[x]` là đã làm.

## Thành phần

Sidebar của mẫu + vùng danh sách bên trái chat là trang vào công việc, không cần tạo dashboard mới. Hiển thị số yêu cầu đang chờ, cuộc đang hỗ trợ và Ticket cần tiếp nhận trong phạm vi phân công; mỗi item mở đúng conversationId/ticketId. Tổng quan hai danh sách là lựa chọn từ menu MVP, không một yêu cầu analytics mới của SRS.

## Thao tác và API

- Tải badge/count: A07 P (có thể tổng hợp từ lists nếu chốt như vậy).
- Đổi All/Requests/Active, tìm kiếm, phân trang: A08 P; không đồng nhất New với trạng thái AI khi chưa duyệt.
- Mở cuộc chat: A09–10 P → S05. Mở Ticket: A21–22 P → S06. Badge Tickets không hard-code.
- Requests là handoff pending, không phải danh sách mọi Ticket. Mở xem không tự nhận công việc.
- Bổ sung 31/10: Requests tiếp nhận cả Customer chủ động yêu cầu Staff và yêu cầu do Agent gợi ý được khách đồng ý/xác nhận gửi. Chỉ xuất hiện sau Core commit yêu cầu; Agent gợi ý nhưng khách chưa đồng ý không thêm item/count. Hai nhánh dùng cùng quy tắc chống trùng, không tạo hai công việc cho một lần chuyển giao. Luồng này chưa triển khai; xem [Customer chat](../customer/chat.md#6-chuyển-từ-agent-sang-staff--yêu-cầu-31102026).

## Trạng thái riêng / checklist

- [ ] Không có việc cần nhận là trạng thái hợp lệ; count có thể đổi, không báo sai lỗi.
- [ ] Đổi filter/tìm kiếm không giữ kết quả cũ như còn thuộc bộ lọc mới; phân trang ổn định.
- [ ] Nếu item vừa được nhận/thu hồi quyền, cập nhật danh sách/count từ Core, không giả định thao tác thành công.

## Yêu cầu trạng thái khi triển khai đầy đủ

Đang tải, danh sách rỗng/không có kết quả, lỗi có nút thử lại. Phiên hết hạn chuyển đăng nhập; mất phân công/không còn quyền xóa dữ liệu riêng đang mở và tải lại scope. Không lấy quyền từ state client. Mọi dữ liệu mẫu phải có nhãn mô phỏng; chỉ báo thao tác thật thành công sau phản hồi Core.
