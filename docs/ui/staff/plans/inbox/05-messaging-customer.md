# I05 — Gửi tin chống trùng và giao diện Customer hai đầu

Ngày 03/11/2026 · **Đã triển khai 04/11/2026 — REST hai chiều; realtime/Agent riêng** · [Chung](../03-inbox-contract.md) · Trước: [I03](03-handoff-transcript.md), [I04](04-staff-inbox-ui.md) · Tiếp: [I06](06-realtime-routing.md).

## 1. Kết quả

Customer tạo AI/Direct/yêu cầu Staff từ UI; Staff Accept và hai bên gửi/đọc cùng cuộc qua Core thật. Tin nhắn chống trùng, có trạng thái đang gửi/chưa rõ kết quả/lỗi rõ ràng. Chưa có realtime chat tự cập nhật cho đến I06: dùng thao tác tải lại **vùng hội thoại**, không F5. Không coi đây là Agent trả lời thật hoặc delivery/read receipt.

Không attachments/templates/typing/edit/delete/read markers. Customer chat AI có thể lưu tin nhưng không hứa có câu trả lời khi Agent runtime chưa cấu hình; UI nói rõ tình trạng, không bịa tin AI hoặc bật endpoint impersonation để demo.

## 2. File triển khai

Core: thêm methods/controllers tại ConversationsModule, `dto/send-message.dto.ts`, dùng `conversation-message.service.ts`/command/access I01. Mở rộng `services/conversation-rate-limit.service.ts` đã cần từ I02/I03 bằng quota send/reconcile, dùng RateLimitBucket hiện có; không mở private method AuthService.limit hoặc refactor auth rộng chỉ cho chat.

Web đã tạo `components/conversation-composer.tsx`, `customer-conversations.tsx`, `customer-handoff-dialog.tsx`, mở rộng `lib/conversation-api.ts` và transcript I04. Tích hợp nhánh chat trong `components/customer-workspace.tsx`, không thay toàn Customer shell hoặc giả mở quyền Staff. `auth-screen.tsx` truyền CSRF/session theo props/context nhỏ trong memory; Staff composer nối component I04.

Customer entry ở `/customer` hiện có; đề xuất query `conversationId=<uuid>` để chọn cuộc, không cần thêm ứng dụng hoặc route tree lớn. Chỉ lưu id/query công khai cần navigation, không body/CSRF/cursor vào URL.

## 3. API gửi tin — đã triển khai

### 3.1. A12 Staff

`POST /api/v1/staff/conversations/:conversationId/messages`

### 3.2. Customer

`POST /api/v1/customers/me/conversations/:conversationId/messages`

Cả hai dùng body:

```json
{
  "clientMessageId": "60000000-0000-4000-8000-000000000001",
  "expectedVersion": 4,
  "content": "Tôi muốn hỏi thêm về kỳ đóng phí."
}
```

clientMessageId UUID sinh một lần cho ý định gửi, là receipt key SEND_MESSAGE. expectedVersion integer từ metadata, không sequence của message cuối. content text tối đa **4000 Unicode code points** sau chuẩn hóa CRLF→LF, từ chối toàn whitespace nhưng giữ nội dung còn lại; FE/server cùng phép đo. Không sender/customer/staffId/audience/citations/toolCallsMetadata trong body.

Response201 lần đầu /200 replay:

```json
{
  "message": {
    "id": "50000000-0000-4000-8000-000000000002", "sequence": "129",
    "clientMessageId": "60000000-0000-4000-8000-000000000001",
    "senderType": "STAFF", "sender": {"displayName": "Synthetic Staff A"},
    "content": "Tôi muốn hỏi thêm về kỳ đóng phí.",
    "createdAt": "2026-11-03T08:30:00.000Z", "citations": []
  },
  "controlVersion": 4, "replayed": false
}
```

Ví dụ content synthetic dùng chung shape, sender thực do endpoint/actor quyết định. ACK không có delivered/read. clientMessageId chỉ thêm ở ACK/reconcile của chính tác giả, không phải field bắt buộc mọi message history. Không tăng controlVersion do append nên hai người gửi với controlVersion hiện hành vẫn hợp lệ; sequence cấp riêng dưới lock.

### 3.3. Reconcile message

Staff A12: `GET /api/v1/staff/conversations/:conversationId/messages/by-client-id/:clientMessageId`.

Customer: `GET /api/v1/customers/me/conversations/:conversationId/messages/by-client-id/:clientMessageId`.

200 `{message:<own message projection>,controlVersion}`. Chỉ tin của chính actor có key đó; không tra key của người khác dù cùng cuộc. Recheck ownership/grant hiện tại. 404 có thể chưa commit/chưa có/không đủ quyền, **không đủ kết luận thất bại**; retry cùng POST/key/payload, không key mới. Key đúng nhưng nội dung/version gốc bị sửa khi replay →409 IDEMPOTENCY_CONFLICT.

Errors theo contract chung: 400 size/blank/body, 401/403 auth/CSRF, 404 no gate, 409 stale/routing/idempotency, 429 quota, 503 dependency. Client timeout cũng là unknown outcome, không mặc định server rollback.

## 4. Quyền và transaction

| Sender | Có thể gửi khi |
| --- | --- |
| Customer → AI | Own CUSTOMER_SUPPORT origin AI, AI_ACTIVE, không legacy chưa review; lưu tin, Agent integration riêng |
| Customer chờ Staff | Own cuộc có pending request hợp lệ; tin mới Customer-facing, Staff chưa đọc trước Accept |
| Customer → Staff | Own Direct/grant hoặc transferred STAFF_ACTIVE còn routing hợp lệ |
| Staff | TRANSCRIPT grant hiện hành + STAFF_ACTIVE + controller đúng + active assignment |
| Staff pending/AI_PRIVATE/Copilot/legacy | Không gửi, không tự mở quyền |
| AI writer | Chỉ trusted Core interface, origin AI + AI_ACTIVE + expectedControlVersion đúng; không pending/Staff active |

Customer trên Direct bị revoke không gửi tiếp cho Staff cũ; UI cho mở Direct mới hoặc request chuyển lịch sử cũ theo I03. Không đổi origin/status tự động để bật AI. Reassignment/khóa và session kiểm ở từng mutation.

Transaction: auth/CSRF → locks I01 → current scope/control check → receipt lookup → replay hoặc validate expectedVersion → cấp sequence → insert message/audience/sender server → cập nhật lastCustomerFacingActivityAt/counter → audit tối thiểu + outbox MESSAGE_COMMITTED + receipt → commit → ACK. Rate limit bounded trước phần nặng; lỗi không giữ transaction/lock qua gọi Agent hoặc network WS.

Audit chỉ message id/conversation id/operation, không content. Outbox không body để worker giao sau. Event/message ACK mất không tạo duplicate; message/sequence/outbox fail giữa chừng rollback cùng nhau. Unique constraint là hàng rào cuối, xử lý conflict bằng đọc receipt sau transaction retry có giới hạn.

### 4.1. Quota local đề xuất

RateLimitBucket DB theo actor+operation, không theo IP gateway chung. Bản đầu send60/phút, create10/phút, handoff request5/phút, Accept30/phút, command/message lookup120/phút, read240/phút. Quota dùng cho cả phase I03/I05 khi endpoint tương ứng triển khai, Retry-After rõ. Đây là cấu hình local đề xuất cần kiểm load, không SLO production. Replays vẫn chịu request-abuse limit nhưng không tính như message mới.

## 5. UI Staff/Customer

### 5.1. Composer

Enter gửi, Shift+Enter xuống dòng; IME không gửi khi composing. Button có accessible name; chống double submit/keypress bằng pending intent/key. Blank/oversize báo tại composer, focus không mất sau ACK. Không remount toàn chat theo revision/từ khóa.

Nháp tách actorId/conversationId trong memory. Đổi cuộc không trộn nháp/unknown intent; logout/mất scope xóa nháp liên quan. Không localStorage/sessionStorage content/CSRF. Sau ACK chỉ xóa nội dung đúng snapshot đã gửi; nếu user đã gõ nội dung mới không xóa nó.

Tin optimistic có temporary key/clientMessageId, nhãn “Sending”/“Checking result”/“Failed”, không sequence giả. ACK hoặc reconcile thay đúng bubble, merge/dedup cùng REST after/WS. Chưa rõ kết quả không cho sửa/reuse key với content mới; cho kiểm tra/retry cùng payload. Gửi nội dung chỉnh sửa là intent/key mới chỉ sau khi đã giải quyết intent cũ hoặc người dùng hiểu có thể là tin mới.

Không hiện “delivered/read” từ HTTP201. Lỗi quyền clear transcript/intent Private; lỗi mạng giữ nháp an toàn trong memory, không điều hướng/F5.

### 5.2. Customer entry/handoff

Danh sách nhiều cuộc tương tự ChatGPT: tiêu đề/thời gian, cuộc mới AI hoặc nhắn Staff. Gọi availability trước Direct/request; server vẫn recheck version khi POST. AI không khả dụng phải nói rõ, không tạo cảm giác Agent đang chạy.

Nút nhờ Staff mở dialog: hiển thị Staff hiện hành, sharedSubject/reason do Customer nhập/xác nhận và **toàn bộ lịch sử cuộc này sẽ được chia sẻ sau Staff tiếp nhận**. Nút xác nhận hành động rõ, không checkbox checked sẵn thay sự đồng ý. Escape/hủy không mutation. Focus trap/restore khi đóng, action pending không double click.

Customer tự chủ động nhờ Staff hoặc Agent gợi ý đều về cùng dialog/Core confirmation. Agent không tự POST consent, thông điệp AI “đã gửi” không là bằng chứng thành công. Nếu routing đổi, giữ draft và cho Customer xác nhận lại Staff mới.

Pending hiển thị đang chờ hỗ trợ; Customer tiếp tục gửi trong cùng cuộc, AI dừng theo đề xuất I03. Staff chưa Accept không transcript. Accept xong Customer thấy người hỗ trợ và tiếp tục cùng conversationId; không tạo chat mới khiến mất ngữ cảnh.

## 6. Luồng gửi và timeout

```mermaid
sequenceDiagram
  participant U as Composer
  participant K as Core
  participant D as PostgreSQL
  U->>U: Sinh clientMessageId và giữ payload gốc
  U->>K: POST message + version + key
  K->>D: Lock, grant/fence, message + receipt + outbox
  D-->>K: Commit
  alt ACK nhận được
    K-->>U: Message có id/sequence
    U->>U: Merge bubble, giữ focus/nháp mới
  else Timeout hoặc ACK mất
    U->>K: GET by-client-id với cùng key
    alt Đã commit
      K-->>U: Message chính thức
    else Chưa xác định
      K-->>U: 404 an toàn
      U->>K: Retry POST cùng key/payload
      K-->>U: Một message duy nhất hoặc conflict quyền
    end
  end
```

## 7. Các bước triển khai

1. Chốt text normalization/limits/quota/unknown-outcome policy.
2. Core send/receipt/sequence/fence/reconcile; race và rollback tests trước UI.
3. Staff composer và lỗi/optimistic merge, không phụ thuộc WS.
4. Customer list/detail/create/Direct/handoff dialog/transcript/composer qua API I03.
5. E2E hai browser contexts qua gateway, dùng refresh vùng để nhận tin ở đầu kia trước I06.
6. Cập nhật docs theo mốc: I05 cung cấp REST hai chiều; I06 hiện đã có realtime. Agent còn chưa triển khai; không để nút lỗi ngầm hoặc ghi realtime vẫn thiếu ở hiện tại.

## 8. Test plan

Core **đã có** `apps/core/test/conversation-send.test.cjs`; browser `apps/web/tests/browser/conversation-send.spec.mjs`, `customer-conversations.spec.mjs`; E2E thật `conversation-flow.integration.spec.mjs`. Integration container fixtures riêng, không bootstrap seed cá nhân.

| ID | Kiểm tra | Kết quả |
| --- | --- | --- |
| I05-T01 | Direct Customer→Staff→Customer | Một cuộc/id, đúng actor, order/sequence/nội dung |
| I05-T02 | Pending Customer gửi thêm/Staff cố gửi | Customer được lưu, Staff denied, chỉ đọc được sau Accept |
| I05-T03 | Hai POST cùng key, hai keys cùng text | Cùng key một tin; khác key là hai ý định hợp lệ |
| I05-T04 | Commit xong ACK bị ngắt; lookup404 lúc đang chạy | Reconcile/retry không duplicate/báo thất bại giả |
| I05-T05 | Key cũ khác content/expectedVersion | 409, không tạo message mới |
| I05-T06 | Send đua Accept/reassignment/lock/session revoke | Gate/fence đúng thứ tự commit, không Staff cũ gửi muộn |
| I05-T07 | Transaction fail sau insert trước outbox/receipt | Không message/counter/outbox nửa chừng |
| I05-T08 | 4000/4001 code points, blank, CRLF, Unicode/HTML | Validation/hash/hiển thị an toàn nhất quán |
| I05-T09 | Enter/Shift+Enter/IME/double click | Chỉ intent hợp lệ, không submit/F5 ngoài ý muốn |
| I05-T10 | Đổi cuộc lúc pending, gõ nháp mới trước ACK | Không lẫn/xóa nháp mới hoặc merge sai cuộc |
| I05-T11 | Handoff dialog cancel/confirm/routing đổi | Cancel không ghi, confirm rõ scope, Customer xác nhận lại khi đổi Staff |
| I05-T12 | Rate limit/CSRF/actor giả/citations body | 429/403/400 đúng, không lộ Private hoặc tạo grant |
| I05-T13 | Transcript/ACK/reconcile cùng message | Merge một bubble, không giả delivered/read |

Manual E2E: Customer mở Direct → gửi → Staff tải lại vùng list/chat → trả lời → Customer tải lại vùng; tiếp theo AI cuộc có fixture lịch sử → xác nhận nhờ Staff → pending không transcript Staff → Accept → cả lịch sử cũ + tin mới. Báo rõ fixture AI không phải LLM integration.

## 9. Điều kiện hoàn tất

- [x] Core/DB race/idempotency/fence/HTTP tests và browser tương tác pass riêng.
- [x] E2E hai actor thật qua Docker; no F5 chứng minh bằng DOM/network.
- [x] Timeout không duplicate, nháp/focus đúng; không client actor/grant giả.
- [x] Customer consent rõ và request/Ticket tách biệt.
- [x] Milestone ghi REST hai chiều; I06 realtime và Agent runtime còn riêng.


## 10. Implementation và kiểm chứng 04/11/2026

Core thêm `dto/send-message.dto.ts`, `services/conversation-sending.service.ts`, mở rộng hai controller, quota SEND60/phút và Swagger ACK/lookup DTO. Dùng lại transaction/locks/receipt/sequence/outbox I01; không migration/schema/dependency mới. ACK được chiếu lại dưới session/grant hiện hành sau commit; nếu quyền vừa mất trả lỗi an toàn, client xử lý unknown/reconcile, không hoàn tác tin đã commit.

Web thêm composer dùng chung, Customer conversations và handoff dialog; transcript I04 nhận ACK để merge/dedup mà không remount. Customer tại `/customer?conversationId=...`, Staff tại route hiện hành. Mỗi snapshot gửi có UUID/content/version riêng; lưu nháp/intent chỉ trong memory theo actor/cuộc, xóa khi mất quyền. Enter/Shift+Enter/IME, pending lock, giữ draft mới sau ACK, unknown cùng key, 409 revalidate và 429 chờ/retry đúng ý định. Không endpoint giả danh AI, no F5, không delivered/read giả.

Dialog dùng modal native và vòng Tab/Shift+Tab; Escape/Cancel không ghi. Pending/unknown không cho đổi nội dung/key hoặc hủy kết quả chưa xác định. Routing conflict tải availability mới và yêu cầu Customer xác nhận lại; không tự chuyển người nhận. Direct bị revoke ngừng gửi; Customer vẫn đọc lịch sử và có thể tạo Direct mới. Có thể yêu cầu chia sẻ lại lịch sử Direct cũ sau reassignment khi Core trả action requestStaff; phải Customer xác nhận và Staff mới Accept, không tự cấp grant.

Kiểm tra Core: `docker compose --profile tests run --rm --no-deps core-tests node --test test/conversation-send.test.cjs test/conversation-workflow.test.cjs test/inbox-read.test.cjs test/conversation-permissions.test.cjs test/http-foundation.test.cjs` — 72 ca, gồm 9 ca send mới và các race/fence/rollback I01/I03.

Browser: `conversation-send.spec.mjs` (8), `customer-conversations.spec.mjs` (5), `conversation-flow.integration.spec.mjs` (1 gateway thật hai browser contexts), cùng I04 (16) và hồi quy Account/Session/Customers/Policy (78). Bộ đầy đủ 108 ca. Fixture thật tự tạo/dọn qua core-tests, không bootstrap seed, không ghi credential/transcript ra host hoặc tạo report Markdown. Kết quả browser/HTTP phân biệt rõ; không chụp ảnh.

Lint/typecheck Core/Web và Docker build Core/Web/core-tests pass tại mốc I05. I06 hiện đã có realtime/catch-up; Inbox/Refresh messages đã được bỏ, ACK/realtime đồng bộ nền giữ nhóm/metadata/composer/nháp và transcript. Không có delivery/read ACK. AI chat chỉ lưu tin, chưa có Agent trả lời tự động. Ticket/Copilot/read markers/attachments vẫn ngoài I05.

**Nghiệm thu tay 04/11:** người dùng xác nhận các phần còn lại pass tại mốc I05. SYSTEM sau Accept đã triển khai ở I06-A; Copilot Staff vẫn là kế hoạch CP01–CP04, chưa mở thêm phạm vi sửa giao diện Customer.
