# Staff — Thông báo hỗ trợ

[Chỉ mục](../README.md) · [Inbox](03-inbox-contract.md) · [API](00-staff-contract.md#api-theo-chức-năng) · [I06](inbox/06-realtime-routing.md)

Cập nhật **05/11/2026**: I06 handoff và TK05 Ticket notification đã có, A27/A28 union target, một chuông tại toolbar chung Staff Workspace với badge số lượng chưa đọc, hỗ trợ đánh dấu đã đọc từng mục tại chỗ hoặc tất cả, tích hợp cảnh báo bảo mật đổi mật khẩu, và WS invalidation. Producer tạo Ticket từ Agent và read marker transcript chưa triển khai.

## Truy vết data model và vị trí code theo phase

Mỗi phase dưới đây có bảng cột/đọc–ghi/FK/version, migration, transaction và mức ảnh hưởng chi tiết; xem mục **Data model và phạm vi ảnh hưởng** và bảng **Vị trí code** trong phase. Hiện có file không đồng nghĩa mọi thay đổi dự kiến trong file đã được triển khai. Các phần P giữ P.

| Phase sở hữu | Bảng/dữ liệu chính và thao tác | Code cần rà từ root repo | Mức ảnh hưởng khi sửa |
| --- | --- | --- | --- |
| [NO01 — Notification recipient/read](notifications/01-recipient-read-api.md) | staff_assignments + customer_profiles + staff_profiles (Đọc); notifications (Đọc); conversations + conversation_handoffs (Đọc); support_tickets (Đọc); notifications (POST read cập nhật is_read) | [apps/core/src/notifications/notifications.service.ts](<../../../../apps/core/src/notifications/notifications.service.ts>); [apps/core/src/notifications/notifications.controller.ts](<../../../../apps/core/src/notifications/notifications.controller.ts>) | Cao — Handoff và Ticket notifications |
| [NO02 — Notification UI và realtime](notifications/02-center-realtime-ui.md) | notifications (Đọc); conversations + conversation_handoffs (Đọc); support_tickets (Đọc); notifications (POST read cập nhật is_read) | [apps/web/src/components/staff-notifications.tsx](<../../../../apps/web/src/components/staff-notifications.tsx>); [apps/web/src/lib/realtime.ts](<../../../../apps/web/src/lib/realtime.ts>) | Cao — Inbox và Tickets header |

Không tự áp dụng DDL khi triển khai UI, không biến model dự kiến thành hiện trạng, không reset seed/volume để né lỗi FK. Các dependency xuyên vai trò và operator xem [Data Model](../../../specifications/Data_Model.md#iii-bản-đồ-tác-động-khi-triển-khai-chức-năng).

## Runtime

- Customer xác nhận yêu cầu Staff: handoff/consent + outbox commit trước. Worker chỉ tạo một Notification HANDOFF_REQUESTED cho recipient hiện hành khi request vẫn pending; title generic, body null, không preview chat AI.
- Staff Accept: transaction ghi acceptance/grant/controller và một SYSTEM trong chính transcript Customer–Staff, thông báo đã tiếp nhận/sẽ phản hồi sớm nhất. Đây không phải Notification recipient Customer hoặc Ticket.
- A27 `GET /api/v1/staff/notifications?limit=20&cursor=...`: limit1–50, scope trước keyset createdAt/id. Client tính unread count badge trên chuông toolbar từ danh sách loaded (+1 nếu có khuyến nghị đổi mật khẩu chưa ẩn). Notification đã mất quyền không xuất hiện.
- A28 `POST /api/v1/staff/notifications/:notificationId/read`, body `{}` và CSRF: chỉ recipient còn quyền target, idempotent. Đọc không Accept chat/Ticket hoặc đánh dấu tin đã đọc.
- Nút Notifications mở list/tải thêm, Read/Unread và Open request/Open ticket. Chuông có badge đếm số lượng chưa đọc (đỏ, `9+` nếu > 9). Hỗ trợ đánh dấu đọc từng mục qua nút checkmark tại chỗ ("Mark as read") và nút "Mark all as read" trên header popover. Khuyến nghị đổi mật khẩu được tích hợp thành Security Notice trong popover với nút "Change password now" và "Dismiss" (lưu sessionStorage). Không Refresh thường trực; Try again khi lỗi. Click item đánh dấu đọc rồi mở route; A09 recheck gate, pending vẫn không transcript. Escape/Close trả focus về nút mở.
- WebSocket chỉ phát eventId/resource tối thiểu, recheck session/grant ngay trước send. Reconnect/visible/online dùng REST resync; không auth/me theo từng message. Worker local một Core process, lease/retry/dedup; PUBLISHED không là delivered/read ACK.

## Checklist

- [x] Handoff notification tách Ticket; SYSTEM sau Accept đúng transaction/gate.
- [x] A27/A28 + UI, scope-before-page, cursor actor-bound và CSRF/idempotent read.
- [x] Pending không nhận transcript/preview/sequence; reassignment/session revoke giữ REST/WS cùng quyền.
- [x] Core và browser/gateway E2E retry/reconnect/130 tin backlog/thu hồi quyền; không F5.
- [x] TK05 Ticket consumer/notification/realtime đã có; TICKET_ACCEPTED emitter TK03.
- [ ] I07 producer TICKET_CREATED từ Customer confirmation hợp lệ — phụ thuộc nhánh Agent.
**Phần mở rộng ngoài mốc Staff local:** Customer notification center/A13 read marker theo contract Customer riêng; benchmark/SLA, fanout đa replica/cloud/broker chỉ triển khai khi được chọn. Không coi các mục này là chức năng Staff local còn thiếu.

## Phase triển khai

[NO01 — Recipient/API](notifications/01-recipient-read-api.md) và [NO02 — UI/realtime](notifications/02-center-realtime-ui.md) mô tả phần handoff đã E; [TK05 — Ticket events](tickets/05-notification-events.md) đã E; nguồn tạo I07 còn P. Không Customer recipient, read receipts hoặc counts từ notification.

## API và routes của chức năng

Bảng truy vết Axx được chuyển từ tài liệu tổng hợp; E/P giữ theo runtime, DTO/quyền/luồng/test chi tiết do các phase của chức năng sở hữu. Không thêm endpoint từ việc gom tài liệu.

| ID | Method/path | Phạm vi |
| --- | --- | --- |
| A27 E | GET /staff/notifications | Handoff metadata scope hoặc Ticket recipient+assignment trước keyset; target CONVERSATION/TICKET, không counts |
| A28 E | POST /staff/notifications/:notificationId/read | Read notification idempotent; không tự nhận Ticket/takeover |

## Phần còn lại theo chức năng

| ID | Phần còn lại | Phase sở hữu |
| --- | --- | --- |
| G07 | Handoff/Ticket notifications E, I07 producer tạo Ticket chưa có | [NO01/02](06-notifications-contract.md) baseline; [TK05](tickets/05-notification-events.md) đã có. Không read receipt/Customer center mặc định |
