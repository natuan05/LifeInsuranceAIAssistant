# C07 — Ticket do Agent gợi ý, Customer xác nhận

04/11/2026 · **Chưa triển khai** · C07 · [I07 owner](../../staff/plans/tickets/06-agent-confirmation.md).

## Truy vết data model và vị trí code theo phase

Mỗi phase dưới đây có bảng cột/đọc–ghi/FK/version, migration, transaction và mức ảnh hưởng chi tiết; xem mục **Data model và phạm vi ảnh hưởng** và bảng **Vị trí code** trong phase. Hiện có file không đồng nghĩa mọi thay đổi dự kiến trong file đã được triển khai. Các phần P giữ P.

| Phase sở hữu | Bảng/dữ liệu chính và thao tác | Code cần rà từ root repo | Mức ảnh hưởng khi sửa |
| --- | --- | --- | --- |
| [T01 — Customer contract trong Core Ticket I07](tickets/01-confirmation-core-contract.md) | staff_assignments + customer_profiles + staff_profiles (Đọc); conversations + conversation_handoffs (Đọc); support_tickets (Đọc); TicketDraft / confirmed snapshot — P, chưa có bảng/cột (DDL + ghi dự kiến, chưa triển khai); outbox_events (Thêm trong transaction nguồn; worker cập nhật trạng thái/lease) | `apps/core/src/tickets/controllers/customer-ticket.controller.ts` — P; `apps/core/src/tickets/services/ticket-draft.service.ts` — P | Cao — Customer review, service identity Agent |
| [T02 — Review Ticket và kết quả đã lưu](tickets/02-review-result-ui.md) | support_tickets (Đọc); TicketDraft / confirmed snapshot — P, chưa có bảng/cột (DDL + ghi dự kiến, chưa triển khai) | `apps/web/src/components/customer-ticket-confirmation.tsx` — P; [apps/web/src/components/customer-tickets.tsx](<../../../../apps/web/src/components/customer-tickets.tsx>) | Cao — Customer chat và Ticket creation |

Không tự áp dụng DDL khi triển khai UI, không biến model dự kiến thành hiện trạng, không reset seed/volume để né lỗi FK. Các dependency xuyên vai trò và operator xem [Data Model](../../../specifications/Data_Model.md#iii-bản-đồ-tác-động-khi-triển-khai-chức-năng).

## 1. Ranh giới

FR-009/012, phía Staff FR-010; handoff không Ticket, Ticket không grant transcript. Model SupportTicket hiện có chưa lưu đủ draft/immutable confirmation. **Staff I07 là contract Core chung**, Customer không xây Ticket service/schema thứ hai. Nếu sửa contract I07 phải cập nhật phase sở hữu trước phần phụ thuộc.

| Phase | Kết quả | Gate |
| --- | --- | --- |
| [T01](tickets/01-confirmation-core-contract.md) | Phần Customer của Core I07: draft/read/confirm/reconcile/detail | Agent boundary cho draft thật; fixtures trusted chỉ test |
| [T02](tickets/02-review-result-ui.md) | Review/xác nhận rõ ràng/result/detail | T01 thật; Agent draft thật cho E2E nghiệp vụ |

## 2. Scope

Giữ TicketStatus OPEN/ASSIGNED/IN_PROGRESS/RESOLVED/CLOSED; enum không mở thêm workflow resolve/complete/reply ngoài MVP. Customer thấy trạng thái persisted từ Core, không lời hứa Staff đã tiếp nhận chat. Không tạo form Ticket thủ công vì không thuộc nhánh được chốt. Customer Ticket list tổng quát là mở rộng UX có thể làm sau; I07 hiện chỉ cần result/detail để theo dõi Ticket vừa tạo.

- [ ] T01/I07 snapshot/version/hash/idempotency/owner/atomicoutbox tests pass.
- [ ] T02 explicit review, kết quả chưa rõ, draft stale/expired, access tests pass.
- [ ] Source Agent thật và fixture synthetic trusted được ghi khác nhau; không đánh dấu Ticket flow thật từ fixture.

## UX và baseline của chức năng

## Luồng đích

Agent gợi ý tạo Ticket → Customer xem nội dung, xác nhận → Core kiểm ownership/confirmation/chống trùng → Ticket + outbox commit → hiển thị mã Ticket. Nếu hỗ trợ sửa, phải có revision server/version/hash mới và review lại; không bật Edit trước contract revision. Agent/Staff không thay xác nhận hợp lệ của Customer.

Ticket có mã/tiêu đề/nội dung đã xác nhận/quan hệ policy hoặc conversation khi hợp lệ. Lưu Ticket không nghĩa Staff đã nhận chat. Mở liên kết chat vẫn phải Direct/Accept gate; Ticket accept/close không cấp quyền lịch sử AI.

## Trạng thái riêng

TicketStatus OPEN/ASSIGNED/IN_PROGRESS/RESOLVED/CLOSED giữ riêng. Chat mới không dùng Closed; không dùng TicketStatus đóng/mở chat. UI/API resolve/hoàn tất/phản hồi chưa triển khai chỉ vì enum tồn tại.

Timeout phải reconcile khóa cũ trước retry; delivery lỗi không xóa Ticket đã lưu. Nội dung draft/AI summary không được trình bày như đã commit hoặc đã Customer xác nhận.

## Phạm vi và checklist

Form Ticket thủ công từng được đề xuất trong MVP để backlog riêng, không triển khai trong đợt Inbox đang chốt; cần xác nhận scope riêng nếu làm tiếp. Đợt hiện tại ưu tiên nhánh Agent gợi ý/Customer xác nhận.

- [ ] Review/triển khai I07/T01 content/source/version/confirmation/idempotency; không tạo Ticket module/schema thứ hai.
- [ ] Tạo/đọc/list đúng quyền, Ticket + outbox atomic, mã chỉ sau commit.
- [ ] Không tạo Ticket khi Customer chỉ chọn Yêu cầu Staff hoặc Staff Accept chat.
- [ ] Link Ticket không vượt quyền transcript trước Accept; không sửa chat mode khi nhận Ticket.
