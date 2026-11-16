# C07 — Customer Tickets

**Quyết định 13/11/2026, đã xác nhận phương án A:** Customer tạo Ticket thủ công hoặc từ draft Agent, được sửa draft trước xác nhận. Ticket mới có trạng thái OPEN. [I07 canonical](../../staff/plans/tickets/06-agent-confirmation.md).

## 1. Phạm vi và phase

| Phase | Trách nhiệm | Phụ thuộc |
| --- | --- | --- |
| [T01 — Core Customer Ticket](tickets/01-confirmation-core-contract.md) | Draft read/edit/confirm, manual create, receipt, own list/detail | Contract và transaction chung I07 |
| [T02 — Customer Ticket UI](tickets/02-review-result-ui.md) | Popup review/sửa/xác nhận, form thủ công, list/detail và lỗi/retry | T01; trusted Agent proposal cho luồng Agent đầy đủ |

Form thủ công là chức năng Customer trong phạm vi đã chọn. Handoff/Direct/Accept chat là luồng riêng. Staff xử lý Ticket theo quyền recipient/assignment.

## 2. Dữ liệu và vị trí code

| Dữ liệu | Thao tác | Vị trí từ root repo |
| --- | --- | --- |
| ticket_drafts | Owner read/edit/consume, TTL/version/hash | `apps/core/src/tickets/services/ticket-draft.service.ts` |
| support_tickets, audit_logs, outbox_events | Tạo OPEN + snapshot/audit/outbox atomic, own list/detail | `apps/core/src/tickets/services/ticket.service.ts` |
| Customer API | Xác thực/validation/CSRF theo I07 | `apps/core/src/tickets/controllers/customer-ticket.controller.ts` |
| Web | Hai luồng tạo, theo dõi kết quả và receipt | `apps/web/src/components/customer-tickets.tsx`, `customer-ticket-confirmation.tsx`, `lib/ticket-api.ts` |

Source có migration draft/snapshot và các thành phần trên. Phase 2 đã sửa validation/replay/concurrency và snapshot cơ bản của Application; ánh xạ summary/nguồn Agent tiếp tục tại I07. Mức ảnh hưởng cao ở nội dung xác nhận, snapshot, quyền và notification.

## 3. Luồng

1. **Từ Agent:** nhận draft server → xem → tùy chọn sửa và lưu revision → xác nhận version hiện hành → Core commit Ticket OPEN.
2. **Thủ công:** nhập title/description/policy tùy chọn → gửi form với request key → Core commit Ticket OPEN.
3. List/detail hiển thị trạng thái persisted. Có Staff phụ trách vẫn tạo OPEN; Staff Accept chuyển sang IN_PROGRESS.
4. Timeout đối soát bằng key gốc. Tạo Ticket không tự chia sẻ chat AI.

**Nội dung draft Agent, phương án A:** giữ đủ sáu nhóm request/context/customer_statements/verified_findings/attempted_steps/pending_issues và nguồn qua review, revision và snapshot confirmedContent. Cách lưu/projection/hash được mô tả tại [I07](../../staff/plans/tickets/06-agent-confirmation.md#ticket-handoff-content). Title/description phục vụ mô tả nhanh; form thủ công dùng dữ liệu Customer tự gửi.

## 4. Checklist

- [x] Phạm vi hai luồng, chỉnh sửa draft, own list/detail và OPEN đã chốt.
- [x] Có code schema/API/UI trong source.
- [x] Phần Application I07/T01/T02: validation, khóa/CAS, fingerprint, snapshot, receipt và hồi quy Core/browser.
- [ ] Nghiệm thu luồng Agent khi trusted proposal và summary mapping hoàn tất.
