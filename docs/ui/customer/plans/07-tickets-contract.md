# C07 — Ticket Hỗ trợ Customer (Agent gợi ý & Form tạo chủ động)

04/11/2026 · **Cập nhật quyết định chốt 13/11/2026** · C07 · [I07 canonical](../../staff/plans/tickets/06-agent-confirmation.md).

> [!IMPORTANT]
> **Quyết định người dùng chốt (13/11/2026):**
> 1. **Luồng tạo Ticket:** Hỗ trợ **cả hai luồng**:
>    - Luồng 1: AI Agent phân tích ngữ cảnh hội thoại chat và đề xuất tạo Ticket $\rightarrow$ Khách hàng xem xét & xác nhận.
>    - Luồng 2: Khách hàng chủ động tự mở Form tạo Ticket trên giao diện (`customer-tickets.tsx`).
> 2. **Chỉnh sửa bản thảo (Draft Edit):** Khách hàng **được phép chỉnh sửa nội dung bản thảo** (tiêu đề, mô tả, gắn hợp đồng) trước khi xác nhận tạo Ticket.
> 3. **Lưu trữ bản thảo & Migration:** Tạo migration mới cho bảng `ticket_drafts` (TTL 30 phút) và bổ sung cột `source_draft_id`, `confirmed_content` (JSONB snapshot) vào bảng `support_tickets`.
> 4. **Quy tắc phân công & Trạng thái ban đầu:** Khi khách hàng tạo Ticket, **dù khách hàng đã có hay chưa có chuyên viên phụ trách, Ticket luôn khởi tạo ở trạng thái `OPEN`** (chờ chuyên viên kiểm tra và bấm Tiếp nhận / Accept).

## Truy vết data model và vị trí code theo phase

Mỗi phase dưới đây có bảng cột/đọc–ghi/FK/version, migration, transaction và mức ảnh hưởng chi tiết; xem mục **Data model và phạm vi ảnh hưởng** và bảng **Vị trí code** trong phase. Hiện có file không đồng nghĩa mọi thay đổi dự kiến trong file đã được triển khai. Các phần P giữ P.

| Phase sở hữu | Bảng/dữ liệu chính và thao tác | Code cần rà từ root repo | Mức ảnh hưởng khi sửa |
| --- | --- | --- | --- |
| [T01 — Customer contract trong Core Ticket I07](tickets/01-confirmation-core-contract.md) | staff_assignments + customer_profiles + staff_profiles (Đọc); conversations + conversation_handoffs (Đọc); support_tickets (Ghi Ticket OPEN, confirmedContent); ticket_drafts (DDL mới: lưu draft, revision khi sửa, TTL 30p); outbox_events (Thêm trong transaction nguồn; worker cập nhật trạng thái/lease) | `apps/core/src/tickets/controllers/customer-ticket.controller.ts`; `apps/core/src/tickets/services/ticket-draft.service.ts`; `apps/core/src/tickets/services/ticket.service.ts` | Cao — Customer review/edit, manual form, creation idempotency |
| [T02 — Review Ticket và kết quả đã lưu](tickets/02-review-result-ui.md) | support_tickets (Đọc/Ghi); ticket_drafts (Đọc/Sửa/Xác nhận) | `apps/web/src/components/customer-ticket-confirmation.tsx`; [apps/web/src/components/customer-tickets.tsx](<../../../../apps/web/src/components/customer-tickets.tsx>) | Cao — Customer chat, manual form modal, Ticket list & detail |

Không tự áp dụng DDL khi triển khai UI, không biến model dự kiến thành hiện trạng, không reset seed/volume để né lỗi FK. Các dependency xuyên vai trò và operator xem [Data Model](../../../specifications/Data_Model.md#iii-bản-đồ-tác-động-khi-triển-khai-chức-năng).

## 1. Ranh giới

FR-009/012, phía Staff FR-010; handoff không Ticket, Ticket không grant transcript. Model SupportTicket hiện có cần migration bổ sung draft/confirmedContent. **Staff I07 là contract Core chung**, Customer không xây Ticket service/schema thứ hai.

| Phase | Kết quả | Gate |
| --- | --- | --- |
| [T01](tickets/01-confirmation-core-contract.md) | Phần Customer của Core I07: draft/read/edit-revision/confirm/manual-create/reconcile/list/detail | Schema migration draft + confirmedContent; Agent proposal boundary |
| [T02](tickets/02-review-result-ui.md) | Form tạo thủ công, popup review/chỉnh sửa draft, xác nhận rõ ràng, danh sách vé và chi tiết vé | T01 Core API thật |

## 2. Scope

Giữ TicketStatus OPEN/ASSIGNED/IN_PROGRESS/RESOLVED/CLOSED. Mọi Ticket do khách hàng tạo (từ Agent gợi ý hay Form thủ công) **đều khởi tạo với status `OPEN`**. Customer thấy trạng thái persisted từ Core, không ngầm định Staff đã nhận chat.

- [ ] T01 migration `ticket_drafts`, snapshot `confirmedContent`, revision khi sửa, creation idempotency tests pass.
- [ ] T02 review modal cho phép sửa nội dung, form tạo thủ công, list/detail real API tests pass.
- [ ] Quy tắc khởi tạo status `OPEN` cho mọi ticket mới được bảo đảm trong code và tests.

## UX và baseline của chức năng

## Luồng đích

1. **Luồng qua Agent gợi ý:** Agent gợi ý tạo Ticket $\rightarrow$ Khách hàng mở modal Review $\rightarrow$ Khách hàng có thể **chỉnh sửa nội dung (tiêu đề, mô tả)** nếu cần $\rightarrow$ Xác nhận $\rightarrow$ Core kiểm tra chống trùng (idempotency) $\rightarrow$ Tạo Ticket trạng thái **`OPEN`** + outbox commit $\rightarrow$ Hiển thị mã Ticket.
2. **Luồng tạo thủ công:** Khách hàng bấm "Tạo yêu cầu mới" trên trang Tickets $\rightarrow$ Điền thông tin (tiêu đề, mô tả, chọn hợp đồng liên quan) $\rightarrow$ Gửi lên Core $\rightarrow$ Core tạo Ticket trạng thái **`OPEN`** + outbox commit $\rightarrow$ Cập nhật danh sách vé.

## Trạng thái riêng

- Mọi Ticket mới tạo từ phía Customer luôn có trạng thái ban đầu là **`OPEN`**.
- Chuyên viên tư vấn phụ trách hoặc điều phối viên sẽ kiểm tra danh sách Ticket `OPEN`, sau đó bấm **Tiếp nhận (Accept)** để chuyển sang `IN_PROGRESS` (hoặc `ASSIGNED`).
- TicketStatus và ConversationStatus hoàn toàn độc lập; đóng/mở Ticket không ảnh hưởng trạng thái phiên chat.

## Phạm vi và checklist

- [ ] Schema migration: thêm bảng `ticket_drafts` và các trường `source_draft_id`, `confirmed_content` cho `support_tickets`.
- [ ] API Core: `customer-ticket.controller.ts` hỗ trợ GET draft, PUT/PATCH edit draft, POST confirm ticket từ draft, POST manual create ticket, GET list/detail ticket của Customer.
- [ ] Quy tắc nghiệp vụ: status ban đầu luôn là `OPEN`.
- [ ] Frontend Web: Nối `customer-tickets.tsx` vào API thật, hỗ trợ tạo thủ công và popup xác nhận/chỉnh sửa draft từ Agent.
