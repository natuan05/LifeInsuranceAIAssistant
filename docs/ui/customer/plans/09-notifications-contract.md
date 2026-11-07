# C09 — Customer notification center: chốt phạm vi riêng

04/11/2026 · **Đề xuất mở rộng, chưa vào đường triển khai bắt buộc** · C09 · [Chung](00-customer-contract.md).

## 1. Căn cứ và baseline

FR-013 là System→Staff khi có conversation/Request mới, không quy định Customer notification center. Customer đã nhận realtime chat/SYSTEM sau Staff Accept từ I06; đó không phải Notification row Customer. Model Notification chỉ recipientStaffId; không giả Customer là Staff hoặc dùng isRead của notification làm đã đọc tin nhắn.

| Phase | Kết quả | Gate |
| --- | --- | --- |
| [N01](notifications/01-scope-recipient-contract.md) | Quyết định có làm center không, events/recipient/retention/model | Chốt phạm vi sản phẩm trước API/UI |
| [N02](notifications/02-conditional-center.md) | Core/UI center tối thiểu nếu N01 được chốt làm | Schema/recipient/producer đã rõ, không tự bật |

## 2. Phạm vi và triển khai UX

Đã triển khai thành phần Toolbar Notification Center popover trong `apps/web/src/components/customer-workspace.tsx`:
- Nút chuông thông báo trên thanh toolbar với badge đếm số lượng chưa đọc.
- Popover có các mục hiển thị trong phiên client. Mục mẫu về lịch phí/Claim không là dữ liệu nghiệp vụ đã được Core xác minh hoặc bằng chứng đã triển khai workflow đó.
- Nút "Mark all as read" và đánh dấu đã đọc trực tiếp trên từng mục.
- Toàn bộ giao diện popover thông báo sử dụng 100% tiếng Anh.

Không đưa read receipts/typing/unread counts vào Inbox Staff; không email/push provider hoặc SLA chưa đo. Model notification backend phía Core hiện dành cho Staff; notification popover phía Customer hiện quản trị trạng thái trong phiên client.

- [x] Toolbar Notification Center popover phía Customer đã triển khai trong shell H01.
- [ ] N01/N02 mở rộng schema push notification lưu trữ persistent trên Core nếu được chốt tiếp.






## UX và baseline của chức năng

## Sự kiện đích

- Yêu cầu chuyển Staff đã commit: hiển thị đang chờ, không mã Ticket nếu không có Ticket thực.
- Staff Accept chat thành công: mở cùng cuộc, Staff được đọc toàn bộ lịch sử Customer-facing đã được Customer đồng ý chia sẻ.
- Ticket được tạo theo đề xuất Agent và xác nhận riêng: mã Ticket, không đồng nghĩa đã nhận chat.
- Tin Staff chưa đọc/read marker: mở rộng riêng cần yêu cầu và model, chưa nằm trong phase center tối thiểu; không thêm counts vào Inbox Staff.

Mở/đánh dấu notification không tự Accept chat/Ticket hoặc mở rộng quyền. Payload tối thiểu, tránh transcript riêng; link tới cuộc/Ticket vẫn được Core kiểm gate/ownership. Delivery/reconnect/retry không nhân đôi sự kiện hoặc làm mất yêu cầu đã commit.

## Checklist

- [ ] Spec recipient/schema/dedup/read/delivery và quyền Customer trước code.
- [ ] Tách thông báo handoff và Ticket, trạng thái đúng sau commit.
- [ ] Không tự mở transcript hoặc nhận chat từ thao tác đọc notification.
- [ ] Offline/reconnect và link hết quyền an toàn; chưa SLA được đo.
