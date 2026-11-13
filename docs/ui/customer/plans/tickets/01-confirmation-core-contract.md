# T01 — Customer Ticket Core Contract và Migration

04/11/2026 · **Cập nhật quyết định chốt 13/11/2026** · [C07](../07-tickets-contract.md) · [I07 canonical](../../../staff/plans/tickets/06-agent-confirmation.md).

> [!IMPORTANT]
> **Quyết định người dùng chốt (13/11/2026):**
> 1. **Luồng tạo Ticket:** Hỗ trợ song song cả hai luồng:
>    - Luồng qua AI Agent đề xuất từ hội thoại chat.
>    - Luồng Khách hàng tự mở Form tạo Ticket thủ công trên giao diện.
> 2. **Chỉnh sửa nội dung bản thảo:** Khách hàng **được phép chỉnh sửa** nội dung draft (tiêu đề, mô tả, gắn hợp đồng) trước khi xác nhận. Thao tác chỉnh sửa tạo revision/version mới trên server và băm lại hash.
> 3. **Lưu trữ bản thảo & Migration:** Tạo migration mới cho bảng `ticket_drafts` (TTL 30 phút) và bổ sung cột `source_draft_id`, `confirmed_content` (JSONB) cho bảng `support_tickets`.
> 4. **Trạng thái ban đầu:** Mọi Ticket mới do khách hàng tạo (từ cả hai luồng) **đều khởi tạo với trạng thái `OPEN`** (dù khách hàng đã có hay chưa có chuyên viên phụ trách).

## Bổ sung bảo vệ dữ liệu Customer — 12/11/2026

**P — chưa triển khai phần bảo vệ bổ sung; giữ trạng thái baseline của phase.** Theo [ma trận dữ liệu chung](../../../../configuration-and-data.md#customer-sensitive-data); mức che/quyền xem đầy đủ còn chờ chốt. Vị trí code/API và data model của phase bên dưới là nơi rà tác động; bổ sung này không tự yêu cầu migration hoặc sửa dữ liệu gốc.

**Thay đổi của phase:** I07 sở hữu giảm PII trước phát hành draft. Nội dung/hash/version Customer duyệt phải khớp immutable confirmedContent Core commit; đổi nội dung phải review lại, legacy vẫn UNVERIFIED.

**Kiểm thử cần bổ sung, chưa chạy:** Core/DB: confirmation cũ không dùng sau đổi draft, replay không trùng; receipt/outbox/audit không chép raw ngoài contract.

## Data model và phạm vi ảnh hưởng

Bảng bên dưới mô tả tác động của phase, gồm cả ghi gián tiếp qua Core. Tên bảng thuộc schema `business` trừ nơi ghi rõ. Web không truy cập DB trực tiếp.

| Bảng/model | Cột hoặc dữ liệu liên quan | Thao tác của phase | Quan hệ/ràng buộc cần giữ | Mức ảnh hưởng và nơi bị tác động |
| --- | --- | --- | --- | --- |
| users + auth_sessions | users.id/role/status, auth_sessions.user_id/token_hash/expires_at/revoked_at | Đọc | AuthSession.user_id → User.id; session phải còn hạn, không bị thu hồi | Cao — mọi API dùng session; không trả token/hash trong DTO |
| staff_assignments + customer_profiles + staff_profiles | staff_id/customer_id/is_active/ended_at, assignment_version, user_id/full_name | Đọc | Kiểm tra phân công hiện hành; vé tạo mới vẫn khởi tạo trạng thái OPEN | Cao — Customers, Policy Lookup, Ticket và Inbox cùng phụ thuộc phân công |
| conversations + conversation_handoffs | customer_id/channel_type/support_origin/direct_assignment_id/assigned_staff_id/status/control_version/subject | Đọc | Draft liên kết đúng conversationId của Customer; Ticket độc lập với transcript | Cao — Không tự động chuyển chat mode khi tạo Ticket |
| support_tickets | id/ticket_code/customer_id/assigned_staff_id/conversation_id/policy_id/status/version/title/ai_summary/extracted_details/confirmed_at + **source_draft_id** + **confirmed_content** | Ghi Ticket mới (`status = OPEN`), snapshot confirmedContent | Ticket Code duy nhất; status ban đầu luôn là OPEN; idempotencyKey chống trùng | Cao — list/detail/status và notification dùng chung Ticket scope |
| ticket_drafts (Bảng mới) | id/conversation_id/customer_id/version/payload/payload_hash/state/expires_at/created_at | DDL + CRUD draft server-side (TTL 30p) | Owner FK customer_id; state DRAFT/CONFIRMED/EXPIRED/SUPERSEDED; version tăng khi sửa | Cao — Lưu bản thảo tin cậy từ Agent, kiểm soát xác nhận và chống ghi đè |
| audit_logs | actor_id/action/target_type/target_id/outcome/request_id/metadata/created_at | Thêm khi tạo Ticket/draft | actor_id → User.id; không lưu PII/credential vào log | Cao — truy vết hành vi nghiệp vụ tuân thủ NFR-002 |
| outbox_events | aggregate_type/aggregate_id/event_type/payload/status | Thêm trong transaction nguồn | Transactional Outbox phát sự kiện TICKET_CREATED để thông báo cho Staff | Cao — bảo đảm tính toàn vẹn sự kiện |

**Schema/migration:** Migration mới thêm bảng `ticket_drafts` và thêm 2 cột `source_draft_id` (UUID nullable, FK tới `ticket_drafts`), `confirmed_content` (JSONB nullable) vào bảng `support_tickets`.

**Nhất quán và hồi quy:** Khởi tạo `status = OPEN` cho mọi Ticket mới. Draft có TTL 30 phút; khi khách sửa draft thì tăng `version` và cập nhật `payload_hash`. Xác nhận draft chuyển draft sang `CONFIRMED` và tạo Ticket trong cùng 1 transaction. Cancel không ghi Ticket; retry cùng idempotencyKey trả về kết quả Ticket đã commit.

## Vị trí code và mức ảnh hưởng

| Vị trí từ root repo | Hiện trạng | Trách nhiệm trong phase | Mức ảnh hưởng | Phạm vi cần kiểm lại |
| --- | --- | --- | --- | --- |
| `apps/core/src/tickets/controllers/customer-ticket.controller.ts` | Dự kiến | Controller phục vụ Customer: draft, edit draft, confirm ticket, manual create, my tickets | Cao | Customer review/edit, manual form, creation idempotency |
| `apps/core/src/tickets/services/ticket-draft.service.ts` | Dự kiến | Quản lý draft: tạo, sửa revision (version+hash), expire sau 30 phút, consume once | Cao | Ticket creation/idempotency/expiry |
| [apps/core/src/tickets/services/ticket.service.ts](<../../../../../apps/core/src/tickets/services/ticket.service.ts>) | Hiện có | Mở rộng method tạo Ticket cho Customer với status OPEN | Cao | Giữ Staff status/version TK01–TK05 |
| [apps/core/prisma/schema.prisma](<../../../../../apps/core/prisma/schema.prisma>) | Hiện có | Thêm bảng `ticket_drafts` và các trường mới trên `support_tickets` | Cao | Migrations, bootstrap compatibility |
| [apps/web/src/lib/ticket-api.ts](<../../../../../apps/web/src/lib/ticket-api.ts>) | Hiện có | Bổ sung API client cho Customer: getDraft, updateDraft, confirmDraft, createManualTicket, getMyTickets | Trung bình | Tách bạch quyền với Staff |

## 1. Ownership công việc

Mọi nghiệp vụ Ticket phía Customer được tích hợp vào module [apps/core/src/tickets/](file:///e:/UET/Project/github/LifeInsuranceAIAssistant/apps/core/src/tickets/). Dùng chung bảng `support_tickets` với Staff, không tạo bảng hay module Ticket thứ hai.

## 2. API spec Customer (Đã chốt 13/11/2026)

| Method & Endpoint | Mô tả & Body / Response tối thiểu |
| --- | --- |
| `GET /api/v1/customers/me/conversations/:conversationId/ticket-drafts/:draftId` | Đọc thông tin draft để hiển thị popup xác nhận: `{draft:{id,version,state,title,description,policyId,expiresAt},confirmation:{textVersion,text}}` |
| `PUT /api/v1/customers/me/conversations/:conversationId/ticket-drafts/:draftId` | **Khách hàng chỉnh sửa nội dung draft**: Body `{expectedVersion:number,title:string,description:string,policyId?:string}` $\rightarrow$ Server cập nhật draft, tăng version, hash lại và trả về draft mới. |
| `POST /api/v1/customers/me/tickets` | **Xác nhận tạo vé từ draft**: Body `{clientRequestId:UUID,draftId:UUID,expectedDraftVersion:number,confirmation:{confirmed:true,textVersion:'ticket-v1'}}` $\rightarrow$ Core tạo Ticket trạng thái **`OPEN`**, trả về `{ticket:{id,ticketCode,status:'OPEN',confirmedAt},replayed:boolean}` |
| `POST /api/v1/customers/me/tickets/manual` | **Khách hàng tự tạo vé thủ công qua Form**: Body `{clientRequestId:UUID,title:string,description:string,policyId?:string}` $\rightarrow$ Core tạo Ticket trạng thái **`OPEN`**, trả về `{ticket:{id,ticketCode,status:'OPEN',createdAt}}` |
| `GET /api/v1/customers/me/tickets` | **Xem danh sách vé của chính mình**: Phân trang, lọc theo trạng thái (`OPEN`, `IN_PROGRESS`, `RESOLVED`, `CLOSED`). Thay thế mock data trên Web. |
| `GET /api/v1/customers/me/tickets/:ticketId` | **Xem chi tiết vé của mình**: Bao gồm `ticketCode`, `status`, `confirmedContent`, thời gian tạo, chuyên viên tiếp nhận (nếu có). |
| `GET /api/v1/customers/me/tickets/by-client-request-id/:clientRequestId` | Tra cứu idempotency receipt khi gặp timeout mạng. |

- **Bảo mật & Phân quyền:** Session `CUSTOMER`, Origin, CSRF token. Header `Cache-Control: no-store`.
- **Validation:** `title` 1–255 ký tự; `description` 1–4000 ký tự; `policyId` (nếu có) phải thuộc quyền sở hữu của Customer.
- **Rate Limit:** 10 request/phút/actor cho thao tác tạo Ticket/chỉnh sửa draft.

## 3. Transaction và quy tắc khởi tạo trạng thái `OPEN`

1. **Khởi tạo trạng thái `OPEN`**: Khi khách hàng tạo Ticket thành công (từ Agent gợi ý hoặc Form thủ công), trạng thái luôn được lưu là **`OPEN`** (`status = OPEN`), `assignedStaffId = null` (hoặc giữ reference chuyên viên phụ trách nhưng status vẫn là `OPEN` chờ Accept).
2. **Atomic Transaction:**
   - Đọc và khóa draft (nếu tạo từ draft). Kiểm tra trạng thái draft (`DRAFT`), so sánh `version`, kiểm tra hạn dùng `expiresAt` (TTL 30 phút).
   - Kiểm tra trùng lặp `clientRequestId` (idempotency key).
   - Sinh mã vé `ticketCode` duy nhất (VD: `TK-7703`).
   - Lưu `support_tickets` với `status = 'OPEN'`, lưu snapshot `confirmedContent`.
   - Cập nhật draft sang trạng thái `CONFIRMED`.
   - Ghi sự kiện vào `outbox_events` (`TICKET_CREATED`) để hệ thống realtime thông báo đến nhân viên.
   - Commit transaction.
3. Chuyên viên tư vấn khi vào trang [Staff Tickets](file:///e:/UET/Project/github/LifeInsuranceAIAssistant/apps/web/src/components/staff-tickets.tsx) sẽ nhìn thấy vé ở danh sách `OPEN` và bấm **Tiếp nhận (Accept)** để chuyển sang `IN_PROGRESS` theo đúng quy trình TK03 đã có.

## 4. Test cases dự kiến

### T01-T01 — Tạo Ticket qua Agent gợi ý & Khởi tạo status OPEN
- C-A nhận draft từ Agent (status DRAFT, version 1).
- C-A gửi `POST /customers/me/tickets` kèm confirmation hợp lệ.
- Kết quả: Ticket được tạo thành công với status `OPEN`, `confirmedContent` khớp draft, draft chuyển `CONFIRMED`.

### T01-T02 — Chỉnh sửa draft trước khi xác nhận (Draft Revision)
- C-A gọi `PUT .../ticket-drafts/:draftId` sửa tiêu đề và mô tả với `expectedVersion = 1`.
- Core kiểm tra và cập nhật draft lên `version = 2`, cập nhật `payload_hash` mới.
- C-A confirm với `expectedDraftVersion = 2`.
- Kết quả: Ticket lưu đúng nội dung sau khi sửa. Thử confirm với version cũ (version 1) bị từ chối 409 Conflict.

### T01-T03 — Khách hàng tự tạo Ticket thủ công qua Form
- C-A mở modal tạo vé trên Web, nhập tiêu đề, mô tả và chọn hợp đồng.
- Gửi `POST /customers/me/tickets/manual`.
- Kết quả: Ticket được tạo thành công với status `OPEN`, xuất hiện ngay trong danh sách vé của khách hàng.

### T01-T04 — Hết hạn bản thảo (TTL 30 phút)
- Draft quá thời hạn 30 phút mà khách hàng chưa xác nhận.
- C-A cố gắng confirm draft $\rightarrow$ Core từ chối với mã lỗi `409 DRAFT_EXPIRED`. Không có Ticket nào được tạo.

### T01-T03 — Đồng thời, receipt và rollback

**Lớp kiểm thử:** API + DB barrier dự kiến.
**Điều kiện và dữ liệu:** C-A xác nhận cùng draft với key K; harness giữ insert/outbox/ACK.

**Các bước:**

1. Gửi cùng K/payload và nhiều key cho cùng draft.
2. Replay K với payload khác.
3. Inject lỗi trước commit rồi ngắt ACK sau commit ở fixture khác.

**Kết quả mong đợi:** Một Ticket mỗi draft; receipt/replay hoặc conflict đúng; rollback atomic, ACK mất tra receipt không tạo trùng.

### T01-T04 — Ticket không chia sẻ chat AI

**Lớp kiểm thử:** API + DB dự kiến.
**Điều kiện và dữ liệu:** Draft hợp lệ tạo Ticket liên kết AI_PRIVATE; chưa handoff/Accept.

**Các bước:**

1. C-A confirm để tạo Ticket.
2. Staff đúng recipient đọc Ticket.
3. Staff GET transcript AI_PRIVATE.

**Kết quả mong đợi:** Ticket scope đúng nhưng transcript vẫn deny; không tự thay trạng thái/chat grant từ confirmation Ticket.

**Checklist chức năng liên quan** (giữ trạng thái triển khai, không phải kết quả của lần sửa tài liệu):

- [ ] Policy sửa draft rõ trước T02Edit; Agent thật là gate riêng cho full E2E.

**Dọn sau kiểm thử:** xóa đúng fixture/session/object/schema theo runId; phục hồi fault injection và đóng context/socket test. Không reset DB/credential, sửa bootstrap hoặc xóa volumes. Với PDF kiểm metadata/bytes/hash; với UI kiểm DOM/focus/network, không cần screenshot.
