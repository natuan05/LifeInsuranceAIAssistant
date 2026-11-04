# Staff — Thông báo hỗ trợ

[Chỉ mục](../README.md) · [Inbox](03-inbox-contract.md) · [API](00-staff-contract.md#api-theo-chức-năng) · [I06](inbox/06-realtime-routing.md)

Cập nhật **04/11/2026**: I06 đã có notification handoff local, API A27/A28, nút Notifications trong Inbox và realtime invalidation. Notification Ticket và read marker transcript vẫn chưa triển khai.

## Runtime

- Customer xác nhận yêu cầu Staff: handoff/consent + outbox commit trước. Worker chỉ tạo một Notification HANDOFF_REQUESTED cho recipient hiện hành khi request vẫn pending; title generic, body null, không preview chat AI.
- Staff Accept: transaction ghi acceptance/grant/controller và một SYSTEM trong chính transcript Customer–Staff, thông báo đã tiếp nhận/sẽ phản hồi sớm nhất. Đây không phải Notification recipient Customer hoặc Ticket.
- A27 `GET /api/v1/staff/notifications?limit=20&cursor=...`: limit1–50, scope trước keyset createdAt/id, không counts hoặc unread badge Inbox. Notification đã mất quyền không xuất hiện.
- A28 `POST /api/v1/staff/notifications/:notificationId/read`, body `{}` và CSRF: chỉ recipient còn quyền target, idempotent. Đọc không Accept chat/Ticket hoặc đánh dấu tin đã đọc.
- Nút Notifications mở list, Refresh/tải thêm, Read/Unread và Open request. Click đánh dấu đọc rồi mở route; A09 recheck gate, pending vẫn không transcript. Escape/Close trả focus về nút mở.
- WebSocket chỉ phát eventId/resource tối thiểu, recheck session/grant ngay trước send. Reconnect/visible/online dùng REST resync; không auth/me theo từng message. Worker local một Core process, lease/retry/dedup; PUBLISHED không là delivered/read ACK.

## Checklist

- [x] Handoff notification tách Ticket; SYSTEM sau Accept đúng transaction/gate.
- [x] A27/A28 + UI, scope-before-page, cursor actor-bound và CSRF/idempotent read.
- [x] Pending không nhận transcript/preview/sequence; reassignment/session revoke giữ REST/WS cùng quyền.
- [x] Core và browser/gateway E2E retry/reconnect/130 tin backlog/thu hồi quyền; không F5.
- [ ] Notification Ticket I07; Customer notification center và A13 read marker riêng.
- [ ] Benchmark/SLA, fanout đa replica/cloud/broker; không suy từ baseline local.

## Phase triển khai

[NO01 — Recipient/API](notifications/01-recipient-read-api.md) và [NO02 — UI/realtime](notifications/02-center-realtime-ui.md) mô tả phần handoff đã E; [TK05 — Ticket events](tickets/05-notification-events.md) vẫn P. Không Customer recipient, read receipts hoặc counts từ notification.

## API và routes của chức năng

Bảng truy vết Axx được chuyển từ tài liệu tổng hợp; E/P giữ theo runtime, DTO/quyền/luồng/test chi tiết do các phase của chức năng sở hữu. Không thêm endpoint từ việc gom tài liệu.

| ID | Method/path | Phạm vi |
| --- | --- | --- |
| A27 E | GET /staff/notifications | Handoff recipient + current metadata scope trước keyset; limit/cursor, không counts |
| A28 E | POST /staff/notifications/:notificationId/read | Read notification idempotent; không tự nhận Ticket/takeover |

## Phần còn lại theo chức năng

| ID | Phần còn lại | Phase sở hữu |
| --- | --- | --- |
| G07 | Handoff notifications E, Ticket notification chưa nối | [NO01/02](06-notifications-contract.md) baseline; [TK05](tickets/05-notification-events.md) tiếp theo. Không read receipt/Customer center mặc định |
