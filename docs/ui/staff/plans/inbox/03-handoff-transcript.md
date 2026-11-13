# I03 — Customer entry, handoff, Accept và toàn bộ lịch sử

Cập nhật 04/11/2026 · **Đã triển khai và kiểm chứng I03** · [Contract chung](../03-inbox-contract.md#9-contract-kỹ-thuật-dùng-chung--đề-xuất) · Trước: [I01](01-model-permissions.md), [I02](02-inbox-read-api.md) · Tiếp: [I04](04-staff-inbox-ui.md).

## Data model và phạm vi ảnh hưởng

Bảng bên dưới mô tả tác động của phase, gồm cả ghi gián tiếp qua Core. Tên bảng thuộc schema `business` trừ nơi ghi rõ; cột còn đề xuất được đánh dấu **P**. Web không truy cập DB trực tiếp.

| Bảng/model | Cột hoặc dữ liệu liên quan | Thao tác của phase | Quan hệ/ràng buộc cần giữ | Mức ảnh hưởng và nơi bị tác động |
| --- | --- | --- | --- | --- |
| users + auth_sessions | users.id/role/status, auth_sessions.user_id/token_hash/expires_at/revoked_at | Đọc | AuthSession.user_id → User.id; session phải còn hạn, không bị thu hồi | Cao — mọi API dùng session; không trả token/hash trong DTO |
| staff_assignments + customer_profiles + staff_profiles | staff_id/customer_id/is_active/ended_at, assignment_version, user_id/full_name | Đọc | Assignment gắn đúng Customer/Staff; Inbox còn ràng buộc assignment id cụ thể | Cao — Customers, Policy Lookup, Ticket và Inbox cùng phụ thuộc phân công |
| conversations + conversation_handoffs | customer_id/channel_type/support_origin/direct_assignment_id/assigned_staff_id/status/control_version/subject, state/assignment_id/recipient_staff_id/shared_subject/shared_reason/accepted_at/revoked_at | Đọc | Direct đúng assignment lúc tạo hoặc handoff ACCEPTED còn grant; PENDING chỉ shared metadata, không AI subject/transcript | Cao — Inbox filter/deep link/REST/WS phải cùng gate; không suy grant từ status/assigned_staff_id |
| messages | conversation_id/sequence/audience/sender_type/sender_id/content/citations/created_at | Đọc | Unique (conversation_id,sequence); chỉ CUSTOMER_VISIBLE sau transcript gate; sequence bigint ra DTO dạng string | Cao — không lộ INTERNAL/LEGACY_REVIEW/tool_calls_metadata cho Customer/Staff transcript |
| conversations + conversation_handoffs | conversations.status/assigned_staff_id/control_version/support_origin/created_by_customer_id/direct_assignment_id; handoffs.state/consent_scope/consent_text_version/confirmed_by_customer_id/confirmed_at/accepted_by_staff_id/accepted_at | Create/request/Accept/revoke ghi | Composite FK conversation/customer và assignment/customer/recipient; partial unique một handoff PENDING/ACCEPTED; provenance/consent bất biến | Cao — quyền transcript chỉ sau Direct hợp lệ hoặc Accept, đổi assignment phải thu hồi grant |
| messages + conversations | messages.sequence/audience/client_message_id/internal_message_id/sender_type/sender_id/content; conversations.next_message_sequence/last_customer_facing_activity_at | Append ghi, không sửa/xóa nội dung cũ | Unique sequence và key theo conversation/sender; counter cấp dưới conversation lock | Cao — Accept tạo SYSTEM duy nhất, send/retry không trùng; send thường không tăng control_version |
| conversation_command_receipts | actor_id/operation/client_request_id/request_hash/resource_id/result_version | Thêm hoặc đọc để replay | Unique (actor_id,operation,client_request_id); resource_id do service kiểm theo operation | Cao — replay vẫn kiểm quyền; không dùng receipt chat như receipt Ticket |
| rate_limit_buckets | client_token/endpoint_group/window_start/request_count/blocked_until | Ghi phụ trợ khi endpoint áp quota | PK (client_token,endpoint_group); tăng atomic, giới hạn theo actor/nhóm endpoint | Trung bình — quota có thể ghi dù nghiệp vụ bị từ chối; không log định danh nhạy cảm |
| audit_logs | actor_id/action/target_type/target_id/outcome/request_id/metadata/created_at | Thêm khi mutation/cấp PDF theo service | actor_id → User.id; không sửa/xóa audit cũ; chỉ metadata allowlist | Cao — phải giữ bằng chứng đúng transaction nghiệp vụ; không lưu transcript/password/signed URL |
| outbox_events | aggregate_type/aggregate_id/event_type/payload/status/retry_count/next_attempt_at/lease_owner/lease_expires_at/last_error | Thêm trong transaction nguồn; worker cập nhật trạng thái/lease | Index status/next_attempt_at/lease_expires_at; aggregate_id là reference kiểm bởi service, không FK đa loại | Cao — retry/reclaim/dedup, commit nghiệp vụ khác delivery; REST vẫn là nguồn dữ liệu |

**Schema/migration:** Không DDL mới sau I01. Chứng cứ consent tạo từ xác nhận thật, không backfill Accept từ status/assigned_staff_id.

**Nhất quán và hồi quy:** Create/consent/Accept ghi receipt + audit/outbox trong transaction. Accept thêm SYSTEM và sequence atomic; chỉ đọc toàn bộ CUSTOMER_VISIBLE của chính cuộc được đồng ý. Kiểm rollback/replay/reassignment và pending không transcript.

## 1. Kết quả

Có nguồn tạo request thật từ Customer, Direct có provenance, Staff Accept atomic và A10 đọc toàn bộ Customer-facing history. Không phải tự cấp grant qua fixture để UI chạy. Customer entry API có trước UI Customer I05 để test Core độc lập.

Phase gồm API entry/read/Accept, **chưa gửi tin người dùng hoặc tích hợp LLM thật**. Fixture AI trước request chỉ phục vụ integration test tự dọn. Không thêm public endpoint cho browser giả danh AI. Không tự tạo Ticket hoặc notification row; request và outbox bền vững được tạo, I06 mới giao thông báo.

## 2. File triển khai

Đã thêm trong `apps/core/src/conversations/`: `controllers/customer-conversation.controller.ts`, `services/conversation-entry.service.ts`, `services/conversation-handoff.service.ts`, `dto/conversation-entry.dto.ts`, `dto/conversation-workflow-response.dto.ts`, `dto/message-query.dto.ts`. Bổ sung Staff controller I02, access/command/message services I01. Chỉ tách các lớp theo trách nhiệm thật, không module/package mới ngoài ConversationsModule.

Rate limit cho các endpoint ghi đã có từ phase này: helper `services/conversation-rate-limit.service.ts` dùng RateLimitBucket hiện có, quota đề xuất tại [I05 mục 4.1](05-messaging-customer.md#41-quota-local-đề-xuất). I05 chỉ bổ sung quota/send consumer, không đợi tới I05 mới bảo vệ create/request/Accept. Đọc I02 cũng cần read quota khi triển khai endpoint, có thể tạo helper tối thiểu ở I02 rồi mở rộng tại đây.

`http/safe-api.exception.ts` đã bổ sung409 allowlist; foundation không phát raw exception. Assignment mutation dùng revoke/lock I01. I03 không cần migration/schema mới. Có thêm `services/conversation-session.service.ts`, `conversation-events.ts`, `message-cursor.ts` và `conversation-transcript.service.ts`; session/CSRF/quota/locks được dùng chung, không copy auth vào controller.

| Vị trí từ root repo | Hiện trạng | Trách nhiệm trong phase | Mức ảnh hưởng | Phạm vi cần kiểm lại |
| --- | --- | --- | --- | --- |
| [apps/core/src/conversations/controllers/customer-conversation.controller.ts](<../../../../../apps/core/src/conversations/controllers/customer-conversation.controller.ts>) | Hiện có | Owner entry/request/history | Cao | Customer chat và consent |
| [apps/core/src/conversations/services/conversation-entry.service.ts](<../../../../../apps/core/src/conversations/services/conversation-entry.service.ts>) | Hiện có | Create AI/Direct với routing version | Cao | Direct assignment provenance |
| [apps/core/src/conversations/services/conversation-handoff.service.ts](<../../../../../apps/core/src/conversations/services/conversation-handoff.service.ts>) | Hiện có | Consent/Accept/reconcile | Cao | Staff request panel, Customer SYSTEM message |
| [apps/core/src/conversations/services/conversation-transcript.service.ts](<../../../../../apps/core/src/conversations/services/conversation-transcript.service.ts>) | Hiện có | Transcript gate + before/after sequence | Cao | REST catch-up hai role |
| [apps/core/src/conversations/services/conversation-access.service.ts](<../../../../../apps/core/src/conversations/services/conversation-access.service.ts>) | Hiện có | Một gate cho metadata/transcript/send | Cao | REST Staff/Customer, realtime, future Copilot |
| [apps/core/src/conversations/services/conversation-command.service.ts](<../../../../../apps/core/src/conversations/services/conversation-command.service.ts>) | Hiện có | Lock, canonical hash, receipt/replay | Cao | Create/request/Accept/send |

## 3. API spec Customer — đã triển khai

Chỉ role CUSTOMER, actor từ session. Không nhận customerId/staffId/senderType như quyền. Read no-store; write JSON/Origin/X-Auth-Request/CSRF. Mọi UUID trong ví dụ là synthetic.

### 3.1. Khả năng hỗ trợ và nội dung xác nhận

`GET /api/v1/customers/me/chat-support`, không query.

```json
{
  "availability": "AVAILABLE",
  "assignmentVersion": 7,
  "staff": {"fullName": "Synthetic Staff A"},
  "handoffConsent": {
    "textVersion": "handoff-v1",
    "scope": "ENTIRE_CUSTOMER_VISIBLE_CONVERSATION",
    "text": "Đồng ý để nhân viên tiếp nhận toàn bộ nội dung bạn và AI đã trao đổi trong cuộc này, cùng các tin nhắn tiếp theo khi được hỗ trợ."
  }
}
```

availability AVAILABLE/UNASSIGNED/STAFF_UNAVAILABLE; khi không AVAILABLE staff=null. Không lộ internal role/credential. assignmentVersion là routing concurrency token, không quyền. Nội dung consent server-controlled; client không tự chọn scope rộng/hẹp khác.

### 3.2. Tạo một cuộc mới

`POST /api/v1/customers/me/conversations`

AI body: `{clientRequestId: UUID, kind: "AI", subject?: string}`. Direct body:

```json
{
  "clientRequestId": "40000000-0000-4000-8000-000000000001",
  "kind": "DIRECT", "subject": "Tư vấn phí bảo hiểm",
  "expectedAssignmentVersion": 7
}
```

subject trim, tối đa 180, rỗng dùng fallback. kind là ý định tạo mới, không cho đổi origin cuộc có sẵn. Core AI→origin AI/status AI_ACTIVE/controller null; Direct→origin DIRECT/status STAFF_ACTIVE/directAssignmentId/creator/controller từ session+assignment hiện tại. AI body không nhận expectedAssignmentVersion; Direct bắt buộc có. Không có Staff/Staff khóa 409 STAFF_UNAVAILABLE; version đổi 409 ROUTING_CHANGED, không âm thầm gửi tới Staff khác.

201 lần đầu / 200 replay: `{conversation:{id,subject,status,controlVersion,entryType},replayed:boolean}`. AI entryType AI chỉ phía Customer; không thêm filter AI cho Staff. Create ghi conversation/provenance + audit tối thiểu + receipt + outbox CONVERSATION_CREATED cùng transaction. Không tạo tin nhắn rỗng/SYSTEM giả/Ticket. Chưa gọi Agent hoặc báo Agent đã trả lời.

### 3.3. Customer list/detail

`GET /api/v1/customers/me/conversations?limit=20&cursor=...`: limit 1–50, keyset `(activityAt DESC,id DESC)`, cursor actor/kind binding; không search/counts/filter state ở bản đầu. items `{id,subject,status,activityAt,entryType}`, pageInfo `{hasMore,nextCursor}`. Chỉ CUSTOMER_SUPPORT ownership, không Copilot. Không dùng endpoint Staff để thay ownership.

entryType phía Customer nhận AI/REQUEST/DIRECT/TRANSFERRED/LEGACY_REVIEW. Ưu tiên request/accepted hiện hành như I02, sau đó origin; LEGACY_REVIEW chỉ là DTO giúp giải thích chưa khả dụng, không status/filter Staff. AI subject riêng chỉ owner thấy trước Accept. Activity fallback createdAt khi chưa có message.

`GET /api/v1/customers/me/conversations/:conversationId`: `{conversation:{id,subject,status,controlVersion,entryType,availability,staff,request,allowedActions}}`. allowedActions `{readMessages,send,requestStaff}` do Core tính. request chỉ của chính Customer, có state/requestedAt/acceptedAt khi phù hợp; staff tên người nhận hiện hành hoặc null, không data assignment lịch sử không cần thiết. availability AVAILABLE/REVIEW_REQUIRED là DTO, không status chat mới. Legacy chưa phân loại trả REVIEW_REQUIRED, các actions false, không giả cho gửi hoặc tự cấp quyền; không export aiSummary/tool metadata làm lý do chi tiết.

### 3.4. Customer xác nhận chuyển giao

`POST /api/v1/customers/me/conversations/:conversationId/handoff-requests`

```json
{
  "clientRequestId": "40000000-0000-4000-8000-000000000002",
  "expectedVersion": 0, "expectedAssignmentVersion": 7,
  "sharedSubject": "Cần giải thích quyền lợi",
  "sharedReason": "Tôi muốn nhân viên hỗ trợ tiếp.",
  "consent": {
    "confirmed": true, "textVersion": "handoff-v1",
    "scope": "ENTIRE_CUSTOMER_VISIBLE_CONVERSATION"
  }
}
```

sharedSubject 1–180/sharedReason 0–1000 ký tự, trim/text an toàn; bản đầu yêu cầu Customer tự nhập hoặc xác nhận rõ, không tự copy AI title/summary thành shared metadata. consent false/thiếu/scope khác/bản không còn hợp lệ → 400 INVALID_INPUT. Đây là xác nhận do người dùng qua phiên, không lời đồng ý do LLM tự suy.

201/200 replay: `{request:{id,state:"PENDING",requestedAt},conversation:{id,status:"PENDING_HANDOFF",controlVersion},replayed}`. State/status khác miền. Request mới khi đang pending khác key → 409 HANDOFF_ALREADY_PENDING; khi đang active có grant không tạo thêm. Không tạo SupportTicket.

AI_PRIVATE đủ ownership có thể yêu cầu; Direct cũ bị revoke có thể xin chuyển lịch sử tới Staff mới sau xác nhận mới. Legacy chưa review không tự biến thành Direct/grant; xử lý riêng trước khi dùng luồng này. Không endpoint cancel/reject/close/reopen trong phase đầu; Customer không đồng ý thì không gửi POST.

### 3.5. Reconcile entry command

`GET /api/v1/customers/me/conversation-commands/:clientRequestId?operation=CREATE_AI|CREATE_DIRECT|REQUEST_HANDOFF`

200 `{state:"COMMITTED",resourceId,conversationId,controlVersion}` chỉ receipt của actor hiện tại. Không nhận actorId; UUID/operation sai 400. Không có receipt hoặc resource không còn được đọc: 404. **404 không chứng minh command trước không commit**: request ban đầu có thể còn đang chạy; retry cùng POST/key/payload an toàn, không tạo key mới. Lookup không tự sửa nghiệp vụ.

## 4. API Staff — A10/A11 đã triển khai

### 4.1. A11 Accept

`POST /api/v1/staff/conversations/:conversationId/accept`

Body `{clientRequestId: UUID, expectedVersion: integer}`. Không nhận transcript scope/consent/customerId/staffId từ Staff. Thành công 200 `{conversation: <A09 active projection>, replayed:boolean}`; chỉ lúc này FE được gọi A10. Không nhúng history vào ACK.

401/403/404 theo contract chung. Metadata đủ quyền nhưng version đổi →409 STALE_CONVERSATION; request đã nhận bởi hành động khác →409 ALREADY_ACCEPTED. Cùng key/payload đã commit →200 replay sau recheck current grant. AI riêng chưa request →404, không cho proactive takeover.

Reconcile `GET /api/v1/staff/conversations/:conversationId/commands/:clientRequestId?operation=ACCEPT_HANDOFF`: 200 minimal committed receipt của Staff đó hoặc safe 404. Sau timeout ưu tiên lookup + A09, replay cùng POST khi còn unknown; không báo “chưa nhận” chỉ vì lookup 404.

### 4.2. A10 transcript, Customer cùng contract projection

Staff: `GET /api/v1/staff/conversations/:conversationId/messages?limit=50&before=...`

Customer: `GET /api/v1/customers/me/conversations/:conversationId/messages?limit=50&before=...`

limit 1–100/default50; before/after opaque cursor, không đồng thời cả hai, exclusive. Không query→batch mới nhất. Items luôn sequence tăng dần. Cursor bind actor/conversation/direction, vẫn recheck gate. Staff trước Accept safe 404, không response rỗng tiết lộ lastSequence. Customer owner đọc đúng audience kể cả AI private/pending.

```json
{
  "items": [{
    "id": "50000000-0000-4000-8000-000000000001", "sequence": "128",
    "senderType": "AI_AGENT", "sender": {"displayName": "AI assistant"},
    "content": "Nội dung synthetic đã hiển thị cho Customer trước yêu cầu Staff.",
    "createdAt": "2026-11-03T07:00:00.000Z", "citations": []
  }],
  "pageInfo": {"beforeCursor": "opaque-before", "afterCursor": "opaque-after", "hasMoreBefore": true, "hasMoreAfter": false}
}
```

afterCursor của batch cuối giúp catch-up; nếu rỗng trả cursor boundary hợp lệ hoặc null ở cuộc chưa có tin, không giả sequence. after chỉ tiến qua những item có quyền; bị giới hạn batch thì hasMoreAfter=true, tiếp tục tới hết. Sequence có thể có khoảng trống do INTERNAL/legacy; không total/số tin ẩn.

Sau Accept không thêm `createdAt>=acceptedAt/requestedAt` vào query. Lịch sử Customer-facing trước đó phải tải tới đầu; “toàn bộ” là phạm vi quyền, không tải tất cả một lần. SenderType CUSTOMER/STAFF/AI_AGENT/SYSTEM là nhãn tác giả, không delivered/read.

citations chỉ allowlist `{documentId,versionId,page,label}` sau kiểm quyền phiên bản; không objectKey/signedUrl/rawtool. Citation mất quyền thì bỏ citation hoặc trả unavailable marker không metadata Private, giữ text đã là Customer-facing; mở PDF dùng quyền riêng, không transcript grant thay tài liệu grant.

## 5. Transaction và luồng hoạt động

### 5.1. Request

Auth/CSRF → locks I01 → recheck ownership/assignment/version → receipt lookup → validate consent/routing → create PENDING handoff + status PENDING_HANDOFF + tăng controlVersion → audit allowlist + outbox HANDOFF_REQUESTED → receipt → commit →ACK. Bất kỳ bước fail rollback toàn bộ. LLM đề xuất chỉ là gợi ý UI, không được gọi bước xác nhận thay Customer.

Đã áp dụng AI dừng từ request commit. AI output đang chạy mang version cũ bị Core fence chặn; Customer vẫn được gửi tiếp ở I05, pending Staff không thấy các tin này cho đến Accept. Writer AI của Core đã kiểm status/controlVersion; không có endpoint browser giả danh AI, chưa nối Agent runtime.

### 5.2. Accept

Auth/CSRF → locks I01 → recheck assignment/user/request consent/recipient → replay receipt nếu có và quyền còn hiệu lực → kiểm expectedVersion/state → cập nhật ACCEPTED/accepted actor/time + controller/STAFF_ACTIVE/controlVersion+1 → audit + outbox HANDOFF_ACCEPTED + receipt → commit. Grant và control cùng transaction, không “status trước, grant sau”.

```mermaid
sequenceDiagram
  participant C as Customer
  participant K as Core
  participant D as PostgreSQL
  participant S as Staff
  C->>K: POST handoff + consent toàn bộ lịch sử
  K->>D: Lock, request + control + outbox + receipt
  D-->>K: Commit
  K-->>C: Pending ACK
  S->>K: GET request metadata
  K-->>S: readMessages=false
  S->>K: POST Accept + version + key
  K->>D: Lock, recheck, grant + control + outbox + receipt
  D-->>K: Commit
  K-->>S: Active ACK
  S->>K: GET latest messages, rồi before cursor
  K-->>S: Toàn bộ Customer-facing, gồm trước request
```

### 5.3. Reassignment

Theo I01: revoke grant cũ, bỏ controller, tăng version; Staff mới không tự thấy transcript. Customer phải xác nhận request mới tới assignment mới. Consent/request cũ giữ audit, không sửa recipient để biến thành consent mới. Trước khi Customer xác nhận mới không phát transcript qua WS/REST/notification cho Staff mới.

## 6. Các bước triển khai

1. Entry/availability/consent DTO + contract Swagger; chốt pending AI/routing/reassignment.
2. Receipt/locks/create AI/Direct; proof bất biến origin.
3. Handoff request atomic + safe pending metadata; no Ticket.
4. Accept grant atomic và fence; test race bằng barrier, không sleep mong đợi may rủi.
5. Transcript before/after/projection cho Staff/Customer; citation scope.
6. Command reconcile và HTTP errors; API map giữ endpoint chưa làm là P.

## 7. Test cases

Các ca dưới đây là **đặc tả kiểm thử**, không phải báo cáo kết quả. Kiểm từng lớp API/service/DB/browser đúng nhãn; mock UI không thay kiểm quyền Core hoặc E2E thật.

**Quy ước dữ liệu:** S-A/S-B là hai Staff synthetic; C-A/C-B là hai Customer synthetic khác nhau. Thay alias bằng UUID/token của fixture cô lập; các path HTTP dùng prefix /api/v1 nếu chưa ghi đầy đủ. Chỉ thay assignment, khóa account, inject lỗi hoặc migration trong harness/môi trường test, không trên tài khoản/dữ liệu đang sử dụng.

### I03-T01 — Direct mới kiểm routing version

**Lớp kiểm thử:** API + DB.
**Điều kiện và dữ liệu:** C-A thuộc S-A, chat-support trả assignmentVersion=v0.

**Các bước:**

1. POST tạo DIRECT bằng expectedAssignmentVersion=v0.
2. Thử lại cùng clientRequestId/payload.
3. Đổi assignment fixture rồi tạo bằng v0.

**Kết quả mong đợi:** Lần đầu201, retry 200 cùng cuộc; routing đổi409, không tự gửi tới Staff khác hoặc biến AI cũ thành Direct.

### I03-T02 — Consent bắt buộc trước handoff

**Lớp kiểm thử:** API.
**Điều kiện và dữ liệu:** C-A có cuộc AI_ACTIVE; lấy consent textVersion/scope từ server.

**Các bước:**

1. POST handoff với confirmed=false hoặc textVersion sai.
2. POST đúng confirmed=true, scope toàn lịch sử và UUID intent mới.
3. Đọc metadata/messages bằng S-A trước Accept.

**Kết quả mong đợi:** Request sai không ghi consent; đúng tạo pending; S-A chỉ metadata, messages 404. Không tự tạo Ticket.

### I03-T03 — Accept hai lần và full history

**Lớp kiểm thử:** API + Browser E2E.
**Điều kiện và dữ liệu:** Pending đã có consent; transcript có tin Customer-visible trước requestedAt.

**Các bước:**

1. S-A Accept với key/version hợp lệ rồi replay cùng payload.
2. Đọc batch latest và before tới đầu lịch sử.
3. Kiểm Customer và Staff transcript.

**Kết quả mong đợi:** Một acceptance/SYSTEM, version đúng; cả lịch sử Customer-visible trong cùng cuộc được đọc, không internal/tool/Copilot.

### I03-T04 — Reassignment giữa precheck và Accept

**Lớp kiểm thử:** API + DB barrier.
**Điều kiện và dữ liệu:** S-A pending; barrier dừng trước lock; operator fixture chuyển C-A sang S-B.

**Các bước:**

1. Bắt đầu Accept của S-A.
2. Commit đổi assignment rồi thả barrier.
3. Thử S-A đọc/gửi và S-B mở lịch sử cũ.

**Kết quả mong đợi:** S-A không commit Accept sau revoke; S-B không tự có grant; cần consent/Accept mới gắn assignment mới.

### I03-T05 — Lịch sử cursor và citations

**Lớp kiểm thử:** API.
**Điều kiện và dữ liệu:** Cuộc accepted có hơn100 tin, citation tới đúng applied version; fixture có internal messages.

**Các bước:**

1. GET latest rồi before/after với limit nhỏ.
2. Thử ghép before+after hoặc cursor từ cuộc khác.
3. Đối chiếu sender/citation và thứ tự sequence.

**Kết quả mong đợi:** Lịch sử đủ, không trùng/nhảy sequence; query/cursor sai bị chặn; không internal payload hoặc signed URL trong citations.

**Suite tham khảo:** [conversation-workflow.test.cjs](../../../../../apps/core/test/conversation-workflow.test.cjs). Tên suite là vị trí tự động hóa, không phải chứng nhận các ca đã chạy.

**Dọn sau kiểm thử:** xóa đúng fixture/session/object/schema theo runId; phục hồi fault injection và đóng context/socket test. Không reset DB/credential, sửa bootstrap hoặc xóa volumes. Với PDF kiểm metadata/bytes/hash; với UI kiểm DOM/focus/network, không cần screenshot.

## 8. Điều kiện hoàn tất

- [x] Review pending AI/routing/reassignment và DTO đề xuất.
- [x] Entry/request/Accept/history/reconcile HTTP + PostgreSQL race tests pass.
- [x] Request có nguồn Customer thật; grant không fixture giả trên production.
- [x] Toàn bộ Customer-facing trước Accept kiểm bằng nhiều batch; Ticket độc lập.
- [x] Không gọi đây là chat hai chiều/AI runtime hoàn chỉnh; send và Customer UI ở I05.

**Checkpoint:** Có thể bắt đầu I04 với request/Direct/accepted thật qua API. Mọi kiểm thử dùng HTTP ở đây vẫn chưa là browser E2E.


## 9. Ghi chú triển khai

Đã deploy10 endpoint I03 trong Core Docker: Customer support/create/list/detail/request/command lookup/messages (7) và Staff Accept/Accept lookup/messages (3). Swagger có DTO request/response/enum/error; Staff Accept trả 200, create/request201 lần đầu và 200 replay. Không sửa Web, schema, bootstrap hoặc credential; vẫn19 bảng/6 migrations. Read/safe metadata I02 giữ hoạt động.

Create/request/Accept đều Origin/JSON/X-Auth-Request/CSRF, role từ session, auth recheck sau locks, current assignment và receipt hash/key. Tạo Direct không đổi origin cuộc AI, receipt không cấp quyền sau reassignment. 409 codes: STALE_CONVERSATION, IDEMPOTENCY_CONFLICT, ROUTING_CHANGED, STAFF_UNAVAILABLE, HANDOFF_ALREADY_PENDING, ALREADY_ACCEPTED. Đọc dùng RepeatableRead; command lookup quota 120/phút, create10, request5, Accept 30, read240 theo actor, Retry-After khi429. Không có event phát socket trước commit; notification delivery/worker ở I06.

Customer list/detail cho thấy các cuộc ownership; legacy chỉ REVIEW_REQUIRED/LEGACY_REVIEW với actions false, Copilot không xuất hiện. requestStaff chỉ có khi classified AI_ACTIVE và Staff hiện hành khả dụng; Direct/transfer đã revoke không tự gửi tiếp hoặc bật AI lại. New request tới assignment mới cần xác nhận mới; Staff mới chưa Accept vẫn không thấy transcript.

Transcript lọc CUSTOMER_VISIBLE, order theo bigint string, before/after exclusive và cursor ràng actor/role/cuộc/direction. Có before/after flags theo dữ liệu visible, không counts/lastSequence hoặc tool metadata. Cuộc trống trả afterCursor boundary0 (mốc trước tin đầu tiên, không tạo tin/sequence giả); beforeCursor=null. Rỗng sau một cursor giữ boundary để tiếp tục catch-up. Body query before+after/limit ngoài1–100 bị từ chối.

Citations tối đa20/message được kiểm kiểu/id/page và batch lookup. Nếu có linkedPolicyId, dùng lại exact-applied catalog hiện có (documents.main/terms/guide/endorsements), Staff theo assignment, Customer theo ownership. Nếu không linked policy, chỉ tài liệu PUBLIC active/exact version, không tài liệu Private tùy ý. Label lấy từ title đã có quyền, không echo nhãn/raw object key trong citation JSON. Mất quyền/phiên bản inactive/ngoài binding thì bỏ citation, không bỏ nội dung Customer-facing đã chia sẻ. Không cấp signed URL hoặc thêm Customer PDF API trong I03.


```powershell
docker compose --profile tests build core core-tests
docker compose up -d --no-deps --wait core
docker compose restart gateway
docker compose --profile tests run --rm --no-deps core-tests node --test test/conversation-workflow.test.cjs test/inbox-read.test.cjs test/conversation-permissions.test.cjs test/http-foundation.test.cjs
```

Stack ở `http://localhost:8080`; test HTTP harness chỉ mở loopback trong container, gateway case dùng deployment hiện hành. Fixture synthetic gồm sessions/messages/policy/document metadata tự dọn, không upload PDF giả hoặc thêm shared/personal seed. Không tạo file credential ngoài repo/`.local`/report.md. UI Staff ở I04, public send và Customer UI ở I05, realtime/notification ở I06.
