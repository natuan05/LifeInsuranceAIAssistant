# Spec sửa code Application theo tài liệu đã chốt

**Ngày đối chiếu:** 14/11/2026 · **Source:** `main@ca36235` · **Trạng thái:** đặc tả sửa chữa, chưa thực hiện sửa code.

## 1. Phạm vi và căn cứ

Spec áp dụng cho **Core NestJS, Web Next.js và tool local Application đã có source**. Mục tiêu là sửa hành vi đang lệch quy định, không xây lại các chức năng đã có.

Căn cứ nghiệp vụ: [quyền và dữ liệu](configuration-and-data.md#customer-sensitive-data), [Customer contracts](ui/customer/plans/README.md), [Staff contracts](ui/staff/plans/README.md). Chi tiết Ticket theo phần Application của [I07](ui/staff/plans/tickets/06-agent-confirmation.md); Notification theo [N01](ui/customer/plans/notifications/01-scope-recipient-contract.md)/[N02](ui/customer/plans/notifications/02-conditional-center.md). [Data Model](specifications/Data_Model.md) mô tả schema source; cột/bảng mới đề xuất dưới đây chỉ trở thành hiện trạng sau khi triển khai migration.

**Ngoài phạm vi:** code Agent, graph/model/RAG/checkpointer/HTTP-HMAC, Copilot chưa triển khai, nguồn tạo draft từ Agent thật, mở rộng handoffPayload/sáu nhóm summary/source registry. Chỉ kiểm và sửa GET/PUT/confirm draft Core hiện có bằng fixture synthetic. Không coi các phần ngoài phạm vi này là điều kiện hoàn tất spec.

### Mức độ bằng chứng

- **S — xác nhận từ source:** đã đọc trực tiếp nhánh xử lý, DTO hoặc caller liên quan; chưa đồng nghĩa đã tái hiện qua DB/browser.
- **T — có kết quả kiểm tra:** chạy compiler trong đợt này.
- **R — rủi ro cần test cạnh tranh:** source thiếu cơ chế bảo vệ hoặc có nhánh đáng ngờ; chưa kết luận hậu quả runtime nếu chưa có test.

Đã chạy `node node_modules/typescript/bin/tsc -p apps/web/tsconfig.json --noEmit --incremental false`: **pass**. Lệnh tương ứng cho Core: **fail**, gồm thiếu đối số Auth và mã lỗi draft chưa đăng ký. Các lỗi thiếu `ticketDraft/readAt/recipientCustomerId/confirmedContent` còn liên quan Prisma client local cũ; schema source đã có những thành phần này. Phải generate client đúng schema trước khi đánh giá lại lỗi kiểu. Chưa chạy DB, API hoặc browser E2E trong đợt viết spec.

### Những nền hiện có cần bảo toàn

| Phần đã đọc source | Hiện trạng và giới hạn kết luận |
| --- | --- |
| Auth/session, Staff self-profile | Có kiểm phiên/role/CSRF, logout và self-edit Staff; không phát hiện quyết định mới buộc đổi các luồng này. Hồi quy khi sửa transaction/quyền. |
| Customer profile | Self-read đã có, không có API Customer tự sửa; giữ nguyên. Staff projection/search cần sửa theo Phase 1. |
| Policy/Product/PDF | Có owner/assignment, catalog và exact-version access; chưa phát hiện chênh lệch cần phase chức năng riêng. Hồi quy các caller khi đổi profile. |
| Inbox/chat hai đầu | Có Direct, consent/Accept, grant, create cuộc AI mới và không có chat Close. Sửa read-status/notification trong Phase 3–4; không triển khai AI trả lời. |
| Ticket | Có Staff read/Accept/status và Customer manual/draft/edit/confirm/list/detail/receipt. Còn các chênh lệch Phase 0/2/3. |
| Tool local | Schema source có 20 model/13 migrations; verify/reset chưa theo kịp, xem Phase 5. |

## 2. Danh mục chênh lệch

| ID | Hiện trạng code và căn cứ | Hành vi phải đạt | Phase |
| --- | --- | --- | --- |
| APP-01 · S/T | [CustomerTicketController](../apps/core/src/tickets/controllers/customer-ticket.controller.ts) gọi authorizeWrite thiếu client; [SafeApiException](../apps/core/src/http/safe-api.exception.ts) chưa có bốn mã lỗi draft mà service đang dùng. | Compile đúng; auth/role và lỗi draft có contract an toàn. | 0 |
| APP-02 · S | [CustomerService](../apps/core/src/customers/services/customer.service.ts) dùng chung customerView cho self/Staff, trả raw email/phone/birth/address. [Web types](../apps/web/src/lib/customer-api.ts) cũng dùng chung Customer. | Tách DTO theo người nhận, mask/reveal đúng quyền, chỉ năm sinh/tỉnh-thành đã xác minh cho Staff. | 1 |
| APP-03 · S | CustomerService.list còn search email/phone; [Staff directory](../apps/web/src/components/staff-customer-directory.tsx) còn gợi ý/hiển thị các trường cũ. | Search chỉ fullName/accountCode; giữ scope/count/page và URL/Back. | 1 |
| APP-04 · S | [Confirm DTO](../apps/core/src/tickets/dto/confirm-ticket.dto.ts) chỉ IsBoolean/nonempty textVersion; [TicketService](../apps/core/src/tickets/services/ticket.service.ts) không buộc confirmed=true. DTO text kiểm độ dài trước trim; [draft service](../apps/core/src/tickets/services/ticket-draft.service.ts) hash trước trim. | Chỉ xác nhận hợp lệ được commit; nội dung chuẩn hóa và hash khớp revision lưu. | 2 |
| APP-05 · S | TicketService replay chỉ đối chiếu key/customer; [ticket-api](../apps/web/src/lib/ticket-api.ts) sinh UUID mới mỗi lần gọi manual/confirm, chưa có wrapper receipt. | Replay kiểm operation/nội dung; Web giữ key của intent và đối soát khi chưa rõ kết quả. | 2 |
| APP-06 · S/R | Draft update/confirm đọc version rồi update theo id; auth Customer mutation ở ngoài transaction. Đã có unique source_draft_id nên không kết luận có thể lưu hai Ticket/draft. | Chặn stale edit/confirm, recheck phiên/quyền trong transaction; race trả lỗi nghiệp vụ thay vì P2002/500. | 2 |
| APP-07 · S | Staff projectDetail luôn dùng [legacyTicketConfirmation](../apps/core/src/tickets/dto/ticket-confirmation.ts), không select snapshot mới; Web Ticket type cố định confirmedContent=null. | Hiển thị snapshot đã xác nhận khi hợp lệ, giữ legacy chưa xác minh cho bản ghi thiếu snapshot. | 2 |
| APP-08 · S/R | Customer Ticket list nhận query rời, ép Number/status as any; Customer methods chưa gọi quota Ticket như phía Staff. | DTO strict, phân trang ổn định, quota và read/auth snapshot đúng scope. Đầu vào sai không thành lỗi Prisma/500. | 2 |
| APP-09 · S | [Draft dialog](../apps/web/src/components/customer-ticket-confirmation.tsx) chỉ sửa title/description, giữ policy cũ và hardcode ticket-v1; Ticket UI còn nhãn Việt/alert. | Sửa được policy thuộc owner, dùng confirmation server trả, xử lý tại chỗ và English labels theo contract UI. | 2 |
| APP-10 · S | [conversation-api](../apps/web/src/lib/conversation-api.ts) dùng link/nested notification/markedCount, Core trả target/flat/count. markConversationRead gọi role-specific URL, controller hiện có là [common read](../apps/core/src/conversations/controllers/common-conversation.controller.ts). | Một DTO thống nhất và đúng route read; chuông điều hướng đúng resource. | 3 |
| APP-11 · S | Ticket create producer thiếu version trong event; [consumer](../apps/core/src/tickets/services/ticket-event.service.ts) yêu cầu version và return trước nhánh Customer nếu không có Staff. | Event hợp lệ, Customer nhận thông báo Ticket của mình kể cả chưa có Staff phụ trách. | 3 |
| APP-12 · S/R | [ConversationEventService](../apps/core/src/conversations/services/conversation-event.service.ts) chọn message mới nhất khi xử lý bất kỳ MESSAGE_COMMITTED; [markAsRead](../apps/core/src/conversations/services/conversation-message.service.ts) cũng phát event cùng loại, không chỉ rõ message. | Xử lý đúng message/sender/mốc của event; đọc chat không bị hiểu thành có tin mới. | 4 |
| APP-13 · S | Consumer gộp bằng isRead=false, cập nhật createdAt; dedupKey nằm trên notification có thể bị cleanup. | Chu kỳ theo mốc đọc chat; tin mới giữ id khi mục còn tồn tại và bật unread; retry không tái báo hoặc kéo dài retention. | 4 |
| APP-14 · S | [NotificationsService](../apps/core/src/notifications/notifications.service.ts) cleanup khi bootstrap và mỗi giờ. | Bootstrap + mỗi 24 giờ; retention 30 ngày cho cả hai role/read-unread. | 4 |
| APP-15 · S | [verify-models](../apps/core/scripts/verify-models.mjs) cố định 17 bảng; [dev-data-reset](../apps/core/src/cli/dev-data-reset.ts) liệt kê 19, thiếu ticket_drafts đang có FK tới bảng khác. | Verify/reset bao phủ schema Application thực tế, gồm bảng mới của đợt sửa. | 5 |

## 3. Thứ tự và phụ thuộc

**Phase 0 → Phase 1 và Phase 2 → Phase 3 → Phase 4 → Phase 5.**

Phase 1/2 độc lập về nghiệp vụ sau Phase 0; Phase 3 dùng producer Ticket đã sửa; Phase 4 dựa trên DTO/route đã thống nhất. Tool ở Phase 5 phải theo schema cuối của các phase trước. Mỗi phase có thể review riêng, chỉ đánh dấu hoàn tất sau các test của phase.

## 4. Phase 0 — Sửa lỗi nền Core Ticket

**Phạm vi:** APP-01. Owner: Customer T01 và I07, chỉ phần Core Application.

1. Sửa lời gọi authorizeWrite theo signature có client; mọi route Customer draft phải kiểm role CUSTOMER. Không chỉ truyền thêm đối số để compiler hết lỗi rồi bỏ qua transaction/quyền.
2. Đăng ký lỗi an toàn HTTP 409: DRAFT_EXPIRED, STALE_DRAFT, DRAFT_ALREADY_CONFIRMED, DRAFT_NOT_EDITABLE. Không trả stack/SQL/draft của người khác.
3. Giữ endpoint draft hiện có theo đúng quyền; không biến route propose hiện tại thành API tích hợp Agent hoặc bằng chứng nguồn Agent đã được triển khai.
4. Generate Prisma client từ schema repo theo quy trình build/typecheck, không sửa hoặc commit generated code. Chạy lại compiler để phân biệt lỗi source còn thật với client cũ.

**File sửa:** CustomerTicketController, TicketDraftService, SafeApiException và wiring/module cần thiết. AuthService giữ contract, không nới quyền.

**Nghiệm thu A0:**
- A0-01: Core typecheck sau generate pass; Web typecheck vẫn pass.
- A0-02: thiếu/hết phiên → 401; sai role → 403; thiếu/sai Origin hoặc CSRF bị từ chối trước mutation.
- A0-03: từng mã draft trả 409 safe envelope; draft ngoài owner/cuộc trả 404, không lộ nội dung.

## 5. Phase 1 — Projection, search và Hiện/Ẩn liên hệ Staff

**Phạm vi:** APP-02/03. Owner: [CU01/CU02](ui/staff/plans/02-customers-contract.md). Các API dưới dùng prefix /api/v1.

### Contract đích

| API | Thay đổi |
| --- | --- |
| GET /customers/me | Giữ self-read theo contract hiện có; không áp mask Staff lên Customer hoặc Staff contact của Customer. |
| GET /staff/customers | Giữ items/total/page/pageSize. items có id/fullName/accountCode/status/email/phone; email/phone là bản che hoặc null. Search chỉ fullName/accountCode. |
| GET /staff/customers/:customerId | customer dùng Staff DTO riêng; thay birth/address bằng birthYear:number\|null, provinceCity:string\|null. Không có raw hoặc bản sao trong field phụ. |
| POST /staff/customers/:customerId/contact-reveal | Body duy nhất {field:"email"\|"phone"}. Response {customerId,field,value:string\|null}; no-store, current Staff session/CSRF/Origin và active assignment. Đây là endpoint đích còn cần triển khai theo CU01. |

- Email: ký tự đầu + ***; che cả domain. Phone: *** + hai chữ số cuối. Thiếu null; quá ngắn để vừa giữ vừa che thì ***. Full name/accountCode/policyNumber vẫn đầy đủ trong scope đã duyệt.
- Source hiện chưa có tỉnh/thành hoặc metadata xác minh. **Đối với dữ liệu hiện chưa có căn cứ xác minh, trả null cho từng trường birthYear/provinceCity**; không suy từ tuổi, LLM hoặc cắt address tự do. Phase này không tự tạo quy trình xác minh hoặc coi birth non-null là đã xác minh.
- Reveal theo thứ tự lock dùng chung users → Customer → assignment; recheck auth/role/assignment trong transaction trước đọc. Ngoài scope/không tồn tại cùng 404. Audit metadata actor/Customer/field/requestId/kết quả, không raw.
- UI chỉ gọi reveal sau bấm Hiện, từng trường độc lập; pending/error tại chỗ. Raw chỉ trong state contact đang mở, xóa khi Ẩn/đổi khách/logout/revoke. Không prefetch raw, browser storage hoặc mailto/tel/copy trước reveal. Response muộn phải khớp Customer/request còn hiệu lực.
- Bỏ email/phone khỏi Swagger search, placeholder và predicate/count. Search query cũ cũng chỉ so tên/mã; giữ literal/trim/case, active assignment trước count/page và Back/Forward.

**File sửa:** CustomerService/CustomerController/CustomerListQuery; customer-api.ts; staff-customer-directory.tsx; caller contact tại Policy/Inbox/Ticket nếu có. Tách type StaffCustomer/OwnProfile, không đổi dữ liệu gốc hoặc che PDF/transcript.

**Schema:** mask/reveal không cần cột masked; không thêm migration chỉ để hiển thị null khi thiếu nguồn xác minh.

**Nghiệm thu A1:**
- A1-01: list/detail/default network/DOM không có raw liên hệ; null/Unicode/chuỗi ngắn đúng định dạng; self-read không đổi.
- A1-02: token chỉ có trong email/phone không ảnh hưởng items/total; tên/mã vẫn tìm đúng, scope/page/URL/Back không hồi quy.
- A1-03: reveal đúng field/owner/assignment, null, field lạ, CSRF và audit; giữ request qua revoke/đổi khách/logout không làm raw xuất hiện lại.
- A1-04: birth/address đầy đủ không còn trong Staff DTO; nguồn chưa xác minh trả null; Policy/PDF/policyNumber và Staff self-edit giữ hành vi cũ.
- Đối chiếu CU01-T05/T06/T07 và CU02-T06; mở rộng suite customers.test.cjs, staff-customers.spec.mjs và staff-foundation.integration.spec.mjs.

## 6. Phase 2 — Tính đúng đắn của Ticket đã có

**Phạm vi:** APP-04–09. Owner: [Customer T01/T02](ui/customer/plans/07-tickets-contract.md), TK02/TK04 và phần Application I07.

### 6.1. Validation và API

Giữ GET/PUT draft, POST /customers/me/tickets, POST .../tickets/manual, own list/detail và receipt by-client-request-id hiện có.

- Chuẩn hóa title/description bằng trim **trước** validation/hash/lưu: title 1–255, description 1–4000. Toàn khoảng trắng → 400; unknown fields/UUID/body/query sai bị từ chối. policyId rỗng chuẩn hóa về null theo DTO, policy khác owner → 404.
- Confirm chỉ chấp nhận confirmation.confirmed=true và textVersion=ticket-v1 từ contract server. Kiểm tại DTO và invariant service. Draft đúng owner/cuộc, DRAFT, đúng expectedDraftVersion và expiresAt > thời điểm kiểm.
- Own list dùng DTO: status thuộc TicketStatus hiện có; search trim/literal 0–100; page integer 1–100000, pageSize integer 1–50. Không ép Number/any rồi giao Prisma. Order createdAt DESC,id DESC; count/items trong cùng read snapshot và current Customer auth.
- Các GET draft/list/detail/receipt kiểm lại Customer session/role trong read transaction như wrapper Staff hiện có; projection allowlist theo owner. Mutation kiểm quyền lại sau khi khóa, kể cả đường replay.
- Customer mutation áp quota đã ghi tại T01: 10 request/phút/actor, tách khỏi quota Staff Accept. Customer read/receipt có kiểm quota; 429 kèm Retry-After theo helper hiện có.

### 6.2. Transaction, idempotency và snapshot

Luồng ghi đích: authorize → lock routing → reauthorize trong tx → lookup key/fingerprint → lock draft nếu có → kiểm state/version/expiry/owner → ghi Ticket/snapshot/audit/outbox + consume draft → commit.

- Tái dùng lockCustomer/lock của ConversationCommandService, giữ thứ tự users → Customer → assignment → conversation nếu có → draft/Ticket. Manual không cần tạo conversation hoặc grant mới.
- PUT draft dùng CAS theo id/customerId/conversationId/state=DRAFT/version/expiry; thất bại trả lỗi nghiệp vụ. Hash canonical dựa đúng title/description/policyId đã chuẩn hóa. Confirm và edit phải dùng cùng thứ tự khóa.
- Giữ unique source_draft_id hiện có. Hai key confirm cùng draft chỉ một commit; bên thua nhận DRAFT_ALREADY_CONFIRMED hoặc STALE_DRAFT phù hợp, không raw unique violation. Không dùng SELECT kiểm trước làm thay thế unique constraint.
- Lưu **requestFingerprint** bất biến cho request tạo Ticket mới bằng migration bổ sung nullable trên support_tickets, map SQL request_fingerprint varchar(64), CHECK null hoặc SHA-256 hex hợp lệ. Hash bao gồm actor và operation; manual gồm title/description/policyId chuẩn hóa, confirm gồm draftId/expectedDraftVersion/confirmed/textVersion. Snapshot ghi revision/content hash tương ứng.
- Giữ unique idempotency_key; cùng actor/key/operation/input trả Ticket cũ sau reauthorize, khác operation/input → 409 IDEMPOTENCY_CONFLICT. Key của actor khác không trả tài nguyên ngoài quyền. Legacy thiếu fingerprint chỉ replay khi xác minh đủ input gốc; không đoán, không backfill bằng nội dung hiện tại.
- Ticket OPEN, recipient từ assignment hiện hành; Staff Accept → IN_PROGRESS. Cấp ticketCode có unique constraint và retry có giới hạn khi collision; không vòng lặp vô hạn hoặc retry toàn bộ lỗi nghiệp vụ.
- Snapshot của Ticket mới bất biến sau tạo. Staff/Customer projection trả đúng title/description/policy và confirmation tương ứng. Legacy thiếu snapshot không được suy ra xác nhận từ aiSummary/confirmedAt.
- Đích DTO Staff: confirmationSource là CUSTOMER_SUBMITTED cho form manual, CUSTOMER_CONFIRMED cho draft được xác nhận, LEGACY_UNVERIFIED cho bản ghi không đủ snapshot. Chỉ project snapshot hợp lệ theo nguồn tạo do Core kiểm soát; Web không tự khai nguồn. Cập nhật type hiện đang cố định null.
- Không dựa vào update EXPIRED rồi throw trong cùng tx để lưu trạng thái hết hạn: expiresAt là căn cứ từ chối, không cho nhánh expire ghi đè draft đã CONFIRMED.

### 6.3. Web và đối soát

- Đưa clientRequestId ra khỏi wrapper API: component giữ một key cho một intent; retry chưa rõ kết quả dùng lại key. Bổ sung wrapper receipt hiện đã có Core.
- Timeout/mất response: giữ intent, tra receipt; 404 trong lúc request có thể đang commit chưa là bằng chứng thất bại. Nếu cần gửi lại phải dùng cùng key/input. Chỉ tạo key mới sau khi intent cũ đã giải quyết hoặc người dùng chủ động tạo yêu cầu khác.
- Intent/abort controller gắn actor, draft/revision hoặc manual form. Response muộn không đóng dialog hay đưa dữ liệu vào actor mới. Không lưu nội dung Ticket vào browser storage.
- Draft editor cho sửa policy thuộc owner hoặc bỏ chọn; revision server mới phải được review trước confirm. Lưu cả confirmation.text và textVersion do server trả, không hardcode version trong handler.
- Success chỉ sau response/receipt commit, hiển thị mã và chuyển tới detail persisted. Thay alert bằng trạng thái tại vùng/dialog, English labels theo Customer contract; không quảng bá e-Claim như chức năng đã triển khai. Lời xác nhận hiển thị đúng text/version server trả; không tự dịch hoặc sửa lời xác nhận rồi giữ nguyên version.
- Snapshot cơ bản Core giữ nguyên; không thêm nguồn draft Agent thật hoặc handoffPayload vào phase này.

**File sửa:** TicketService/TicketDraftService/CustomerTicketController, DTO Ticket/draft/query, ticket-confirmation.ts, schema/migration mới; ticket-api.ts, customer-tickets.tsx, customer-ticket-confirmation.tsx, Staff Ticket detail/types.

**Nghiệm thu A2:**
- A2-01: false/missing confirmation, version lời xác nhận sai, text rỗng sau trim, policy sai owner và unknown fields không tạo Ticket/audit-success/outbox.
- A2-02: same key/same input replay một Ticket; same key/different input hoặc operation → 409; other actor không đọc receipt.
- A2-03: hai key cùng draft, hai edit cùng version, edit song song confirm, expiry và logout/reassignment trước commit: kết quả theo lock/CAS, snapshot không stale, không 500/raw SQL.
- A2-04: mất ACK ở manual/confirm → Web tra key cũ và không tạo thêm Ticket; đổi actor/đóng modal/response muộn không áp vào UI mới.
- A2-05: query NaN/fraction/ngoài range/status lạ/query thừa → 400; pagination tie ổn định, scope/count nhất quán, quota → 429.
- A2-06: Staff đọc Ticket mới thấy snapshot; legacy vẫn chưa xác minh; status/Accept/chatLink không thay grant. Sửa/bỏ policy rồi review/confirm đúng revision.
- Test DB cạnh tranh phải chạy thật trong harness; không dùng mock để kết luận khóa/CAS. Mở rộng ticket-foundation.test.cjs, tickets-read.test.cjs và ticket-flow.integration.spec.mjs; thêm suite Customer Ticket theo chức năng nếu hiện chưa có.

## 7. Phase 3 — Contract Notification và Ticket event

**Phạm vi:** APP-10/11. Owner: Customer N02, Staff NO01/NO02, TK05.

### Contract thống nhất

| API / DTO | Đích |
| --- | --- |
| Customer list notification | items có id/kind/title/body/isRead/createdAt/**target**:{type,id}; pageInfo giữ keyset. Không dùng link ở Web. |
| POST /customers/me/notifications/:id/read | {id,isRead:true} |
| POST /customers/me/notifications/read-all | {success:true,count:number} |
| POST /conversations/:conversationId/read | {success:true,readAt:string}; Web cả Staff/Customer dùng route common, Core suy role từ session và kiểm gate tương ứng. |

Không tạo role-specific alias chỉ để che lỗi caller. Read/read-all chuông không đánh dấu chat đã xem. Target navigation refetch tài nguyên theo quyền; notification không tự tạo grant.

1. Đồng bộ conversation-api.ts, notification-api.ts, customer-workspace.tsx với DTO Core; giữ nhánh Staff đang đúng. Badge mô tả số chưa đọc đã tải, không tự coi là tổng DB.
2. Ticket create từ manual/confirm phát schemaVersion=1 và **version:0**, cùng transaction Ticket/audit/outbox. Không mang confirmedContent hoặc raw contact trong event.
3. Ticket consumer xác minh event/Ticket rồi xử lý Customer recipient theo owner, **độc lập với việc có Staff hay không**. Nhánh Staff vẫn cần recipient và active assignment theo TicketAccessService. Retry cùng event không tạo bản ghi trùng.
4. Đọc/realtime vẫn reauthorize trước công bố. Ticket đã commit không rollback vì broker/worker/notification lỗi.
5. Với outbox cũ thiếu version/đã retry hoặc DLQ: có đường repair/replay idempotent kiểm aggregate và dữ liệu commit; không xóa sự kiện hoặc tạo Ticket mới để “sửa”. Chỉ sửa payload TICKET_CREATED cũ có bằng chứng phù hợp; không gán version hiện tại thay version tạo ban đầu.

**File sửa:** NotificationsService/DTO nếu cần; conversation-api.ts/customer-workspace.tsx; TicketService/TicketEventService; outbox runner và fixture event liên quan.

**Nghiệm thu A3:**
- A3-01: dùng Core response thật, click chuông đi đúng chat/Ticket; read/read-all đúng shape; không còn 404 từ read route của hai role.
- A3-02: Ticket manual/confirm có và không có assignment đều báo Customer đúng owner; Staff chỉ nhận khi hợp lệ.
- A3-03: retry/outbox restart, event lỗi cũ và repair không nhân đôi Notification/Ticket, không bỏ qua event âm thầm.
- A3-04: revoke/ngoài scope không vào resource qua chuông; đọc chuông không đánh dấu chat. Mở rộng N02-T01/T02/T03/T04 và I07-T06.

## 8. Phase 4 — Unread cycle, read status và retention

**Phạm vi:** APP-12–14. Phase này sửa pipeline Application hiện có, không thêm broker/scheduler cloud.

### 8.1. Nhận diện event và trạng thái bền vững

- MESSAGE_COMMITTED mới dùng payload version 2, phân biệt reason MESSAGE_APPENDED với MESSAGES_READ. APPENDED có messageId và sequence; READ có mốc đã đọc do Core xác định. Không mang content. Consumer đọc đúng message của event, kiểm conversation/audience/sender; không query message cuối để đoán event.
- Cùng event type vẫn có thể invalidate transcript khi read; **chỉ APPENDED của bên đối diện mới xét thông báo tin mới**. Consumer/dispatcher và fixture phải hiểu version mới.
- Đề xuất migration Application: bảng **conversation_notification_states**, unique (recipient_user_id,conversation_id,kind), FK tới users/conversations; kind chỉ hai loại STAFF_MESSAGE_UNREAD/CUSTOMER_MESSAGE_UNREAD. Lưu read_through_sequence, last_processed_sequence, cycle_start_sequence và active_notification_id nullable; FK notification dùng ON DELETE SET NULL.
- Hai watermark dùng bigint NOT NULL default 0, CHECK >= 0; cycle_start_sequence bigint nullable, CHECK null hoặc > 0. active_notification_id là UUID nullable; state có updated_at. Recipient/kind và notification đang gắn phải đúng conversation/role/scope do Core kiểm, không nhận các giá trị điều phối này từ browser.
- Đây là trạng thái đề xuất của spec, chưa có trong schema. Nó bảo vệ chu kỳ/dedup sau khi notification bị đánh dấu đọc hoặc cleanup. Không dùng isRead làm khóa chu kỳ, không dùng cache/memory thay storage.
- Khóa trạng thái cùng thứ tự routing/conversation đang dùng; khóa conversation trước khi upsert state để tránh hai consumer tạo hai mục cùng chu kỳ. Recheck grant/assignment tại điểm xử lý.
- Với nguồn outbox v1 không xác định được message: reconciliation theo scope, message sequence/readAt và watermark, không suy thành “message mới nhất của event”. Migration phải có backfill/đường catch-up kiểm chứng, không tự coi mọi tin lịch sử là chưa báo.

### 8.2. Quy tắc xử lý

1. Read chat khóa conversation và chốt mốc sequence hiện hành cần đánh dấu; chỉ cập nhật đúng sender/audience đến mốc đó. Cập nhật readAt, read_through_sequence, kết thúc chu kỳ và notification tương ứng trong cùng tx.
2. Event sequence đã xử lý hoặc không vượt mốc đã đọc không tái bật unread. Event hợp lệ mới hơn: nếu còn notification của chu kỳ thì giữ id và đặt isRead=false; nếu chưa có/đã cleanup thì tạo một mục cho tin mới hợp lệ.
3. Read chuông/read-all chỉ đổi isRead. Không đổi read_through_sequence hoặc kết thúc chu kỳ. Retry cùng event sau thao tác này không tái bật unread; tin mới thực sự thì có.
4. Không sửa createdAt để biểu diễn activity hoặc retry. Thời hạn 30 ngày tính từ created_at của dòng notification. Watermark không bị dọn cùng notification; event cũ sau cleanup không tái tạo mục cũ.
5. Trạng thái dẫn xuất giữ theo vòng đời Conversation trong MVP, không tự thêm TTL cho chat. Khác Staff/assignment không tái sử dụng active notification của Staff cũ; mọi DTO/WS vẫn qua gate hiện hành.
6. Read-status phải được quan sát qua resync/history hiện có; UI không báo thành công âm thầm khi route lỗi. Không tạo conversation Close hoặc tự quay về AI.

### 8.3. Cleanup

NotificationsService chạy một lần khi bootstrap và mỗi **86_400_000 ms**, hủy timer khi destroy. Xóa created_at **nhỏ hơn** cutoff 30 ngày, cho cả Staff/Customer và read/unread; không xóa Message/Ticket/audit hoặc watermark còn cần cho chống trùng. Lỗi DB không làm mất dữ liệu hoặc dừng vĩnh viễn các lần cleanup sau; log chỉ metadata an toàn.

**File sửa:** ConversationMessageService/ConversationEventService, NotificationsService, OutboxDispatcherService, realtime mapping nếu cần; schema/migration/state helper trong module hiện có; Web chat/read callers và tests.

**Nghiệm thu A4:**
- A4-01: hai role gửi nhiều tin → một mục/chu kỳ; đọc chuông → tin mới giữ id và bật unread; đọc chat → tin sau mốc tạo chu kỳ mới.
- A4-02: duplicate/out-of-order event, sender xen kẽ, mark-read event và restart: không báo sai người/sai tin, không tái bật từ retry.
- A4-03: read chat song song send/consumer, Accept/reassignment/revoke: watermark và unread đúng thứ tự commit, không mất tin sau mốc hoặc lộ quyền cũ.
- A4-04: notification đã cleanup rồi retry event cũ → không tái tạo; tin mới hợp lệ vẫn được báo. createdAt không đổi bởi retry/gộp.
- A4-05: fake timer bootstrap/trước/đúng 24 giờ/restart/destroy; cutoff trước/đúng/sau 30 ngày cho hai role/read-unread, DB lỗi rồi hồi phục.
- Mở rộng N02-T05/T07/T09/T10 và conversation-realtime/integration; DB/concurrency/restart dùng harness thật, timer dùng fake clock.

## 9. Phase 5 — Tool local và hồi quy Application

**Phạm vi:** APP-15 và nghiệm thu toàn bộ phase.

- verify-models đối chiếu **tên bảng/model và quyền** với schema Application thực tế, gồm ticket_drafts và state mới; không chỉ thay số 17 thành một hằng mới.
- dev-data-reset liệt kê đầy đủ bảng cần reset theo FK, gồm ticket_drafts/state. Giữ cơ chế xác nhận, đúng database/volume fixture và schema; không mở CASCADE hoặc thêm quyền reset cho Core runtime.
- Schema hiện có unique source_draft_id và composite FK policy/customer: bảo toàn, không dựng lại hoặc coi là thiếu. Migration mới phải additive/kiểm dữ liệu cũ, không sửa migration đã apply hoặc reset để né nâng cấp.
- Cập nhật Data Model, API/DTO và các plan sở hữu theo code thực tế sau khi test; không đánh dấu phần Agent hoặc toàn bộ I07 đã hoàn tất từ kết quả Application này.

**Nghiệm thu A5:**
- A5-01: migration từ DB fixture có Ticket/draft/Notification/message cũ giữ dữ liệu, constraint và quyền; generate/typecheck/build đúng schema mới.
- A5-02: verify đúng tập bảng và role read-only không có quyền ghi; reset trong fixture riêng thành công khi có draft/state, runner dọn đúng dữ liệu test.
- A5-03: hồi quy Auth/Staff self-edit/Customer read-only, owner/assignment Policy/Product/PDF, Direct/consent/Accept, New AI chat và Staff Ticket status. Không có Close chat hoặc grant kế thừa ngoài quyền.
- A5-04: browser qua gateway trên Chromium/Firefox/WebKit: URL/Back, không F5, pending/error/response muộn, keyboard/mobile; dùng DOM/network, không screenshot.

Các lệnh chung hiện có: `npm run typecheck`, `npm run test:customers`, `npm run test:browser:staff`. Suite Core/DB và reset chạy trong test service/harness Docker hiện có theo [Getting Started](getting-started.md), bổ sung runner theo chức năng khi thiếu; không chạy reset trên dữ liệu đang dùng hoặc dựng Web/Core bằng npm trên host.

## 10. Điều kiện hoàn tất

- [ ] APP-01–15 được sửa và có bằng chứng test tương ứng A0–A5; rủi ro R được kiểm bằng test phù hợp.
- [ ] Main build/typecheck và các suite Application bị ảnh hưởng pass sau generate; không lấy Web typecheck thay kiểm contract JSON/API.
- [ ] Tài liệu/DTO/Swagger/schema/plan phản ánh đúng code đã sửa; ghi rõ phần chưa chạy hoặc ngoài phạm vi.
- [ ] Không còn file tạm/fixture/log/cache do đợt sửa tạo mà không cần giữ; không xóa credential, dữ liệu người dùng hoặc Docker volumes.
- [ ] Chỉ nghiệm thu Application trong phạm vi trên; không yêu cầu Agent hoặc hạ tầng production để đóng spec.
