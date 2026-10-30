# S07 — Thông báo và công việc chưa đọc

[Chỉ mục Staff](README.md) · [Tiến độ](../implementation-status.md) · [Bản đồ API](api-map.md) · [Khoảng trống](gap-review.md)

Đối chiếu 30/10/2026. Căn cứ: FR-013, NFR-005/006; tin chưa đọc và thông báo Customer là bổ sung menu MVP. API P và đường dẫn UI chưa có chỉ là đề xuất.


## Hiện trạng 30/10/2026 — Chưa triển khai UI/API notification

- [ ] Chuông/list/unread/read A27–28; transcript read A13 riêng.
- [ ] Outbox delivery/dedup/replay/recipient và link đúng quyền.
- [ ] Customer recipient cần thiết kế thêm, không suy ra từ model Staff hiện có.
- [ ] Kiểm thử độ trễ theo workload; socket invalidation hồ sơ không hoàn thành S07.

Các phần yêu cầu bên dưới mô tả đích triển khai; chỉ các dòng `[x]` là đã làm.

## Thành phần

Thêm chuông ở header chung, unreadCount và danh sách title/body/thời gian/dấu đọc; item mở Ticket/chat đúng ID. Toast chỉ là phản hồi thao tác, không thay lịch sử notification bền vững.

## Thao tác và API

| Thao tác/sự kiện | API / kết quả |
| --- | --- |
| Tải danh sách/số chưa đọc, phân trang | A27 P, đúng recipient; không trả mọi Staff |
| Click item/đánh dấu đọc | A28 P; mở A09 hoặc A22 và kiểm lại quyền; không tự nhận Ticket |
| Đang đọc chat | A13 P cho transcript, độc lập notification.isRead |
| Ticket commit hoặc handoff cần Staff | Core/outbox phát sau transaction; dedup cùng lần chuyển giao |
| Tin Customer chưa đọc | Bổ sung MVP; không phát lặp khi đang đọc; chốt quy tắc recipient/read marker |

Kênh native WebSocket invalidation account/profile/assignment đã có. Transport/events/replay cho thông báo nghiệp vụ chưa chốt; không mặc định Socket.IO. Khi reconnect, tải bù REST bằng event/mốc ổn định và đồng bộ count; không dựa vào toast hoặc một event đã nhận để xác nhận trạng thái business.

## Trạng thái riêng / checklist

- [ ] Có/không thông báo, lỗi tải, đang đồng bộ, đã đọc/chưa đọc; timestamp không gán từ giờ client.
- [ ] Link không còn quyền/tài nguyên không có trả thông điệp an toàn; sự kiện không rò dữ liệu khi chuyển phân công.
- [ ] Notification delivery lỗi: Ticket vẫn lưu, có thể mở từ S06; retry không tạo nhiều item trùng.
- [ ] Mốc 5 giây trong NFR-006 là mục tiêu thử nghiệm có workload, không hiển thị thành SLA đã đạt.

## Yêu cầu trạng thái khi triển khai đầy đủ

Đang tải, danh sách rỗng/không có kết quả, lỗi có nút thử lại. Phiên hết hạn chuyển đăng nhập; mất phân công/không còn quyền xóa dữ liệu riêng đang mở và tải lại scope. Không lấy quyền từ state client. Mọi dữ liệu mẫu phải có nhãn mô phỏng; chỉ báo thao tác thật thành công sau phản hồi Core.
