# S06 — Ticket hỗ trợ

[Chỉ mục](../README.md) · [Spec chat](inbox/00-inbox-spec.md#9-tickets-và-thông-tin-phụ-trong-đợt-làm-lại) · [API](00-staff-contract.md#api-theo-chức-năng) · [Thông báo](06-notifications-contract.md)

Đối chiếu **05/11/2026**. TK01 nền và TK02 A21/A22 read đã có; TK03 A23 Accept đã có; TK04 UI list/detail/Accept đã nối; TK05 consumer notification/realtime đã có; producer I07 còn P. Ticket tách rõ khỏi chat/handoff.

## Truy vết data model và vị trí code theo phase

Mỗi phase dưới đây có bảng cột/đọc–ghi/FK/version, migration, transaction và mức ảnh hưởng chi tiết; xem mục **Data model và phạm vi ảnh hưởng** và bảng **Vị trí code** trong phase. Hiện có file không đồng nghĩa mọi thay đổi dự kiến trong file đã được triển khai. Các phần P giữ P.

| Phase sở hữu | Bảng/dữ liệu chính và thao tác | Code cần rà từ root repo | Mức ảnh hưởng khi sửa |
| --- | --- | --- | --- |
| [TK01 — Quyền, dữ liệu và version Ticket](tickets/01-scope-model-contract.md) | staff_assignments + customer_profiles + staff_profiles (Đọc); support_tickets (Đọc) | [apps/core/prisma/schema.prisma](<../../../../apps/core/prisma/schema.prisma>); [apps/core/prisma/migrations/202611040003_ticket_foundation/migration.sql](<../../../../apps/core/prisma/migrations/202611040003_ticket_foundation/migration.sql>) | Cao — Generated client và mutations TK03 |
| [TK02 — Staff Tickets list/detail](tickets/02-staff-read-api.md) | staff_assignments + customer_profiles + staff_profiles (Đọc); support_tickets (Đọc) | [apps/core/src/tickets/controllers/staff-ticket.controller.ts](<../../../../apps/core/src/tickets/controllers/staff-ticket.controller.ts>); [apps/core/src/tickets/services/ticket.service.ts](<../../../../apps/core/src/tickets/services/ticket.service.ts>) | Cao — Staff Ticket list/detail |
| [TK03 — Nhận Ticket độc lập chat](tickets/03-accept-command.md) | staff_assignments + customer_profiles + staff_profiles (Đọc); support_tickets (Đọc); support_tickets (Ghi status và tăng version khi đổi hợp lệ); outbox_events (Thêm trong transaction nguồn; worker cập nhật trạng thái/lease) | [apps/core/src/tickets/controllers/staff-ticket.controller.ts](<../../../../apps/core/src/tickets/controllers/staff-ticket.controller.ts>); [apps/core/src/tickets/services/ticket.service.ts](<../../../../apps/core/src/tickets/services/ticket.service.ts>) | Cao — Staff Ticket list/detail |
| [TK04 — Staff Tickets UI](tickets/04-list-detail-ui.md) | staff_assignments + customer_profiles + staff_profiles (Đọc); support_tickets (Đọc); support_tickets (Ghi gián tiếp qua TK03) | [apps/web/src/components/staff-tickets.tsx](<../../../../apps/web/src/components/staff-tickets.tsx>); [apps/web/src/lib/ticket-api.ts](<../../../../apps/web/src/lib/ticket-api.ts>) | Cao — Đổi view không reload trang |
| [TK05 — Ticket notification và invalidation](tickets/05-notification-events.md) | staff_assignments + customer_profiles + staff_profiles (Đọc); support_tickets (Đọc); notifications (Đọc); outbox_events (Thêm trong transaction nguồn; worker cập nhật trạng thái/lease) | [apps/core/src/tickets/services/ticket-event.service.ts](<../../../../apps/core/src/tickets/services/ticket-event.service.ts>); [apps/core/src/outbox/services/outbox-dispatcher.service.ts](<../../../../apps/core/src/outbox/services/outbox-dispatcher.service.ts>) | Cao — Ticket created/accepted/status notifications |
| [I07 — Ticket riêng và liên kết với Inbox](tickets/06-agent-confirmation.md) | staff_assignments + customer_profiles + staff_profiles (Đọc); conversations + conversation_handoffs (Đọc); support_tickets (Đọc); TicketDraft / confirmed snapshot — P, chưa có bảng/cột (DDL + ghi dự kiến, chưa triển khai); outbox_events (Thêm trong transaction nguồn; worker cập nhật trạng thái/lease) | `apps/core/src/tickets/controllers/customer-ticket.controller.ts` — P; `apps/core/src/tickets/services/ticket-draft.service.ts` — P | Cao — Customer review, service identity Agent |

Không tự áp dụng DDL khi triển khai UI, không biến model dự kiến thành hiện trạng, không reset seed/volume để né lỗi FK. Các dependency xuyên vai trò và operator xem [Data Model](../../../specifications/Data_Model.md#iii-bản-đồ-tác-động-khi-triển-khai-chức-năng).

## Ranh giới đã chốt

- Ticket là nhánh **Agent gợi ý tạo → Customer xem/xác nhận → Core tạo**. Yêu cầu Staff/Direct/Accept chat không bắt buộc và không tự tạo Ticket.
- TicketStatus OPEN/ASSIGNED/IN_PROGRESS/RESOLVED/CLOSED là trạng thái Ticket. Chat không có nghiệp vụ Closed; ConversationStatus đã bỏ CLOSED qua migration mới, không thay TicketStatus.
- Ticket có thể liên kết Conversation hoặc không; đọc/accept/close Ticket không tự cấp quyền transcript, nhận chat hoặc thay mode chat. Biết conversationId vẫn phải Direct/Accept gate ở Core.
- Tickets là trang riêng; không nhét list vào accordion chat/Customers. Form Ticket thủ công của kế hoạch MVP cũ để backlog riêng, không triển khai trong đợt Inbox đang chốt.

## Model và contract còn thiếu

Schema có title/aiSummary/extractedDetails/idempotencyKey/confirmedAt và các liên kết, chưa có contract content/source/version đủ cho toàn workflow. AI summary không phải nguyên văn đã xác nhận. Actor/ownership/xác nhận/chống trùng và Ticket+outbox atomic do Core thực thi, chỉ báo thành công sau commit. Delivery lỗi không xóa Ticket.

Yêu cầu người dùng05/11 đã mở lifecycle resolve/close/reopen Ticket; không thêm phản hồi/Claim/payment. PATCH status và dropdown đã có theo TK03/TK04; đóng Ticket không đóng chat.

## Checklist

- [x] Ghi ranh giới Ticket khác yêu cầu Staff/quyền chat.
- [x] Có kế hoạch AI draft/confirmation/content/source/version/idempotency ở I07; các đề xuất vẫn cần review trước code, chưa có runtime.
- [x] A21/A22 Core list/detail đúng quyền, session/cursor/quota/projection và HTTP tests TK02.
- [x] TK04 UI list/detail/Accept, URL/error/reconcile/no-F5, browser mock và E2E thật.
- [x] A23 TK03 Accept Ticket độc lập, CAS/version/replay/audit/outbox; không grant chat. Notification thuộc TK05.
- [x] TK02/TK03/TK04: Ticket link không bypass transcript; browser unknown outcome/retry không POST tự động.
- [x] TK05: delivery/notification retry/dedup đúng quyền, WS/catch-up và browser hai tab thật.

## Kế hoạch Staff trước Agent — nguồn contract Staff hiện hành

Nhánh đọc/tiếp nhận **có thể triển khai trước Agent** theo [TK01](tickets/01-scope-model-contract.md) → [TK02 read](tickets/02-staff-read-api.md) → [TK03 accept](tickets/03-accept-command.md) → [TK04 UI](tickets/04-list-detail-ui.md) → [TK05 events](tickets/05-notification-events.md). TK01 đã triển khai nền version/policy/legacy projection; TK02 đã có read API; TK03 A23 Accept đã có; TK04 UI đã nối; TK05 consumer events đã E; I07 producer tạo riêng còn P. Quyền đã chốt active assignment **và** Ticket recipient chính Staff; không unassigned/global OPEN queue. Staff khóa mất quyền; Customer khóa vẫn được phục vụ, không mở grant chat.

Schema SupportTicket hiện đã có version Int default0/CHECK nonnegative từ TK01 (migration202611040003_ticket_foundation); chưa updatedAt/confirmedContent/sourceDraftId. Immutable confirmed snapshot/draft do I07 sau này. Legacy confirmedAt không chứng minh aiSummary/extractedDetails là nguyên văn Customer xác nhận: detail ghi LEGACY_UNVERIFIED và confirmedContent=null, không backfill giả.

Nguồn tạo Ticket từ Agent/Customer confirmation vẫn do [I07](tickets/06-agent-confirmation.md) cùng Customer T01/T02 sở hữu. Không endpoint tạo Ticket giả, không nhét seed cá nhân vào bootstrap; fixture test không chứng minh Agent. SRS nguồn chưa yêu cầu toàn workflow xử lý→hoàn tất→phản hồi; người dùng05/11 chọn bổ sung status resolve/close/reopen ở TK03, không thêm phản hồi/Claim/payment.

## API và routes của chức năng

Bảng truy vết Axx được chuyển từ tài liệu tổng hợp; E/P giữ theo runtime, DTO/quyền/luồng/test chi tiết do các phase của chức năng sở hữu. Không thêm endpoint từ việc gom tài liệu.

| ID | Method/path | Phạm vi |
| --- | --- | --- |
| A21 E | GET /staff/tickets | [TK02](tickets/02-staff-read-api.md): recipient+assignment, literal search/status/customerId, HMAC cursor, không counts; quota chung120/phút |
| A22 E | GET /staff/tickets/:ticketId | [TK02](tickets/02-staff-read-api.md): legacy projection/version/capability, policy tối thiểu; chatLink qua gate riêng |
| TK03 status E | PATCH /staff/tickets/:ticketId/status | Lifecycle/version/CSRF/recipient+assignment, resolve/close/reopen theo [TK03 mục7](tickets/03-accept-command.md#7-mở-rộng-lifecycle-do-người-dùng-chốt--05112026) |
| A23 E | POST /staff/tickets/:ticketId/accept | [TK03](tickets/03-accept-command.md): version/atomic/reconcile; không cấp grant transcript hoặc thay A11 |

| Route | Trạng thái |
| --- | --- |
| /staff/tickets | **E**, TK04 đã nối A21 list |
| /staff/tickets/:ticketId | **E**, TK04 đã nối A22 detail/A23 Accept |

## Phần còn lại theo chức năng

| ID | Phần còn lại | Phase sở hữu |
| --- | --- | --- |
| G04 | Inbox I01–I06 E; Staff Ticket read A21/A22 E; Accept A23 E; TK04 UI E; TK05 consumer events E | TK01–TK05 đã có; I07 tạo Ticket riêng còn P |
