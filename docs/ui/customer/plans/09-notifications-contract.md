# C09 — Customer notification center: chốt phạm vi riêng

04/11/2026 · **Đề xuất mở rộng, chưa vào đường triển khai bắt buộc** · C09 · [Chung](00-customer-contract.md).

## 1. Căn cứ và baseline

FR-013 là System→Staff khi có conversation/Request mới, không quy định Customer notification center. Customer đã nhận realtime chat/SYSTEM sau Staff Accept từ I06; đó không phải Notification row Customer. Model Notification chỉ recipientStaffId; không giả Customer là Staff hoặc dùng isRead của notification làm đã đọc tin nhắn.

| Phase | Kết quả | Gate |
| --- | --- | --- |
| [N01](notifications/01-scope-recipient-contract.md) | Quyết định có làm center không, events/recipient/retention/model | Chốt phạm vi sản phẩm trước API/UI |
| [N02](notifications/02-conditional-center.md) | Core/UI center tối thiểu nếu N01 được chốt làm | Schema/recipient/producer đã rõ, không tự bật |

## 2. Phạm vi loại trừ

Không đưa read receipts/typing/unread counts vào Inbox Staff; không email/push provider hoặc SLA chưa đo. Có thể giữ chỉ cập nhật trạng thái ngay trong chat để MVP gọn; nếu chọn cách đó dừng N02 và không đánh dấu Customer center là thiếu FR-013.

- [ ] N01 ghi quyết định và danh sách event cần giữ thật.
- [ ] Chỉ khi chốt làm mới triển khai N02, recipient/security/dedup/retention/tests tương ứng.

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
