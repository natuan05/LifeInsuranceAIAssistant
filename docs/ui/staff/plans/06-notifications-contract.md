# Staff — Thông báo hỗ trợ

[Chỉ mục](../README.md) · [Inbox](03-inbox-contract.md) · [API](00-staff-contract.md#api-theo-chức-năng) · [I06](inbox/06-realtime-routing.md)

Cập nhật **13/11/2026**: I06 handoff và TK05 Ticket notification đã có, A27/A28 union target, chuông Staff với badge theo danh sách đã tải, read/read-all và WS invalidation. Source cũng có Customer center và message read marker; review DTO/event/read-cycle theo [Customer N02](../../customer/plans/notifications/02-conditional-center.md). Producer Customer Ticket đã có, còn lỗi xác nhận/event và thiếu tích hợp Agent theo I07.

## Truy vết data model và vị trí code theo phase

Mỗi phase dưới đây có bảng cột/đọc–ghi/FK/version, migration, transaction và mức ảnh hưởng chi tiết; xem mục **Data model và phạm vi ảnh hưởng** và bảng **Vị trí code** trong phase. Hiện có file không đồng nghĩa mọi thay đổi dự kiến trong file đã được triển khai. Các phần P giữ P.

| Phase sở hữu | Bảng/dữ liệu chính và thao tác | Code cần rà từ root repo | Mức ảnh hưởng khi sửa |
| --- | --- | --- | --- |
| [NO01 — Notification recipient/read](notifications/01-recipient-read-api.md) | staff_assignments + customer_profiles + staff_profiles (Đọc); notifications (Đọc); conversations + conversation_handoffs (Đọc); support_tickets (Đọc); notifications (POST read cập nhật is_read) | [apps/core/src/notifications/notifications.service.ts](<../../../../apps/core/src/notifications/notifications.service.ts>); [apps/core/src/notifications/notifications.controller.ts](<../../../../apps/core/src/notifications/notifications.controller.ts>) | Cao — Handoff và Ticket notifications |
| [NO02 — Notification UI và realtime](notifications/02-center-realtime-ui.md) | notifications (Đọc); conversations + conversation_handoffs (Đọc); support_tickets (Đọc); notifications (POST read cập nhật is_read) | [apps/web/src/components/staff-notifications.tsx](<../../../../apps/web/src/components/staff-notifications.tsx>); [apps/web/src/lib/realtime.ts](<../../../../apps/web/src/lib/realtime.ts>) | Cao — Inbox và Tickets header |

Không tự áp dụng DDL khi triển khai UI, không biến model dự kiến thành hiện trạng, không reset seed/volume để né lỗi FK. Các dependency xuyên vai trò và operator xem [Data Model](../../../specifications/Data_Model.md#iii-bản-đồ-tác-động-khi-triển-khai-chức-năng).

## Runtime

**Retention đã chốt 13/11/2026:** notification Staff và Customer cùng lưu 30 ngày theo created_at; cleanup xóa cả read/unread cũ hơn cutoff, không xóa Ticket/Message hoặc audit nguồn. Phương án B đã chốt: cleanup khi Core khởi động và mỗi 24 giờ bằng timer nội bộ. Source vẫn lặp mỗi giờ, cần đồng bộ và kiểm thử retention theo [N01/N02](../../customer/plans/09-notifications-contract.md).

- Customer xác nhận yêu cầu Staff: handoff/consent + outbox commit trước. Worker chỉ tạo một Notification HANDOFF_REQUESTED cho recipient hiện hành khi request vẫn pending; title generic, body null, không preview chat AI.
- Staff Accept: transaction ghi acceptance/grant/controller và một SYSTEM trong chính transcript Customer–Staff, thông báo đã tiếp nhận/sẽ phản hồi sớm nhất. Cùng sự kiện có notification STAFF_ACCEPTED_HANDOFF cho Customer theo N01/N02; Ticket vẫn có luồng riêng.
- A27 `GET /api/v1/staff/notifications?limit=20&cursor=...`: limit1–50, scope trước keyset createdAt/id. Client tính unread count badge trên chuông toolbar từ danh sách loaded (+1 nếu có khuyến nghị đổi mật khẩu chưa ẩn). Notification đã mất quyền không xuất hiện.
- A28 `POST /api/v1/staff/notifications/:notificationId/read`, body `{}` và CSRF: chỉ recipient còn quyền target, idempotent. Đọc không Accept chat/Ticket hoặc đánh dấu tin đã đọc.
- Nút Notifications mở list/tải thêm, Read/Unread và Open request/Open ticket. Chuông có badge đếm số lượng chưa đọc (đỏ, `9+` nếu > 9). Hỗ trợ đánh dấu đọc từng mục qua nút checkmark tại chỗ ("Mark as read") và nút "Mark all as read" trên header popover. Khuyến nghị đổi mật khẩu được tích hợp thành Security Notice trong popover với nút "Change password now" và "Dismiss" (lưu sessionStorage). Không Refresh thường trực; Try again khi lỗi. Click item đánh dấu đọc rồi mở route; A09 recheck gate, pending vẫn không transcript. Escape/Close trả focus về nút mở.
- WebSocket chỉ phát eventId/resource tối thiểu, recheck session/grant ngay trước send. Reconnect/visible/online dùng REST resync; không auth/me theo từng message. Worker local một Core process, lease/retry/dedup; PUBLISHED không là delivered/read ACK.

Thông báo CUSTOMER_MESSAGE_UNREAD theo cùng phương án A của N01/N02: đánh dấu chuông đã đọc không kết thúc chu kỳ chưa đọc chat. Tin mới cùng chu kỳ cập nhật mục cũ, giữ id và bật unread; source còn lọc isRead=false nên cần chỉnh và kiểm thử trước nghiệm thu.

## Checklist

- [x] Handoff notification tách Ticket; SYSTEM sau Accept đúng transaction/gate.
- [x] A27/A28 + UI, scope-before-page, cursor actor-bound và CSRF/idempotent read.
- [x] Pending không nhận transcript/preview/sequence; reassignment/session revoke giữ REST/WS cùng quyền.
- [x] Core và browser/gateway E2E retry/reconnect/130 tin backlog/thu hồi quyền; không F5.
- [x] TK05 Ticket consumer/notification/realtime đã có; TICKET_ACCEPTED emitter TK03.
- [ ] Hoàn thiện review producer TICKET_CREATED từ Customer confirmation hợp lệ và tích hợp Agent theo I07.

Customer center/message read status theo N01/N02 đã được duyệt và có source; hoàn thiện review trước nghiệm thu. Benchmark/SLA, fanout đa replica/cloud/broker thuộc phạm vi triển khai riêng.

## Phase triển khai

[NO01 — Recipient/API](notifications/01-recipient-read-api.md) và [NO02 — UI/realtime](notifications/02-center-realtime-ui.md) mô tả Staff. [Customer N01/N02](../../customer/plans/09-notifications-contract.md) đã duyệt center + chat, recipient Customer và retention 30 ngày chung cho Customer/Staff; các tiêu chí còn thiếu theo review N02.

## API và routes của chức năng

Bảng truy vết Axx được chuyển từ tài liệu tổng hợp; E/P giữ theo runtime, DTO/quyền/luồng/test chi tiết do các phase của chức năng sở hữu. Không thêm endpoint từ việc gom tài liệu.

| ID | Method/path | Phạm vi |
| --- | --- | --- |
| A27 E | GET /staff/notifications | Handoff metadata scope hoặc Ticket recipient+assignment trước keyset; target CONVERSATION/TICKET, không counts |
| A28 E | POST /staff/notifications/:notificationId/read | Read notification idempotent; không tự nhận Ticket/takeover |

## Phần còn lại theo chức năng

| ID | Phần còn lại | Phase sở hữu |
| --- | --- | --- |
| G07 | Handoff/Ticket notifications và source Customer center/read status đã có | [NO01/02](06-notifications-contract.md), TK05 và Customer N01/N02 sở hữu quyền/projection riêng; hoàn thiện review DTO/event/read-cycle/cleanup và tests |
