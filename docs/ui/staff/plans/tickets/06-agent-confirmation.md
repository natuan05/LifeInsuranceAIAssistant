# I07 — Tạo Ticket và liên kết với Inbox

**Quyết định 13/11/2026, đã xác nhận phương án A:** Customer có hai luồng tạo Ticket, từ draft Agent và từ form thủ công. I07 sở hữu contract nghiệp vụ chung. [Staff Tickets](../07-tickets-contract.md) · [Customer T01](../../../customer/plans/tickets/01-confirmation-core-contract.md) · [Customer T02](../../../customer/plans/tickets/02-review-result-ui.md).

## 1. Phạm vi và quy tắc chung

- **Qua Agent:** Agent đề xuất → Core lưu draft → Customer xem, có thể sửa tiêu đề/mô tả/hợp đồng liên quan → xác nhận → Core tạo Ticket.
- **Thủ công:** Customer nhập tiêu đề/mô tả, tùy chọn hợp đồng → chủ động gửi form → Core tạo Ticket.
- Ticket mới từ cả hai luồng có trạng thái **OPEN**, kể cả khi có Staff phụ trách. Recipient được Core xác định theo assignment/policy hiện hành. Staff Accept chuyển Ticket sang IN_PROGRESS.
- Handoff, Direct và Accept chat là các thao tác riêng. Ticket liên kết conversation vẫn phải tuân thủ gate đọc transcript.
- Customer xem list/detail và tra kết quả theo request key. Quyền Staff theo TK01–TK05.

## 2. Source hiện có và phần còn cần kiểm chứng

Source có CustomerTicketController, TicketDraftService, Customer Ticket UI và migration `202611130001_customer_ticket_drafts_and_confirmed_content`. Có code chưa đồng nghĩa đã nghiệm thu luồng Agent thật hoặc các điều kiện xác nhận/concurrency.

| Vị trí từ root repo | Trách nhiệm |
| --- | --- |
| [customer-ticket.controller.ts](../../../../../apps/core/src/tickets/controllers/customer-ticket.controller.ts) | Owner draft/read/edit/confirm/manual-create/list/detail/receipt |
| [ticket-draft.service.ts](../../../../../apps/core/src/tickets/services/ticket-draft.service.ts) | TTL, version, hash và revision draft |
| [ticket.service.ts](../../../../../apps/core/src/tickets/services/ticket.service.ts) | Tạo Ticket, snapshot, idempotency, audit/outbox và Staff read/status |
| [schema.prisma](../../../../../apps/core/prisma/schema.prisma) | TicketDraft, SupportTicket và ràng buộc liên quan |
| [ticket-api.ts](../../../../../apps/web/src/lib/ticket-api.ts) | Client Customer/Staff theo đúng quyền |
| [tickets.module.ts](../../../../../apps/core/src/tickets/tickets.module.ts) | Đăng ký controller/service trong module Ticket |

**Phase 2 đã sửa phần Application:** buộc confirmed=true/textVersion=ticket-v1, chuẩn hóa trước validation/hash, request fingerprint khi replay, khóa/CAS draft và projection snapshot cơ bản cho Staff/Customer. Có kiểm Core/DB/gateway và browser, gồm retry/mất ACK/concurrency. Integration Agent, sáu nhóm/source refs và trusted proposal/service contract vẫn chưa triển khai trong phase này.

## 3. Data model và phạm vi ảnh hưởng

| Bảng/model | Dữ liệu và thao tác | Điều phải giữ |
| --- | --- | --- |
| users, auth_sessions | Xác thực và quyền actor | Kiểm quyền hiện hành cả khi replay |
| staff_assignments | Đọc recipient/routing | Routing nhất quán với transaction tạo Ticket |
| conversations | Kiểm owner khi draft liên kết cuộc chat | Giữ transcript grant riêng |
| ticket_drafts | customer/conversation/policy, title/description, version, payload_hash, state, expires_at | TTL **30 phút**; mỗi sửa hợp lệ tăng version/hash; sourceDraftId unique khi consume |
| support_tickets | status, source_draft_id, confirmed_content, request_fingerprint, idempotency_key, version | OPEN lúc tạo; snapshot chính xác nội dung Customer đã duyệt/gửi, bất biến sau tạo |
| audit_logs, outbox_events | Ghi cùng transaction Ticket | Metadata tối thiểu, event TICKET_CREATED và chống trùng delivery |

Schema draft/snapshot và migration 202611140001_ticket_request_fingerprint đã có trong source. Dữ liệu legacy thiếu snapshot tiếp tục được ghi nhận là LEGACY_UNVERIFIED. Yêu cầu mở rộng thêm field/source refs phải có schema contract cụ thể trước khi tạo migration bổ sung.

Mức ảnh hưởng cao ở Customer confirmation/manual form, Staff detail/status, notification và bảo toàn nguồn. Core sở hữu nghiệp vụ; Agent dùng Business API.

### Nội dung từ Agent

Agent đề xuất qua interface được Core xác thực. Body browser tự khai `source=AGENT` không chứng minh nguồn trusted. Contract `PROPOSE_TICKET.summary` hiện yêu cầu sáu nhóm `request`, `context`, `customer_statements`, `verified_findings`, `attempted_steps`, `pending_issues` và source refs theo Agent Design.

**Phương án A đã duyệt:** draft Agent lưu và hiển thị đủ sáu nhóm cùng nguồn để Customer review và Staff tiếp tục xử lý. Title/description là phần mô tả nhanh của Ticket. Nội dung Customer sửa phải phân biệt với finding đã xác minh.

<a id="ticket-handoff-content"></a>
### Lưu, hiển thị và xác nhận summary Agent

| Nhóm | Kiểu theo Agent contract | Cách hiển thị |
| --- | --- | --- |
| request | string | Yêu cầu cần hỗ trợ |
| context | string | Bối cảnh hợp đồng/sản phẩm và tình huống liên quan |
| customer_statements | string[] | Thông tin do Customer cung cấp, gồm sửa ý/phủ định liên quan |
| verified_findings | {text, source_refs[]}[] | Kết quả đã đối chiếu, có nguồn kiểm chứng |
| attempted_steps | string[] | Các bước Agent đã thực hiện và kết quả thực tế |
| pending_issues | string[] | Vấn đề còn vướng, thiếu căn cứ hoặc chưa kiểm tra |

Các nhóm luôn có key theo schema Agent. Nhóm thiếu nội dung dùng chuỗi rỗng/mảng rỗng và UI hiển thị trạng thái thiếu phù hợp. Không tạo nội dung cho đủ nhóm. verified_findings chỉ dẫn nguồn evidence/Core đã nhận và được phép, không dùng lời khách khai làm chứng cứ xác minh.

**Thiết kế lưu trữ đề xuất, chưa triển khai:** bổ sung TicketDraft.handoffPayload, cột handoff_payload JSONB nullable, chứa summary theo TicketHandoffSummary và registry sources do Core dựng từ kết quả trusted. Mỗi ref gắn metadata nguồn cần thiết như loại nguồn, document/version/anchor hoặc định danh kết quả Core và thời điểm đối chiếu. Không lưu token, signed URL hay toàn bộ tool trace. ConfirmedContent lưu bản sao handoffPayload cùng title/description/policy của revision được duyệt, trong transaction tạo Ticket.

DTO draft/detail trả summary cùng projection nguồn được phép xem. Registry nội bộ không đưa nguyên khối ra browser. Core kiểm quyền nguồn khi mở tài liệu; snapshot lưu dấu vết tại thời điểm xác nhận. Nếu quyền nguồn đã đổi, UI báo nguồn hiện không khả dụng và không tự lấy phiên bản khác. Quyền Ticket và transcript vẫn độc lập.

**Revision và chỉnh sửa:** Customer sửa title/description/policy như phạm vi đã duyệt. Core lưu revision thể hiện yêu cầu/lời Customer sau sửa; finding và source refs chỉ thay đổi qua kết quả được kiểm chứng. Nếu đổi hợp đồng hoặc sửa yêu cầu làm summary cũ không còn phù hợp, cần cập nhật summary/nguồn rồi cho Customer xem lại trước xác nhận. Quy tắc đồng bộ này cần được triển khai và đánh giá ngữ nghĩa; kiểm schema không chứng minh các câu đã nhất quán.

Hash canonical bao phủ title, description, policyId, summary và nguồn đã gắn với revision. Thay nội dung hoặc nguồn làm tăng version/hash và vô hiệu xác nhận cũ. Hạn expiresAt tiếp tục theo draft; UI chỉ cho confirm revision đã được nạp và review. Snapshot sau commit bất biến, không tạo lại summary từ transcript mới khi mở detail.

Form thủ công tiếp tục dùng title/description/policy và có handoffPayload=null khi Core xác định nguồn MANUAL. Draft Agent thiếu payload chuẩn bị chặn xác nhận cho tới khi được bổ sung hợp lệ; Ticket/draft cũ thiếu summary được nhận diện legacy, không backfill bằng nội dung AI tự sinh. Migration thêm field cần triển khai riêng sau review, giữ các migration đã apply.

## 4. API Customer

Prefix `/api/v1`. Source controller hiện có các route sau; bảng mô tả contract cần kiểm chứng cùng phần review tại mục 2.

| API | Payload/ý nghĩa |
| --- | --- |
| GET /customers/me/conversations/:conversationId/ticket-drafts/:draftId | Owner xem draft và confirmation text |
| PUT /customers/me/conversations/:conversationId/ticket-drafts/:draftId | `expectedVersion,title,description,policyId?`; lưu revision rồi trả draft mới |
| POST /customers/me/tickets | `clientRequestId,draftId,expectedDraftVersion,confirmation:{confirmed:true,textVersion:'ticket-v1'}` |
| POST /customers/me/tickets/manual | `clientRequestId,title,description,policyId?`; thao tác gửi form tạo yêu cầu |
| GET /customers/me/tickets | Own list với status/search/page/pageSize |
| GET /customers/me/tickets/:ticketId | Own detail/status/nội dung đã gửi |
| GET /customers/me/tickets/by-client-request-id/:clientRequestId | Tra kết quả sau timeout bằng key gốc |

Title trim 1–255 ký tự, description trim 1–4000 ký tự; policy phải thuộc Customer. Actor lấy từ session, các mutation theo Origin/CSRF/JSON và quota mục tiêu **10 request/phút/actor** đã ghi ở T01. Controller hiện trả 200 cho create/confirm và replay. UUID/unknown fields/query/role cần kiểm tra theo contract API.

Draft phải còn DRAFT, đúng owner/cuộc, chưa hết hạn và đúng version. `confirmed:false`, textVersion sai hoặc thiếu xác nhận phải bị từ chối. Response thành công chỉ sau commit. Registry đã có STALE_DRAFT/DRAFT_EXPIRED/DRAFT_ALREADY_CONFIRMED/DRAFT_NOT_EDITABLE cùng IDEMPOTENCY_CONFLICT. Phase 0 đã kiểm bốn lỗi draft qua HTTP; Phase 2 đã kiểm fingerprint/replay và cạnh tranh bằng DB thật, thêm safe503 khi hết lượt cấp mã.

## 5. Transaction, replay và UI

Core recheck auth/ownership → khóa routing/draft hoặc dùng CAS phù hợp → lookup key theo actor/operation → so payload/hash → validate → cấp mã Ticket duy nhất bằng cơ chế atomic → insert snapshot/Ticket OPEN + audit/outbox → consume draft nếu có → commit.

Replay cùng key/payload trả kết quả đã lưu; khác payload trả conflict. Một draft chỉ tạo một Ticket kể cả concurrent key khác nhau. Form thủ công phải có idempotency riêng với đúng nội dung người dùng gửi. Timeout dùng receipt và key cũ để đối soát. Notification retry không rollback Ticket đã commit.

T02 có popup xem/sửa/xác nhận draft và form tạo thủ công trên trang Tickets. Cancel không tạo Ticket. Draft đổi nội dung/version thì phải xem lại trước xác nhận. Staff list/detail/Accept/status theo TK01–TK05. Xác nhận tạo Ticket không là consent chia sẻ transcript.

Review và snapshot phải khớp bản Customer đã xác nhận; audit/outbox chỉ mang metadata cần thiết. Nội dung Agent theo system prompt [chính sách B](../../../../specifications/Agent_Design.md#mvp-model-data-policy); projection liên hệ Staff theo [ma trận Customer](../../../../configuration-and-data.md#customer-sensitive-data).

## 6. Test cases cần kiểm chứng

Dùng fixture hoàn toàn synthetic trong harness cô lập. Bảng là tiêu chí kiểm thử, chưa phải kết quả chạy.

| Mã | Ca kiểm thử | Kết quả mong đợi |
| --- | --- | --- |
| I07-T01 | Confirm false/textVersion sai/thiếu confirmation; Cancel | Không tạo Ticket/outbox |
| I07-T02 | Sai owner/role, draft hết hạn hoặc version cũ | Từ chối đúng contract, không ghi nghiệp vụ |
| I07-T03 | Hai key cùng draft, cùng key khác nội dung, mất ACK | Một Ticket/draft, replay hoặc conflict đúng; receipt bằng key cũ |
| I07-T04 | Sửa title/description/policy rồi confirm | Version/hash mới, snapshot đúng nội dung đã xem; policy ngoài owner bị chặn |
| I07-T05 | Form thủ công, double submit và replay | Một Ticket OPEN đúng owner/payload; list/detail hiển thị kết quả đã lưu |
| I07-T06 | Có/không Staff assignment; Staff Accept | Tạo OPEN trong cả hai trường hợp; Accept đúng quyền chuyển IN_PROGRESS |
| I07-T07 | Lỗi trước commit và delivery lỗi sau commit | Rollback nguyên tử trước commit; sau commit giữ Ticket/outbox để retry |
| I07-T08 | Ticket liên kết chat AI riêng; Staff đọc detail | Quyền Ticket không tự mở transcript; phân biệt snapshot mới và legacy |
| I07-T09 | Draft summary Agent và quyền đọc | Giữ sáu nhóm/nguồn, phân biệt lời khách với dữ liệu đã xác minh; audit/outbox tối thiểu và projection Staff đúng quyền |
| I07-T10 | Agent draft qua GET/revision/confirm/detail | Sáu nhóm và nguồn được giữ đủ; snapshot khớp revision Customer đã review |
| I07-T11 | Ref giả/ngoài quyền, đổi nguồn/hợp đồng hoặc finding chỉ dẫn lời khách | Từ chối ref không hợp lệ, tăng version khi nội dung/nguồn đổi; review lại trước confirm |
| I07-T12 | Manual/legacy hoặc nhóm summary rỗng | Phân biệt nguồn, không bịa finding; manual không cần Agent summary, legacy không tự có bằng chứng |

## 7. Checklist

- [x] Hai luồng tạo Ticket, sửa draft và trạng thái OPEN đã được duyệt.
- [x] Source có schema/controller/service/UI Customer Ticket.
- [x] Phase 2 đã sửa phần Application tại mục 2 và kiểm Core/API/DB/browser; các ca summary/nguồn còn theo mục riêng.
- [x] Giữ đầy đủ sáu nhóm summary Agent và nguồn đã được duyệt theo phương án A.
- [ ] Review/triển khai handoffPayload, revision/hash, DTO nguồn và snapshot theo thiết kế trên.
- [ ] Nghiệm thu các ca summary/nguồn với Agent/Core/UI thật theo phạm vi được mở.
