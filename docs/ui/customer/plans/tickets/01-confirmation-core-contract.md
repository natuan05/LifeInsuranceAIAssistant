# T01 — Core Customer Ticket

**Phương án A đã duyệt:** hai luồng tạo, sửa draft trước xác nhận và trạng thái ban đầu OPEN. [C07](../07-tickets-contract.md) · [I07 canonical](../../../staff/plans/tickets/06-agent-confirmation.md).

## 1. Ownership và vị trí code

I07 sở hữu schema/transaction/quyền Ticket chung. T01 triển khai các API Customer trong module Tickets.

| Vị trí từ root repo | Trách nhiệm |
| --- | --- |
| [customer-ticket.controller.ts](../../../../../apps/core/src/tickets/controllers/customer-ticket.controller.ts) | Draft read/edit/confirm, manual create, list/detail/receipt |
| [ticket-draft.service.ts](../../../../../apps/core/src/tickets/services/ticket-draft.service.ts) | Owner/TTL 30 phút, version/hash và revision |
| [ticket.service.ts](../../../../../apps/core/src/tickets/services/ticket.service.ts) | Tạo OPEN, snapshot, request idempotency và outbox |
| [schema.prisma](../../../../../apps/core/prisma/schema.prisma) | TicketDraft/SupportTicket và ràng buộc |
| [ticket-api.ts](../../../../../apps/web/src/lib/ticket-api.ts) | Customer client đúng API/owner |

Các file và migration `202611130001_customer_ticket_drafts_and_confirmed_content` đã có trong source. Phase 0 đã hoàn thiện auth/role trong transaction cho các route draft và bốn mã lỗi 409, có test Core/DB/gateway. Phase 2 của [spec Application](../../../../application-code-alignment-spec.md) đã bổ sung validation, khóa/CAS, fingerprint/snapshot và read/quota. Migration `202611140001_ticket_request_fingerprint` thêm cột nullable/CHECK, không backfill legacy.

## 2. API, model và transaction

Các route/payload/mã lỗi theo mục 4 của I07. T01 dùng ticket_drafts, support_tickets, users/auth_sessions, policy/conversation owner, assignment, audit và outbox.

- **Draft:** GET → PUT revision với expectedVersion → POST confirm draft version hiện hành. Title/description/policy tùy chọn được sửa trước xác nhận.
- **Thủ công:** POST `/customers/me/tickets/manual` với clientRequestId, title, description, policyId tùy chọn.
- **Theo dõi:** GET own list/detail và receipt by-client-request-id.
- **Validation:** title trim 1–255, description trim 1–4000, policy/conversation đúng Customer. Quota 10 mutation/phút/actor, riêng Customer read/receipt 120/phút và Staff Accept; vượt trả 429/Retry-After.
- Title/description từ manual hoặc draft phải là Unicode hợp lệ và không có NUL; DTO/service trả 400 trước ghi DB khi vi phạm. Emoji, tiếng Việt và xuống dòng hợp lệ giữ nguyên.
- **Commit:** auth/owner/routing + key/hash + khóa/CAS draft → Ticket OPEN + confirmedContent + audit/outbox → consume draft nếu có → commit.
- **Replay:** cùng key/payload trả Ticket đã lưu, khác payload conflict. Snapshot phải khớp bản Customer đã duyệt/gửi. Recipient hiện hành không đổi trạng thái khởi tạo OPEN.

Mức ảnh hưởng cao ở sourceDraftId unique, idempotency, Staff detail/legacy và notification. Thay đổi schema bổ sung cần migration riêng theo contract đã chốt. Agent summary/source refs tiếp tục theo I07/Agent Design.

### Summary Agent theo phương án A — chưa triển khai, ngoài Phase 2

T01 triển khai thiết kế handoffPayload của [I07](../../../staff/plans/tickets/06-agent-confirmation.md#ticket-handoff-content). Draft/detail trả đủ sáu nhóm và projection nguồn hợp lệ; confirmedContent lưu snapshot cả nội dung lẫn nguồn được duyệt. Field JSONB cho draft còn là đề xuất cần migration riêng.

Hash và version bao phủ cả summary/nguồn. Customer sửa title/description/policy phải nhận revision phù hợp để review lại, không tự sửa finding thành dữ kiện đã xác minh. Form thủ công dùng payload hiện có với handoffPayload=null theo nguồn do Core kiểm soát. Không nhận source registry hoặc trạng thái verified do browser tự khai.

## 3. Bảo vệ dữ liệu

Bản chỉnh sửa phải được hiển thị lại trước xác nhận; snapshot khớp nội dung đã duyệt. Audit/outbox giữ payload tối thiểu. Dữ liệu Agent theo [chính sách B](../../../../specifications/Agent_Design.md#mvp-model-data-policy), projection Staff theo [ma trận dữ liệu](../../../../configuration-and-data.md#customer-sensitive-data).

## 4. Test cases

Dùng synthetic fixture và API/DB barrier cho concurrent/retry tại customer-ticket-boundary.test.cjs. Phần Application đã kiểm; T01-T08/T09 về sáu nhóm/source refs còn kế hoạch Agent.

| Mã | Ca | Kết quả mong đợi |
| --- | --- | --- |
| T01-T01 | Xác nhận hợp lệ, false, textVersion sai | Chỉ xác nhận hợp lệ tạo Ticket OPEN |
| T01-T02 | Sửa draft title/description/policy rồi confirm version cũ/mới | Version/hash cập nhật đúng; bản cũ bị chặn, snapshot bản mới chính xác |
| T01-T03 | Tạo thủ công có/không assignment, double submit | Một Ticket OPEN, đúng owner/recipient và nội dung gửi |
| T01-T04 | Draft hết hạn, owner khác hoặc policy ngoài quyền | Bị chặn trước commit; không có Ticket/outbox |
| T01-T05 | Concurrent keys, replay payload khác và mất ACK | Unique draft, conflict hoặc receipt đúng key gốc |
| T01-T06 | Lỗi transaction hoặc delivery | Rollback trước commit, giữ Ticket/outbox đã commit để retry |
| T01-T07 | Staff đọc Ticket liên kết chat AI riêng | Ticket scope không cấp transcript grant |
| T01-T08 | Round-trip sáu nhóm và source refs qua revision/confirm | GET draft và snapshot/detail giữ đủ nội dung, không cắt vào description |
| T01-T09 | Thay nguồn, ref giả/ngoài scope hoặc đổi policy | Kiểm ref/quyền, version/hash đổi và xác nhận cũ bị chặn; nguồn thật không bị thay bằng phiên bản mới |

## 5. Checklist

- [x] Hai luồng tạo và chỉnh sửa draft đã được duyệt.
- [x] API/model Customer Ticket có trong source.
- [x] Phần Application I07 đã kiểm Core/API/DB; summary/nguồn Agent giữ checklist riêng.
- [x] Sáu nhóm summary và nguồn là nội dung bắt buộc của luồng Agent theo phương án A.
- [ ] Triển khai payload/migration, projection nguồn, hash/revision và tích hợp trusted proposal theo I07.
