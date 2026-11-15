# Spec sửa code Application theo tài liệu đã chốt

**Đối chiếu source:** 15/11/2026 · **Trạng thái:** Phase 0–2 có code; Phase 2 chưa đóng nghiệm thu vì còn ca browser đổi actor khi Ticket đang pending. Phase 3–5 chưa triển khai theo spec. Checklist này chỉ bao gồm Application hiện có, không bao gồm nối Core–Agent.

## 1. Phạm vi và căn cứ

Spec áp dụng cho **Core NestJS, Web Next.js và tool local Application đã có source**. Mục tiêu là sửa hành vi đang lệch quy định, không xây lại các chức năng đã có.

Căn cứ nghiệp vụ: [quyền và dữ liệu](configuration-and-data.md#customer-sensitive-data), [Customer contracts](ui/customer/plans/README.md), [Staff contracts](ui/staff/plans/README.md). Chi tiết Ticket theo phần Application của [I07](ui/staff/plans/tickets/06-agent-confirmation.md); Notification theo [N01](ui/customer/plans/notifications/01-scope-recipient-contract.md)/[N02](ui/customer/plans/notifications/02-conditional-center.md). [Data Model](specifications/Data_Model.md) mô tả schema source; cột/bảng mới đề xuất dưới đây chỉ trở thành hiện trạng sau khi triển khai migration.

**Ngoài phạm vi:** code Agent, graph/model/RAG/checkpointer/HTTP-HMAC, Copilot chưa triển khai, nguồn tạo draft từ Agent thật, mở rộng handoffPayload/sáu nhóm summary/source registry. Chỉ kiểm và sửa GET/PUT/confirm draft Core hiện có bằng fixture synthetic. Không coi các phần ngoài phạm vi này là điều kiện hoàn tất spec.

Phase 0–2 có code cho projection/reveal và Ticket validation/replay/CAS/snapshot; còn ca A2-04 trước khi đóng Phase 2. Phase 3–5 theo checklist dưới đây. [Lệnh kiểm thử](#application-tests) dùng harness Docker/gateway.

### Những nền hiện có cần bảo toàn

| Phần đã đọc source | Hiện trạng và giới hạn kết luận |
| --- | --- |
| Auth/session, Staff self-profile | Có kiểm phiên/role/CSRF, logout và self-edit Staff; không phát hiện quyết định mới buộc đổi các luồng này. Hồi quy khi sửa transaction/quyền. |
| Customer profile | Self-read đã có, không có API Customer tự sửa; giữ nguyên. Staff projection/search và Hiện/Ẩn liên hệ đã sửa theo Phase 1. |
| Policy/Product/PDF | Có owner/assignment, catalog và exact-version access; chưa phát hiện chênh lệch cần phase chức năng riêng. Hồi quy các caller khi đổi profile. |
| Inbox/chat hai đầu | Có Direct, consent/Accept, grant, create cuộc AI mới và không có chat Close. Sửa read-status/notification trong Phase 3–4; không triển khai AI trả lời. |
| Ticket | Có Staff read/Accept/status và Customer manual/draft/edit/confirm/list/detail/receipt. Phase 0/2 đã xử lý nền, validation, replay/CAS và snapshot; event/notification tiếp tục ở Phase 3. |
| Tool local | Schema source có 20 model/14 migrations; verify/reset chưa theo kịp, xem Phase 5. |

## 2. Danh mục chênh lệch

| ID | Hiện trạng code và căn cứ | Hành vi phải đạt | Phase |
| --- | --- | --- | --- |
| APP-01 | **Đã sửa Phase 0:** route draft dùng auth/role Customer trong transaction service; [SafeApiException](../apps/core/src/http/safe-api.exception.ts) có đủ bốn mã lỗi draft 409. | Compile đúng; auth/role và lỗi draft có contract an toàn. | 0 |
| APP-02 | [CustomerService](../apps/core/src/customers/services/customer.service.ts) đã tách self/Staff; Staff chỉ nhận email/phone đã che, birthYear/provinceCity null khi chưa xác minh. [Web types](../apps/web/src/lib/customer-api.ts) đã tách Customer/StaffCustomer và state reveal riêng. | Tách DTO theo người nhận, mask/reveal đúng quyền, chỉ năm sinh/tỉnh-thành đã xác minh cho Staff. | 1 |
| APP-03 | CustomerService.list đã bỏ search email/phone; [Staff directory](../apps/web/src/components/staff-customer-directory.tsx) đã đồng bộ tên/mã, projection và Hiện/Ẩn. | Search chỉ fullName/accountCode; giữ scope/count/page và URL/Back. | 1 |
| APP-04 | DTO/service đã trim trước validation/hash, buộc confirmed=true và ticket-v1; policy đúng owner. | Giữ kiểm tại HTTP và invariant service; không có side effect khi từ chối. | 2 |
| APP-05 | Ticket mới lưu requestFingerprint; replay kiểm actor/operation/input. Web giữ intent/key và tra receipt khi chưa rõ kết quả. | Legacy không đủ input gốc trả conflict; raw không vào browser storage. | 2 |
| APP-06 | Draft edit/confirm dùng chung khóa routing → draft, reauthorize và CAS version/state/expiry. | Unique source_draft_id giữ nguyên; đã kiểm các race bằng DB thật. | 2 |
| APP-07 | Staff/Customer project snapshot cơ bản hợp lệ thành CUSTOMER_SUBMITTED/CUSTOMER_CONFIRMED; Web hiển thị nội dung lưu. | Legacy/invalid giữ LEGACY_UNVERIFIED/null; sáu nhóm Agent còn ngoài phạm vi. | 2 |
| APP-08 | Own list dùng DTO strict, order createdAt DESC/id DESC, read snapshot và quota Customer riêng. | Validation 400, rate limit 429/Retry-After; count/items cùng scope. | 2 |
| APP-09 | Draft dialog sửa/bỏ policy, review revision và giữ confirmation text/version server; UI English, success tại chỗ rồi mở detail persisted. | Không nối nguồn draft Agent thật hoặc summary/refs trong Phase 2. | 2 |
| APP-10 | [conversation-api](../apps/web/src/lib/conversation-api.ts) dùng link/nested notification/markedCount, Core trả target/flat/count. markConversationRead gọi role-specific URL; Core hiện có cả route Customer/Staff và [common read](../apps/core/src/conversations/controllers/common-conversation.controller.ts), cùng gọi markAsRead. Không kết luận thiếu route/404 chỉ từ tên caller. | Thống nhất DTO và chuẩn hóa caller về common read theo contract đích; giữ kiểm role/gate. Chuông điều hướng đúng resource. | 3 |
| APP-11 | Ticket create producer thiếu version trong event; [consumer](../apps/core/src/tickets/services/ticket-event.service.ts) yêu cầu version và return trước nhánh Customer nếu không có Staff. | Event hợp lệ, Customer nhận thông báo Ticket của mình kể cả chưa có Staff phụ trách. | 3 |
| APP-12 | [ConversationEventService](../apps/core/src/conversations/services/conversation-event.service.ts) chọn message mới nhất khi xử lý bất kỳ MESSAGE_COMMITTED; [markAsRead](../apps/core/src/conversations/services/conversation-message.service.ts) cũng phát event cùng loại, không chỉ rõ message. | Xử lý đúng message/sender/mốc của event; đọc chat không bị hiểu thành có tin mới. | 4 |
| APP-13 | Consumer gộp bằng isRead=false, cập nhật createdAt; dedupKey nằm trên notification có thể bị cleanup. | Chu kỳ theo mốc đọc chat; tin mới giữ id khi mục còn tồn tại và bật unread; retry không tái báo hoặc kéo dài retention. | 4 |
| APP-14 | [NotificationsService](../apps/core/src/notifications/notifications.service.ts) cleanup khi bootstrap và mỗi giờ. | Bootstrap + mỗi 24 giờ; retention 30 ngày cho cả hai role/read-unread. | 4 |
| APP-15 | [verify-models](../apps/core/scripts/verify-models.mjs) cố định 17 bảng; [dev-data-reset](../apps/core/src/cli/dev-data-reset.ts) liệt kê 19, thiếu ticket_drafts đang có FK tới bảng khác. | Verify/reset bao phủ schema Application thực tế, gồm bảng mới của đợt sửa. | 5 |

## 3. Thứ tự và phụ thuộc

**Phase 0 → Phase 1 và Phase 2 → Phase 3 → Phase 4 → Phase 5.**

Phase 1/2 độc lập về nghiệp vụ sau Phase 0; Phase 3 dùng producer Ticket đã sửa; Phase 4 dựa trên DTO/route đã thống nhất. Tool ở Phase 5 phải theo schema cuối của các phase trước. Mỗi phase có thể review riêng, chỉ đánh dấu hoàn tất sau các test của phase.

## 4. Phase 0 — Sửa lỗi nền Core Ticket

**Phạm vi:** APP-01. Owner: Customer T01 và I07, chỉ phần Core Application. **Đã hoàn tất A0-01–03.** Test tại [customer-ticket-boundary.test.cjs](../apps/core/test/customer-ticket-boundary.test.cjs); lệnh Docker dùng chung tại [lệnh kiểm thử](#phase-0-tests). Test image cho user node regenerate Prisma client; không dùng generated code trên host, không thêm migration trong Phase 0.

1. Sửa lời gọi authorizeWrite theo signature có client; mọi route Customer draft phải kiểm role CUSTOMER. Không chỉ truyền thêm đối số để compiler hết lỗi rồi bỏ qua transaction/quyền.
2. Đăng ký lỗi an toàn HTTP 409: DRAFT_EXPIRED, STALE_DRAFT, DRAFT_ALREADY_CONFIRMED, DRAFT_NOT_EDITABLE. Không trả stack/SQL/draft của người khác.
3. Giữ endpoint draft hiện có theo đúng quyền; không biến route propose hiện tại thành API tích hợp Agent hoặc bằng chứng nguồn Agent đã được triển khai.
4. Generate Prisma client từ schema repo theo quy trình build/typecheck, không sửa hoặc commit generated code. Chạy lại compiler để phân biệt lỗi source còn thật với client cũ.
5. GET draft hết hạn chỉ đọc expiresAt rồi trả DRAFT_EXPIRED; không UPDATE trạng thái trong read transaction rồi rollback. Kiểm GET vẫn trả 409 khi writer khác giữ row lock.

**File sửa:** CustomerTicketController, TicketDraftService, SafeApiException và wiring/module cần thiết. AuthService giữ contract, không nới quyền.

**Nghiệm thu A0:**
- [x] A0-01: Core typecheck sau generate pass; Web typecheck vẫn pass.
- [x] A0-02: thiếu/hết phiên → 401; sai role → 403; thiếu/sai Origin hoặc CSRF bị từ chối trước mutation.
- [x] A0-03: từng mã draft trả 409 safe envelope; draft ngoài owner/cuộc trả 404, không lộ nội dung.

**Suite hiện có:** `customer-ticket-boundary.test.cjs` kiểm HTTP/DB/gateway, gồm GET draft hết hạn khi writer giữ khóa; đã kiểm thêm Origin khác mặc định. Build/typecheck dùng image Docker từ schema repo.

## 5. Phase 1 — Projection, search và Hiện/Ẩn liên hệ Staff

**Trạng thái:** Đã triển khai Core/Web và kiểm bằng fixture synthetic. Không có migration hoặc thay dữ liệu gốc.

**Phạm vi:** APP-02/03. Owner: [CU01/CU02](ui/staff/plans/02-customers-contract.md). Các API dưới dùng prefix /api/v1.

### Contract đích

| API | Thay đổi |
| --- | --- |
| GET /customers/me | Giữ self-read theo contract hiện có; không áp mask Staff lên Customer hoặc Staff contact của Customer. |
| GET /staff/customers | Giữ items/total/page/pageSize. items có id/fullName/accountCode/status/email/phone; email/phone là bản che hoặc null. Search chỉ fullName/accountCode. |
| GET /staff/customers/:customerId | customer dùng Staff DTO riêng; thay birth/address bằng birthYear:number\|null, provinceCity:string\|null. Không có raw hoặc bản sao trong field phụ. |
| POST /staff/customers/:customerId/contact-reveal | Body duy nhất {field:"email"\|"phone"}. Response {customerId,field,value:string\|null}; no-store, current Staff session/CSRF/Origin và active assignment. Endpoint đã triển khai theo CU01. |

- Email: ký tự đầu + ***; che cả domain. Phone: *** + hai chữ số cuối. Thiếu null; quá ngắn để vừa giữ vừa che thì ***. Full name/accountCode/policyNumber vẫn đầy đủ trong scope đã duyệt.
- Source hiện chưa có tỉnh/thành hoặc metadata xác minh. **Đối với dữ liệu hiện chưa có căn cứ xác minh, trả null cho từng trường birthYear/provinceCity**; không suy từ tuổi, LLM hoặc cắt address tự do. Phase này không tự tạo quy trình xác minh hoặc coi birth non-null là đã xác minh.
- Reveal theo thứ tự lock dùng chung users → Customer → assignment; recheck auth/role/assignment trong transaction trước đọc. Ngoài scope/không tồn tại cùng 404. Audit metadata actor/Customer/field/requestId/kết quả, không raw.
- Quota kỹ thuật theo actor dùng bucket hiện có: đọc hồ sơ/search 240/phút, reveal 30/phút; vượt trả safe429/Retry-After. Audit dùng outcome SUCCESS/FAILURE theo ràng buộc DB.
- UI chỉ gọi reveal sau bấm Hiện, từng trường độc lập; pending/error tại chỗ. Raw chỉ trong state contact đang mở, xóa khi Ẩn/đổi khách/logout/revoke. Không prefetch raw, browser storage hoặc mailto/tel/copy trước reveal. Response muộn phải khớp Customer/request còn hiệu lực.
- Bỏ email/phone khỏi Swagger search, placeholder và predicate/count. Search query cũ cũng chỉ so tên/mã; giữ literal/trim/case, active assignment trước count/page và Back/Forward.

**File sửa:** CustomerService/CustomerController/CustomerListQuery; customer-api.ts; staff-customer-directory.tsx; caller contact tại Policy/Inbox/Ticket nếu có. Tách type StaffCustomer/OwnProfile, không đổi dữ liệu gốc hoặc che PDF/transcript.

**Schema:** mask/reveal không cần cột masked; không thêm migration chỉ để hiển thị null khi thiếu nguồn xác minh.

**Nghiệm thu A1:**
- [x] A1-01: list/detail/default network/DOM không có raw liên hệ; null/Unicode/chuỗi ngắn đúng định dạng; self-read không đổi.
- [x] A1-02: token chỉ có trong email/phone không ảnh hưởng items/total; tên/mã vẫn tìm đúng, scope/page/URL/Back không hồi quy; ký tự điều khiển bị từ chối trước trim.
- [x] A1-03: reveal đúng field/owner/assignment, null, field lạ, CSRF và audit; giữ request qua revoke/đổi khách/logout không làm raw xuất hiện lại.
- [x] A1-04: birth/address đầy đủ không còn trong Staff DTO; nguồn chưa xác minh trả null; Policy/PDF/policyNumber và Staff self-edit giữ hành vi cũ.
- Đối chiếu CU01-T05/T06/T07 và CU02-T06; mở rộng suite customers.test.cjs, staff-customers.spec.mjs và staff-foundation.integration.spec.mjs.

**Suite hiện có:** `customers.test.cjs` kiểm API/DB, projection/search/reveal/quota và reauthorize dưới khóa; `staff-customers.spec.mjs` kiểm DOM/state/response muộn; `staff-foundation.integration.spec.mjs` kiểm Customers, Policy/PDF và Staff self-edit qua gateway. Browser mock chỉ chứng minh hành vi UI; quyền và dữ liệu lưu được kiểm ở Core/DB.

## 6. Phase 2 — Tính đúng đắn của Ticket đã có

**Trạng thái:** Đã triển khai Core/Web bằng fixture synthetic; còn kiểm thử chuyên biệt A2-04 về đổi actor khi Ticket đang pending. Migration `202611140001_ticket_request_fingerprint` chỉ thêm cột nullable và CHECK, không backfill hoặc sửa bản ghi cũ.

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
- Lưu **requestFingerprint** bất biến cho request tạo Ticket mới bằng migration 202611140001_ticket_request_fingerprint bổ sung nullable trên support_tickets, map SQL request_fingerprint varchar(64), CHECK null hoặc SHA-256 hex hợp lệ. Hash bao gồm actor và operation; manual gồm title/description/policyId chuẩn hóa, confirm gồm draftId/expectedDraftVersion/confirmed/textVersion. Snapshot ghi revision/content hash tương ứng.
- Giữ unique idempotency_key; cùng actor/key/operation/input trả Ticket cũ sau reauthorize, khác operation/input → 409 IDEMPOTENCY_CONFLICT. Key của actor khác không trả tài nguyên ngoài quyền. Legacy thiếu fingerprint chỉ replay khi xác minh đủ input gốc; không đoán, không backfill bằng nội dung hiện tại.
- Ticket OPEN, recipient từ assignment hiện hành; Staff Accept → IN_PROGRESS. Cấp ticketCode có unique constraint và retry có giới hạn khi collision; không vòng lặp vô hạn hoặc retry toàn bộ lỗi nghiệp vụ.
- Cấp mã dùng không gian UUID, thử tối đa ba transaction khi va chạm mã; hết lượt trả safe503 TICKET_CODE_UNAVAILABLE. Retry giữ key/input cũ. Unique source_draft_id và idempotency_key vẫn được ánh xạ sang conflict an toàn.
- Snapshot của Ticket mới bất biến sau tạo. Staff/Customer projection trả đúng title/description/policy và confirmation tương ứng. Legacy thiếu snapshot không được suy ra xác nhận từ aiSummary/confirmedAt.
- Đích DTO Staff: confirmationSource là CUSTOMER_SUBMITTED cho form manual, CUSTOMER_CONFIRMED cho draft được xác nhận, LEGACY_UNVERIFIED cho bản ghi không đủ snapshot. Chỉ project snapshot hợp lệ theo nguồn tạo do Core kiểm soát; Web không tự khai nguồn. Types/Swagger/Web đã cập nhật theo projection này.
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
- [x] A2-01: false/missing confirmation, version lời xác nhận sai, text rỗng sau trim, policy sai owner và unknown fields không tạo Ticket/audit-success/outbox; NUL/lone surrogate bị từ chối trước ghi DB.
- [x] A2-02: same key/same input replay một Ticket; same key/different input hoặc operation → 409; other actor không đọc receipt.
- [x] A2-03: hai key cùng draft, hai edit cùng version, edit song song confirm, expiry và logout/reassignment trước commit: kết quả theo lock/CAS, snapshot không stale, không 500/raw SQL.
- [x] A2-04 · mất ACK ở manual/confirm → Web tra key cũ và không tạo thêm Ticket; đóng modal/response muộn không áp vào UI mới.
- [ ] A2-04 · kiểm browser chuyên biệt đổi Customer actor khi manual/confirm đang pending: intent/review cũ bị bỏ và response muộn không áp vào UI actor mới. Source đã có binding theo actor/session; test session chung chưa thay thế ca Ticket này.
- [x] A2-05: query NaN/fraction/ngoài range/status lạ/query thừa → 400; pagination tie ổn định, scope/count nhất quán, quota → 429.
- [x] A2-06: Staff đọc Ticket mới thấy snapshot; legacy vẫn chưa xác minh; status/Accept/chatLink không thay grant. Sửa/bỏ policy rồi review/confirm đúng revision; bộ chọn không làm mất policy ngoài trang đầu.
- Test DB cạnh tranh phải chạy thật trong harness; không dùng mock để kết luận khóa/CAS. Mở rộng ticket-foundation.test.cjs, tickets-read.test.cjs và ticket-flow.integration.spec.mjs; thêm suite Customer Ticket theo chức năng nếu hiện chưa có.

**Suite hiện có:** `customer-ticket-boundary.test.cjs`, `ticket-foundation.test.cjs` và `tickets-read.test.cjs` kiểm API/DB, replay/CAS/rollback/quota/snapshot và quyền; `ticket-flow.integration.spec.mjs` kiểm manual/draft/receipt, mất ACK, stale review, Retry-After và policy ngoài trang đầu trên ba browser qua gateway. Nguồn draft là fixture Core, không phải Agent thật.

## 7. Phase 3 — Contract Notification và Ticket event

**Phạm vi:** APP-10/11. Owner: Customer N02, Staff NO01/NO02, TK05. **Còn làm:** đồng bộ DTO/navigation/read caller, bổ sung version cho TICKET_CREATED, tách recipient Customer khỏi routing Staff và repair/replay event cũ. Chưa đóng A3.

### Contract thống nhất

| API / DTO | Đích |
| --- | --- |
| Customer list notification | items có id/kind/title/body/isRead/createdAt/**target**:{type,id}; pageInfo giữ keyset. Không dùng link ở Web. |
| POST /customers/me/notifications/:id/read | {id,isRead:true} |
| POST /customers/me/notifications/read-all | {success:true,count:number} |
| POST /conversations/:conversationId/read | {success:true,readAt:string}; Web cả Staff/Customer dùng route common, Core suy role từ session và kiểm gate tương ứng. |

Role-specific read routes đã có ở Customer/Staff controller, cùng gọi ConversationMessageService.markAsRead; đây là phần cần chuẩn hóa về common route, không phải thiếu endpoint. Đổi caller và xử lý alias phải giữ auth/role/transcript gate, kiểm hồi quy cả hai role. Read/read-all chuông không đánh dấu chat đã xem. Target navigation refetch tài nguyên theo quyền; notification không tự tạo grant.

1. Đồng bộ conversation-api.ts, notification-api.ts, customer-workspace.tsx với DTO Core; giữ nhánh Staff đang đúng. Badge mô tả số chưa đọc đã tải, không tự coi là tổng DB.
2. Ticket create từ manual/confirm phát schemaVersion=1 và **version:0**, cùng transaction Ticket/audit/outbox. Không mang confirmedContent hoặc raw contact trong event.
3. Ticket consumer xác minh event/Ticket rồi xử lý Customer recipient theo owner, **độc lập với việc có Staff hay không**. Nhánh Staff vẫn cần recipient và active assignment theo TicketAccessService. Retry cùng event không tạo bản ghi trùng.
4. Đọc/realtime vẫn reauthorize trước công bố. Ticket đã commit không rollback vì broker/worker/notification lỗi.
5. Với outbox cũ thiếu version/đã retry hoặc DLQ: có đường repair/replay idempotent kiểm aggregate và dữ liệu commit; không xóa sự kiện hoặc tạo Ticket mới để “sửa”. Chỉ sửa payload TICKET_CREATED cũ có bằng chứng phù hợp; không gán version hiện tại thay version tạo ban đầu.

**File sửa:** NotificationsService/DTO nếu cần; conversation-api.ts/customer-workspace.tsx; TicketService/TicketEventService; outbox runner và fixture event liên quan.

**Nghiệm thu A3:**
- [ ] A3-01: dùng Core response thật, click chuông đi đúng chat/Ticket; read/read-all đúng shape; Web hai role dùng common read đúng auth/CSRF/gate. Kiểm request thực tế, không lấy việc route tồn tại làm bằng chứng đã đồng bộ.
- [ ] A3-02: Ticket manual/confirm có và không có assignment đều báo Customer đúng owner; Staff chỉ nhận khi hợp lệ.
- [ ] A3-03: retry/outbox restart, event lỗi cũ và repair không nhân đôi Notification/Ticket, không bỏ qua event âm thầm.
- [ ] A3-04: revoke/ngoài scope không vào resource qua chuông; đọc chuông không đánh dấu chat. Mở rộng N02-T01/T02/T03/T04 và I07-T06.

## 8. Phase 4 — Unread cycle, read status và retention

**Phạm vi:** APP-12–14. **Còn làm:** nhận diện đúng event/message và read event, state chu kỳ đọc bền vững, chống phát lại sau cleanup và đổi timer mỗi giờ sang mỗi 24 giờ. State/migration và A4 chưa triển khai theo spec. Không thêm broker/scheduler cloud.

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
- [ ] A4-01: hai role gửi nhiều tin → một mục/chu kỳ; đọc chuông → tin mới giữ id và bật unread; đọc chat → tin sau mốc tạo chu kỳ mới.
- [ ] A4-02: duplicate/out-of-order event, sender xen kẽ, mark-read event và restart: không báo sai người/sai tin, không tái bật từ retry.
- [ ] A4-03: read chat song song send/consumer, Accept/reassignment/revoke: watermark và unread đúng thứ tự commit, không mất tin sau mốc hoặc lộ quyền cũ.
- [ ] A4-04: notification đã cleanup rồi retry event cũ → không tái tạo; tin mới hợp lệ vẫn được báo. createdAt không đổi bởi retry/gộp.
- [ ] A4-05: fake timer bootstrap/trước/đúng 24 giờ/restart/destroy; cutoff trước/đúng/sau 30 ngày cho hai role/read-unread, DB lỗi rồi hồi phục.
- Mở rộng N02-T05/T07/T09/T10 và conversation-realtime/integration; DB/concurrency/restart dùng harness thật, timer dùng fake clock.

## 9. Phase 5 — Tool local và hồi quy Application

**Phạm vi:** APP-15 và nghiệm thu toàn bộ phase. **Còn làm:** verify/reset theo đủ tập bảng/FK/quyền, gồm ticket_drafts và state Phase 4, rồi kiểm migration/hồi quy Application. Hiện schema có 20 model/14 migrations, verify cố định 17 bảng và reset liệt kê 19 bảng. Chưa đóng A5.

- verify-models đối chiếu **tên bảng/model và quyền** với schema Application thực tế, gồm ticket_drafts và state mới; không chỉ thay số 17 thành một hằng mới.
- dev-data-reset liệt kê đầy đủ bảng cần reset theo FK, gồm ticket_drafts/state. Giữ cơ chế xác nhận, đúng database/volume fixture và schema; không mở CASCADE hoặc thêm quyền reset cho Core runtime.
- Schema hiện có unique source_draft_id và composite FK policy/customer: bảo toàn, không dựng lại hoặc coi là thiếu. Migration mới phải additive/kiểm dữ liệu cũ, không sửa migration đã apply hoặc reset để né nâng cấp.
- Cập nhật Data Model, API/DTO và các plan sở hữu theo code thực tế sau khi test; không đánh dấu phần Agent hoặc toàn bộ I07 đã hoàn tất từ kết quả Application này.

**Nghiệm thu A5:**
- [ ] A5-01: migration từ DB fixture có Ticket/draft/Notification/message cũ giữ dữ liệu, constraint và quyền; generate/typecheck/build đúng schema mới.
- [ ] A5-02: verify đúng tập bảng và role read-only không có quyền ghi; reset trong fixture riêng thành công khi có draft/state, runner dọn đúng dữ liệu test.
- [ ] A5-03: hồi quy Auth/Staff self-edit/Customer read-only, owner/assignment Policy/Product/PDF, Direct/consent/Accept, New AI chat và Staff Ticket status. Không có Close chat hoặc grant kế thừa ngoài quyền.
- [ ] A5-04: browser qua gateway trên Chromium/Firefox/WebKit: URL/Back, không F5, pending/error/response muộn, keyboard/mobile; dùng DOM/network, không screenshot.

Lệnh kiểm thử và harness ở [mục kiểm thử Application](#application-tests); case chi tiết theo phase sở hữu.

## 10. Điều kiện hoàn tất

Checklist này áp dụng cho toàn bộ Phase 0–5, vì vậy chưa đánh dấu hoàn tất chỉ từ kết quả Phase 0–2. Checklist A0/A1/A2 ở trên phân biệt phần đã kiểm với ca còn thiếu; các mục A3–A5 còn kế hoạch.

- [ ] APP-01–15 được sửa và có bằng chứng test tương ứng A0–A5; rủi ro R được kiểm bằng test phù hợp.
- [ ] Main build/typecheck và các suite Application bị ảnh hưởng pass sau generate; không lấy Web typecheck thay kiểm contract JSON/API.
- [ ] Tài liệu/DTO/Swagger/schema/plan phản ánh đúng code đã sửa; ghi rõ phần chưa chạy hoặc ngoài phạm vi.
- [ ] Không còn file tạm/fixture/log/cache do đợt sửa tạo mà không cần giữ; không xóa credential, dữ liệu người dùng hoặc Docker volumes.
- [ ] Chỉ nghiệm thu Application trong phạm vi trên; không yêu cầu Agent hoặc hạ tầng production để đóng spec.

<a id="application-tests"></a>
## 11. Kiểm thử Application

Chuẩn bị stack theo [Getting Started](getting-started.md#full-docker). Chạy lệnh từ root repo; host chỉ chạy helpers/browser runner, Web/Core chạy bằng Docker qua gateway. Quy ước dữ liệu, mock/E2E và dọn fixture tại [UI](ui/README.md#quy-ước-test-case-và-sequence-diagram).

<a id="phase-0-tests"></a>
### Core/DB và Ticket Phase 0–2

```powershell
docker compose --profile tests build core-tests
docker compose --profile tests run --rm --no-deps core-tests npm run typecheck
docker compose --profile tests run --rm --no-deps core-tests node --test test/customer-ticket-boundary.test.cjs test/customers.test.cjs test/http-foundation.test.cjs test/ticket-foundation.test.cjs test/tickets-read.test.cjs
```

Compose áp migration và generate Prisma client từ schema repo. Core/DB suites dùng fixture riêng; browser Customers/Ticket kiểm manual/draft Core và receipt, không gọi Agent. Ca đổi actor khi Ticket pending vẫn theo A2-04.

```powershell
node apps/web/scripts/test-staff.mjs ticket-flow.integration.spec.mjs --grep 'staff-customers.spec|real Customers|real policy PDF|ticket-flow.integration|save failure 429|repeated 500/403/429'
```

Các helper Docker theo chức năng: `npm run test:accounts`, `test:auth`, `test:customers`, `test:policies`, `test:admin`; HTTP suite: `npm run test:http --workspace @life-insurance/core`. Test admin cần cổng 4101 trống; không chạy helper test với NODE_ENV=production.

### Browser, realtime và PDF

Chuẩn bị Node/npm bằng `npm ci`, cài browsers rồi dùng runner ba trình duyệt:

```powershell
node node_modules/@playwright/test/cli.js install chromium firefox webkit
node apps/web/scripts/test-staff.mjs --workers=2
```

`staff-foundation.integration.spec.mjs` dùng Core/DB/MinIO thật; các suite mock kiểm UI. Có thể đặt BROWSER_TEST_BROWSERS=chromium cho vòng ngắn. BROWSER_TEST_BASE_URL chọn URL gateway; một số fixture integration còn gắn Origin/port mặc định nên dùng cổng của `.env.example` cho các suite đó. Fault injection/đổi giờ browser phải được phục hồi trong suite.

Chạy riêng browser regression bằng `npm run test:browser:account`, `test:browser:customers`, `test:browser:policies` hoặc `npm run test:browser --workspace apps/web -- <suite.spec.mjs>`. Suite thực: `staff-inbox.integration.spec.mjs`, `conversation-flow.integration.spec.mjs`, `conversation-realtime.integration.spec.mjs`, `product-flow.integration.spec.mjs`.

```powershell
docker compose --profile tests run --rm --no-deps core-tests node --test test/products.test.cjs
docker compose --profile tests run --rm --no-deps product-document-tests
```

Product document harness có quyền dọn object riêng, Core runtime vẫn reader-only. Runner `test-staff.mjs` dọn thư mục tạm tự tạo; khi dùng runner trả kết quả tại `apps/web/test-results`, dọn output của lượt chạy sau khi đọc. Screenshot/video/trace tắt; PDF kiểm bytes/hash/Range/metadata, không render ảnh.

### Bootstrap/reset — tiêu chí Phase 5

`npm run test:policy-seed` kiểm policy/PDF bootstrap; `docker compose --profile tests run --rm --no-deps dev-seed-tests` kiểm seed/reset; chỉ chạy reset trong fixture DB/storage cô lập, không dùng dữ liệu đang làm việc. Case nguồn theo `data/synthetic/manulife-demo-v1/policies.json` và manifest bootstrap.

| Mã | Điều cần kiểm |
| --- | --- |
| GS-SEED-01 | Bootstrap tạo đủ tài khoản/phân công, portfolio và PDF chung; chạy lại giữ chỉnh sửa hiện có, không nhân bản |
| GS-SEED-02 | Reset trong harness có đủ Ticket/draft/message/state: bảng/FK hợp lệ, phiên cũ bị thu hồi, seed mới khớp manifest |
| GS-SEED-03 | Inject lỗi upload/reset trước commit: rollback DB và object theo contract; retry cleanup sau commit không mất dữ liệu mới hoặc credentials |
| GS-SEED-04 | Hợp đồng khác nhau về sản phẩm/người được bảo hiểm/lịch phí/PDF theo fixture; mỗi Customer đọc đúng owner và bản áp dụng |
| GS-SEED-05 | Policy-only replacement giữ nội dung chat/Ticket và hồ sơ/mật khẩu đã sửa; optional links/version xử lý theo FK, rerun không tạo trùng |
