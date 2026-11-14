# N01 — Customer notification scope, recipient và retention

**Phương án A xác nhận 13/11/2026:** chat và Notification Center cùng phục vụ Customer, theo quyết định 08/11. [C09](../09-notifications-contract.md) · [N02](02-conditional-center.md).

## 1. Phạm vi đã duyệt

Customer có notification persisted cho STAFF_ACCEPTED_HANDOFF, SUPPORT_TICKET_CREATED và STAFF_MESSAGE_UNREAD. Chat giữ SYSTEM/realtime và message read status. Staff có CUSTOMER_MESSAGE_UNREAD theo cơ chế đối xứng hiện có.

Recipient Customer lấy từ owner của conversation/Ticket do Core kiểm soát. Staff recipient tiếp tục theo assignment/Ticket policy và transcript gate. Target được kiểm quyền khi mở, notification không tự tạo quyền với tài nguyên.

Nội dung generic như “Nhân viên đã tiếp nhận yêu cầu chat”, “Phiếu hỗ trợ đã được tạo”, “Bạn có tin nhắn mới từ nhân viên hỗ trợ”. Không chép transcript, thông tin sức khỏe, CCCD hoặc số tiền chi trả vào title/body/WS event.

## 2. Data model và migration hiện có

| Bảng/cột | Quan hệ và cách dùng |
| --- | --- |
| notifications.recipient_customer_id | Nullable FK tới **business.customer_profiles(user_id)** |
| notifications.recipient_staff_id | Nullable FK StaffProfile hiện có |
| notifications_recipient_check | Đúng một recipient Customer hoặc Staff có giá trị |
| notifications.kind/target/dedup_key/is_read/created_at | Allowlist kind, target conversation hoặc Ticket, unique dedup và keyset |
| messages.read_at | Timestamptz nullable; trạng thái đã xem của đối phương |
| outbox_events | Event cùng transaction nghiệp vụ, claim/retry/lease |

Migration `202611080001_customer_notifications_and_read_status` thêm recipient Customer/read_at; `202611090001_customer_message_unread_for_staff` thêm kind unread phía Staff. N01 sử dụng model Notification chung đã có trong source.

Mức ảnh hưởng cao ở FK/constraints, producer/consumer, privacy và scope cả hai role. Bổ sung schema sau này cần migration riêng, giữ rows và constraints hợp lệ hiện có.

## 3. Gộp thông báo và trạng thái đọc

**Phương án A đã duyệt 13/11/2026:** thông báo tin nhắn gộp theo recipient/cuộc/kind trong chu kỳ người nhận chưa đọc chat, áp dụng cho cả Customer và Staff. Đọc từng mục hoặc read-all trên chuông chỉ đổi Notification.isRead, không kết thúc chu kỳ và không đổi Message.readAt.

Tin mới đã commit trong cùng chu kỳ cập nhật notification cũ, giữ nguyên id và bật lại isRead=false, kể cả mục đó đã được đánh dấu đọc trên chuông. Khi người nhận đọc hội thoại qua API hợp lệ, chu kỳ kết thúc tại mốc tin đã đọc; tin mới sau mốc này mở chu kỳ mới. Retry cùng event không được tự bật unread hoặc làm mới thời gian hoạt động nếu không có tin mới.

Source hiện tìm notification bằng isRead=false nên có thể tạo dòng mới sau thao tác đọc chuông; chưa khớp phương án A. Cần nhận diện chu kỳ/mốc đã đọc bền vững và xử lý đồng thời theo N02; không tự coi isRead là khóa chu kỳ hoặc coi schema hiện có đã đủ. Nếu notification cũ đã bị cleanup, chỉ tin mới hợp lệ mới có thể tạo lại mục, không tái tạo từ event cũ.

## 4. Retention

Quyết định 13/11/2026: notification của cả Customer và Staff có created_at cũ hơn 30 ngày thuộc diện xóa, không phân biệt đã đọc/chưa đọc. Không cần policy retention riêng theo role. Ticket/Message nguồn và audit nghiệp vụ giữ lifecycle riêng. Retention hiện tính theo created_at; việc gộp unread đang cập nhật created_at trong source nên cần kiểm mốc tuổi dữ liệu theo hành vi này.

Phương án B đã duyệt ngày 13/11/2026: NotificationsService cleanup khi Core khởi động và lặp mỗi 24 giờ trong process Core. Source hiện vẫn dùng timer mỗi giờ; N02 theo dõi đổi interval và kiểm thử trước nghiệm thu. Không bổ sung scheduler cloud gọi Core theo lịch.

## 5. Vị trí code

| Vị trí từ root repo | Trách nhiệm |
| --- | --- |
| [schema.prisma](../../../../../apps/core/prisma/schema.prisma) | Recipient, kind/target và message read_at |
| [conversation-event.service.ts](../../../../../apps/core/src/conversations/services/conversation-event.service.ts) | Handoff/message notification và routing |
| [ticket-event.service.ts](../../../../../apps/core/src/tickets/services/ticket-event.service.ts) | Ticket notification Customer/Staff |
| [notifications.service.ts](../../../../../apps/core/src/notifications/notifications.service.ts) | List/read/read-all và cleanup |
| [outbox-dispatcher.service.ts](../../../../../apps/core/src/outbox/services/outbox-dispatcher.service.ts) | Claim/dispatch/retry theo event |

## 6. Kiểm thử và trạng thái

| Mã | Ca cần kiểm | Kết quả mong đợi |
| --- | --- | --- |
| N01-T01 | Hai Customer, Staff và targets khác nhau | Không lẫn recipient hoặc cấp thêm quyền |
| N01-T02 | Event handoff/Ticket/message và retry | Generic content, dedup đúng event và unread cycle |
| N01-T03 | FK/check một recipient, legacy Staff rows | Constraints và luồng Staff tiếp tục hợp lệ |
| N01-T04 | Customer/Staff mark-read/read-all, nhận thêm tin rồi đọc chat | Tin mới cùng chu kỳ giữ id, bật lại unread; đọc chat mới kết thúc chu kỳ; retry không tự bật unread |
| N01-T05 | Customer/Staff, read/unread; created_at trước/đúng/sau cutoff 30 ngày và grouped notification | Cả hai role dùng cùng cutoff; chỉ xóa dòng cũ hơn cutoff, không xóa Ticket/Message hoặc audit |

- [x] Phạm vi, recipient, nội dung generic và retention 30 ngày chung cho Customer/Staff đã duyệt.
- [x] Cleanup khi Core khởi động và mỗi 24 giờ bằng timer nội bộ đã duyệt; code còn cần đồng bộ theo N02.
- [x] Có schema/source cho Customer và Staff notifications.
- [x] Gộp theo chu kỳ chưa đọc chat, giữ id và bật lại unread khi có tin mới đã duyệt.
- [ ] Đồng bộ nhận diện chu kỳ trong source và kiểm chứng các ca trên theo N02.

Bảo vệ PII bổ sung còn P theo [ma trận dữ liệu chung](../../../../configuration-and-data.md#customer-sensitive-data). Kiểm JSON/WS/log bằng canary synthetic, không dùng fixture popover làm bằng chứng nghiệm thu.
