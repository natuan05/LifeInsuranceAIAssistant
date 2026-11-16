# Bàn giao Agent → đội application: Core và Web cho Agent/RAG

07/11/2026, cập nhật 15/11/2026 sau khi toàn bộ nhánh Agent vào `main` · Người nhận: đội application (Core/Web). Người review phía Agent: anh Tuấn.

Tài liệu này liệt kê phần việc mà [kế hoạch Agent/RAG](2026-10-31-agent-rag-implementation.md) giao cho đội application, cùng contract chính xác mà code Agent hiện đang gọi và mong đợi. Theo mục "Phân công phạm vi" của kế hoạch, đội application nhận: **Task 3**, **phần Core của Task 2 và Task 6**, **phần UI/Core của Task 10**. Mọi tên API/kiểu dữ liệu chuẩn nằm trong [contracts/agent-v1.md](../../../contracts/agent-v1.md) và [agent-v1.schema.json](../../../contracts/agent-v1.schema.json); file này không thay thế chúng.

## 1. Hiện trạng phía Agent

Phần Python của Tasks 1, 2, 4, 5, 6 (phía Agent), 7, 8, 9 đã có code và test, và đã ở `main`. Anh Tuấn review và merge contracts, graph, Public RAG, durable protocol, durable store (kèm các commit sửa sau review). Private/Copilot và Task 6 phía Agent được review lại theo plan/design rồi merge ngày 15/11/2026.

| Phần | Nội dung | Liên quan tới đội application |
| --- | --- | --- |
| Contracts (Task 1) | JSON Schema, fixtures, contracts | Kiểu dữ liệu Core phải gửi/nhận |
| Graph (Task 5) | Graph bốn node, tool, prompt, Copilot | Hành vi Agent khi Core trả lỗi/rỗng hoặc từ chối |
| Public RAG (Tasks 7–9) | Corpus, hybrid retrieval, đánh giá | Role DB `rag_indexer`/`rag_retriever` |
| Durable protocol (Task 2) | Protocol bền vững (contracts mục 12), reference model Node | Bản mẫu state machine Core phải theo |
| Durable store (Task 4) | Lưu bền phía Agent (`agent_runtime`) | Role DB `agent_migrator`/`agent_runtime` |
| Private/Copilot (Tasks 5, 7–9) | Fixture synthetic, Copilot, 84 ca đánh giá | Quyền Private/Copilot Core phải cấp |
| Task 6 phía Agent | HTTP/HMAC, ACK bền, giao lại kết quả | Endpoint hai chiều ở mục 3 |

Profile HMAC và framework HTTP ở contracts 12.9–12.10 đã chọn theo code Agent hiện có. Hành vi FAILED không tự retry theo chính sách lượt lỗi đã chọn; các phần G2/G3 khác tiếp tục review, trừ quyết định bổ sung ngày 12/11/2026 về `PERMISSION_CHANGED`/`CANCELLED_BY_CORE`. Retention dữ liệu khôi phục MVP theo [chính sách lưu chung](../../configuration-and-data.md#mvp-agent-recovery-retention). Retry, DDL và nghiệm thu tích hợp Core tiếp tục theo review riêng.

Đã kiểm chứng: test Python với PostgreSQL thật, test Node của reference model và test vector HMAC. **Chưa kiểm chứng:** mọi phần cần Core thật. Các test Agent dùng Core double, nên chưa chứng minh quyền, FIFO hay transaction của Core.

## 2. Việc của đội application

### 2.1 Task 3 — Core APIs, quyền hiện hành và FIFO durable dispatch

Đặc tả đầy đủ ở [kế hoạch, Task 3](2026-10-31-agent-rag-implementation.md#task-3-core-apis-quyền-hiện-hành-và-fifo-durable-dispatch) và [contracts 12.3, 12.11](../../../contracts/agent-v1.md#123-core-run-và-attempt). Tóm tắt việc cần làm:

1. **Migration `business`:** `agent_runs`, `agent_attempts`, `agent_run_events`, `agent_request_nonces` theo DDL đề xuất ở contracts 12.11 (đã chạy thử trên PostgreSQL 16). Thêm migration mới, không sửa migration cũ; cập nhật `verify-models.mjs`.
2. **Module:** theo [phương án kết hợp đã chọn](../../../contracts/agent-v1.md#application-conversation-api-mapping), API Web ↔ Core mở rộng module `conversations` hiện có. Run/attempt/event, dispatcher, API nội bộ cho Agent và HMAC đặt trong module mới `apps/core/src/agent/`.
3. **API Web ↔ Core** (mở rộng `conversations` theo ánh xạ chuẩn, giữ create `clientRequestId`, send `clientMessageId`, version/cursor/envelope hiện hành): tạo hội thoại có chống trùng (Customer; Staff kèm `targetCustomerId`, `linkedContextConversationId` cho Copilot); list/read/history **không tạo hội thoại/tin/run**; `ConversationSummary.currentRun`; lịch sử có mục `AGENT_RESULT` và `RUN_OUTCOME`; gửi tin trả ACK chỉ sau khi tin + run đã lưu, gửi lại cùng key trả `replayed=true` (contracts mục 3).
4. **`acceptMessage` / `claimNext`** (contracts 12.3): cấp `messages.sequence`, tạo run `QUEUED`; claim khóa hội thoại, một run `RUNNING`/hội thoại, cố định `history_view` lúc claim, tạo attempt `DISPATCHING` cùng `RunRequest` đã lưu, **commit trước khi gửi HTTP**. Copilot: cố định `linked_history_view` lúc nhận câu hỏi Staff.
5. **Dispatcher + đối soát:** vòng polling trong tiến trình Core (`FOR UPDATE SKIP LOCKED`), gửi lại đúng request đã lưu khi chưa có ACK, chạy lại được sau restart. Không reset `RUNNING` chỉ vì browser ngắt.
6. **Thu hồi attempt:** `invalidateAttempt` → `INVALIDATING`, chặn ngay tool/scope/history/event của attempt cũ, gửi revoke tới khi có `RevocationAck`. Chặn từ REQUEST_HANDOFF commit sang PENDING_HANDOFF theo [chính sách chuẩn](../../../contracts/agent-v1.md#handoff-request-agent-fence): cùng transaction handoff/controlVersion, run AI đang chạy và QUEUED của cuộc → CANCELLED, current attempt INVALIDATING và lưu revoke intent; gửi sau commit. Không đợi Staff Accept. Quá deadline → `FAILED`; `PERMISSION_CHANGED`/`CANCELLED_BY_CORE` → `CANCELLED` (xác nhận 12/11/2026, contracts 12.3). Lỗi kỹ thuật/quá deadline **không** tự tạo attempt mới theo [chính sách lượt lỗi đã chọn](../../specifications/Agent_Design.md#failed-turn-policy); Core/UI phải lưu và hiển thị FAILED terminal. Chỉ `RevocationAck` hợp lệ, đúng run/attempt mới mở barrier cho attempt/tin tiếp theo. Takeover chat Customer không hủy lượt Copilot của Staff đang hỗ trợ.
7. **`AgentAccessService`:** mỗi lần Agent đọc, kiểm attempt đang là `current_attempt_id` và còn sống, rồi kiểm lại quyền hiện hành của actor (Customer sở hữu; Staff có assignment active). Lịch sử chỉ theo view đã lưu cho run. Không lộ việc hợp đồng/hội thoại có tồn tại hay không.
8. **Hai đọc nghiệp vụ + `benefitsSnapshot`:** `{schemaVersion, riders, ridersComplete}`; JSON cũ hoặc thiếu cờ → `ridersComplete=false`; bổ trợ chưa ánh xạ danh mục không được làm danh sách thành đầy đủ.
9. **Scope tài liệu:** trả đúng cặp document/version Core cấp. Private kèm `policy_id`; không thay bằng `currentVersion` mới nhất; scope hợp lệ rỗng là `GRANTED` với `documents=[]`. Index Private cho bốn hợp đồng runtime trong `policies.json` cần document/version do Core cấp; Core cần một cách cho indexer offline lấy danh sách document/version và nội dung tương ứng (đề xuất: lệnh maintenance xuất catalog, không qua API công khai). UUID trong `contract.json` của fixture tham chiếu không phải ID runtime.
10. **Test và runner:** `apps/core/test/agent-runs.test.cjs`, `agent-access.test.cjs`, đăng ký `npm run test:agent-core` theo runner stdin hiện có. Các test bắt buộc có tên trong kế hoạch: `fresh_user_starts_and_rediscovers_chat_via_api`, `foreign_conversation_create_list_and_history_denied`, `copilot_source_view_is_frozen_per_staff_question`, `customer_takeover_keeps_authorized_staff_copilot_separate`, cùng ca FIFO "enqueue B khi A đang chạy" của Step 7.

Reference model [`agent-protocol-model.cjs`](../../../apps/core/test/helpers/agent-protocol-model.cjs) và [`agent-protocol.test.cjs`](../../../apps/core/test/agent-protocol.test.cjs) mô tả state machine run/attempt/event bằng code thuần. Bản cài đặt thật nên đi qua cùng các kịch bản này với DB thật.

Chính sách logout/hết phiên theo [Agent Design](../../specifications/Agent_Design.md#agent-logout-session-policy): run đã nhận và queued tiếp tục, kiểm quyền tài khoản/tài nguyên hiện hành; phiên Web cũ bị chặn, login lại đọc kết quả bằng phiên mới. Task 3/6/10 phải kiểm CH02-T08 và Auth/Copilot, không dùng session gửi ban đầu làm credential cho tools/callback nền.

### 2.2 Task 6 — phần Core

Đặc tả ở [kế hoạch, Task 6](2026-10-31-agent-rag-implementation.md#task-6-httphmac-ack-durable-và-giao-lại-kết-quả-qua-restart) và contracts 12.9–12.10.

1. **`apps/core/src/agent/hmac.ts`:** ký/kiểm `LI-HMAC-SHA256-v1` bằng `node:crypto`. Phải qua bộ vector chung [`contracts/fixtures/hmac-v1.json`](../../../contracts/fixtures/hmac-v1.json). File [`agent-hmac-vector.test.cjs`](../../../apps/core/test/agent-hmac-vector.test.cjs) đã kiểm bộ vector này bằng `node:crypto`, có thể dùng làm điểm bắt đầu. Nonce lưu ở `business.agent_request_nonces` trong 10 phút.
2. **Tách auth:** route `/api/v1/internal/agent/*` dùng HMAC, không dùng cookie/session/CSRF (`http-foundation.ts`).
3. **`agent-transport.service.ts`:** gửi `POST /internal/runs`, `POST /internal/attempts/{attemptId}/revoke` tới Agent; mỗi lần gửi lại ký lại (timestamp/nonce mới), ID nghiệp vụ giữ nguyên.
4. **`POST /api/v1/internal/agent/events` (`applyEvent`):** theo quy tắc 12.3 và bảng ACK ở mục 3.3 dưới.
5. **Test:** `apps/core/test/agent-delivery.test.cjs`, đăng ký `npm run test:agent-delivery`: sửa body/path/header, sai khóa, lệch giờ, nonce lặp, gửi lại nonce mới cùng ID; crash giữa `applyEvent` (rollback, không ACK); event muộn sau REQUEST_HANDOFF → `IGNORED_STALE`; kiểm thêm request/RESULT race, rollback/replay/restart/revoke mất ACK và Copilot riêng không bị hủy.

### 2.3 Task 10 — phần UI/Core

Theo [kế hoạch, Task 10](2026-10-31-agent-rag-implementation.md#task-10-local-end-to-end-ui-core-và-handoff-có-giới-hạn-rõ). Nối UI tối thiểu trong workspace hiện có:
- tạo hội thoại qua Core, list để người dùng chọn/mở, tải metadata/history/`currentRun`; reload không tạo conversation/run;
- gửi tin bằng idempotency key ổn định theo lần submit; hiển thị `QUEUED`/`RUNNING`/kết quả cuối trong đúng kênh;
- Staff bắt buộc chọn Customer được phân công, Core kiểm chat liên kết; kết quả Copilot chỉ ở hội thoại Staff, không gửi sang chat Customer;
- trích dẫn mở tài liệu qua Core đúng phiên bản; chưa có đường mở tài liệu thì hiện nguồn và ghi rõ, không tạo signed URL giả.

E2E Task 10 (`apps/agent/tests/test_end_to_end.py`, ma trận crash/restart toàn luồng) do hai bên cùng chạy khi Task 3 và phần Core của Task 6 đã có.

## 3. Contract Agent đang dùng

Các endpoint dưới đây là những gì code Agent ở nhánh `agent/task-6-http-delivery` gọi và phục vụ. Ô ghi **đề xuất** là chi tiết kế hoạch chưa định: đội application xác nhận, hoặc đổi rồi báo để Agent sửa client.

### 3.1 Agent phục vụ (Core gọi)

| Endpoint | Body | Phản hồi |
| --- | --- | --- |
| `POST /internal/runs` | `RunRequest` | 202 `ACCEPTED`; 200 `DUPLICATE`/`IGNORED_STALE`; 409 `CONFLICT` (`PAYLOAD_MISMATCH`); 400 `REJECTED`/`SCHEMA_INVALID`; 401 `{"error":{"code":"AUTH_FAILED"\|"REPLAY_REJECTED"}}` (không phải ACK); 503 `UNAVAILABLE` (kho Agent lỗi, không ACK → Core gửi lại) |
| `POST /internal/attempts/{attemptId}/revoke` | `AttemptRevocation` | 200 `RevocationAck` `REVOKED`/`ALREADY_REVOKED` kèm `writer_epoch`; 400 `REJECTED` khi `attemptId` trên path khác body (`SCHEMA_INVALID`) hoặc receipt thuộc run/hội thoại khác (`PAYLOAD_MISMATCH`). Chỉ 200 hợp lệ, đúng run/attempt mới coi là đã thu hồi |
| `GET /healthz` | — | 200 `{"status":"ok"}`, không cần chữ ký |

`RunRequest` phải đủ trường theo schema. `limits` gồm 4 giá trị đã chốt (`retrieval_calls_max=3`, `core_read_requests_max=4`, `core_request_timeout_ms=3000`, `core_retry_per_call=1`) và 4 giá trị G4 bắt buộc khác `null`. Còn thiếu thì Agent trả lỗi kỹ thuật thay vì tự đặt. Giá trị thử hiện dùng ở `apps/agent/evaluation/trial-config.json` (`model_calls_max=6`, `graph_steps_max=30`, `turn_token_budget=120000`, `finish_reserve_tokens=12000`, deadline 120 giây); đây là giá trị thử, chưa duyệt.

### 3.2 Core phục vụ (Agent gọi), dưới `/api/v1/internal/agent`

| Endpoint | Agent gửi | Core trả 200 |
| --- | --- | --- |
| `GET /runs/{runId}/history` | Query: `attemptId`, `cursor` (nếu có) — **đề xuất** | `ConversationHistoryPage` trong `history_view` đã lưu của run |
| `GET /runs/{runId}/linked-history` | Query: `attemptId`, `cursor` — **đề xuất** | `ConversationHistoryPage` trong `linked_history_view` đã lưu của run |
| `POST /runs/{runId}/scope` | Body `{attempt_id, kind: "PUBLIC"\|"PRIVATE", policy_number}` — **đề xuất** | `DocumentScope` (`GRANTED` hoặc `DENIED`) |
| `GET /runs/{runId}/contracts` | Query: `attemptId` — **đề xuất** | `{"contracts":[ContractSummary]}` — **đề xuất**; Customer không có hợp đồng → `[]` |
| `GET /runs/{runId}/contracts/{policyNumber}` | Query: `attemptId`; mã hợp đồng được URL-encode | `ContractOverview`, luôn có `riders_complete` |
| `POST /events` | `AgentEvent` | `DurableAck` (mục 3.3) |

Lỗi của các đọc: body `{"error":{"code":"…"}}` với 403 `NOT_AUTHORIZED` (actor không còn quyền), 409 `INVALID_ATTEMPT` (attempt không còn hiện hành), 404 `NOT_FOUND`, 400 `INVALID_INPUT`. Đề xuất: hợp đồng không tồn tại và hợp đồng của người khác trả **cùng** 404 `NOT_FOUND`. Agent kiểm schema mọi câu trả lời; câu trả lời sai dạng hoặc 5xx bị coi là `UNAVAILABLE` (retry tối đa 1 lần trong budget).

Chữ ký: mọi request dùng khóa Agent → Core. Chuỗi ký gồm method, path + query đúng như gửi (GET ký body rỗng), timestamp, nonce, SHA-256 body và key id (contracts 12.9).

### 3.3 `applyEvent` và ACK cho Agent

| Tình huống | Core trả | Agent làm |
| --- | --- | --- |
| Event mới, attempt hiện hành | 200 `ACCEPTED` | Dừng gửi |
| Cùng `event_id`, cùng nội dung | 200 `DUPLICATE` | Dừng gửi |
| Attempt không còn hiện hành / run đã kết thúc | 200 `IGNORED_STALE` (`ATTEMPT_NOT_CURRENT`) | Dừng gửi |
| Cùng `event_id` khác nội dung, hoặc cùng `(attempt_id, sequence)` khác ID | 409 `CONFLICT` (`PAYLOAD_MISMATCH`/`SEQUENCE_CONFLICT`) | Dừng, ghi sự cố |
| Run không tồn tại | 400/403 `REJECTED` (`UNKNOWN_RUN`) | Giữ event, gửi lại theo backoff tới hạn tối đa |
| Sai chữ ký / nonce lặp | 401 | Gửi lại (ký mới) theo backoff |
| Lỗi Core (5xx, timeout) | — | Gửi lại cùng event |

ACK phải là `DurableAck` có đúng `run_id`, `attempt_id`, `event_id` của event; ACK khác ID bị coi là không có ACK. Chỉ trả ACK **sau khi commit**. Agent gửi event JSON theo thứ tự khóa không cố định, nên Core cần chuẩn hóa trước khi băm để so trùng: sắp khóa đệ quy, không khoảng trắng, UTF-8 (cùng cách `sha256_json` phía Agent).

`RESULT` cần kiểm schema `AgentResult` và kiểm trích dẫn nằm trong scope của run trước khi tạo Message `AI_AGENT`. `PROGRESS` (`PREPARING`/`LOOKING_UP`/`COMPOSING`) chỉ cập nhật khi `sequence` lớn hơn, và không đưa run đã kết thúc về `RUNNING`.

## 4. Cấu hình dùng chung

- **Khóa HMAC:** hai keyring độc lập (Core → Agent, Agent → Core), mỗi khóa ≥ 32 byte ngẫu nhiên, base64url. Hai bên giữ cùng giá trị. Phía Agent đọc `LIFE_AGENT_CORE_TO_AGENT_KEY_ID/_KEYS` và `LIFE_AGENT_AGENT_TO_CORE_KEY_ID/_KEYS` (xem `apps/agent/.env.example`); tên biến phía Core do đội application đặt trong `.env` root/`.env.example`. Không đưa khóa thật vào Git, log hay chat.
- **Địa chỉ:** Agent nghe ở `LIFE_AGENT_HTTP_HOST`/`LIFE_AGENT_HTTP_PORT` (mẫu 8090) và gọi Core theo `LIFE_AGENT_CORE_BASE_URL`. URL callback chỉ lấy từ cấu hình.
- **DB roles:** Core không có quyền trên schema `agent_runtime`; Agent không có quyền `business`. Bootstrap/compose đã có role của Agent, không mở rộng quyền role hiện có.
- **Chạy Agent khi tích hợp local:** Agent hiện chạy bằng `python -m life_agent.http serve`, chưa có service trong Compose. Cần thống nhất có thêm service `agent` vào `compose.yaml` hay không, vì quy tắc repo yêu cầu FE/BE local chạy qua Compose.

## 5. Điểm cần đội application xác nhận hoặc quyết định

1. **Chi tiết các đọc nội bộ** đánh dấu đề xuất ở mục 3.2: `attemptId` trong query, body scope, dạng `{"contracts":[…]}`, 404 chung cho không tồn tại/không được phép.
2. **Copilot soạn nháp:** đã thống nhất. Tài liệu [Staff Copilot](../../ui/staff/plans/08-copilot-contract.md) xác nhận Copilot MVP không soạn nháp/Use draft, khớp kế hoạch Agent; Agent từ chối mọi action trong kênh Copilot.
3. **Route Copilot:** A24–A26 (`/api/v1/staff/conversations/:id/copilot…`) trong tài liệu Staff khác hướng phương án 12.13 #1 (Copilot là một hội thoại `STAFF_COPILOT` trong API `conversations` chung, có link chat Customer). Chọn một hướng và cập nhật tài liệu còn lại.
4. **Đề xuất Ticket:** Agent trả `PROPOSE_TICKET {summary}` đúng sáu nhóm. [Hướng metadata nguồn qua callback đã chọn](../../../contracts/agent-v1.md#ticket-source-metadata-callback): Agent dựng/lưu/giao lại metadata từ registry thật, Core xác thực/đối chiếu nguồn rồi lưu cùng draft/snapshot, Web chỉ nhận projection. Schema/version wire mới và implementation hai bên còn P; chưa mở rộng agent-v1 hiện tại hoặc nối nguồn Agent thật vào I07. Agent không tạo Ticket hoặc báo thành công trước Core commit.
5. **Lịch gửi lại** (12.10, còn đề xuất): dispatch/revoke backoff 1 → 60 giây có jitter, lặp tới khi có ACK hoặc tới hạn run; event lặp tối đa 24 giờ. **Lưu dữ liệu khôi phục MVP:** theo [chính sách chung](../../configuration-and-data.md#mvp-agent-recovery-retention), gồm cả dữ liệu đã ACK; không áp hạn gửi lại thành TTL xóa dữ liệu.
6. **Service `agent` trong Compose** (mục 4).

## 6. Khi nào coi phần này xong

- `npm run test:agent-core`, `npm run test:agent-delivery`, `node --test apps/core/test/agent-protocol.test.cjs apps/core/test/agent-hmac-vector.test.cjs` và các test hồi quy hiện có (`test:customers`, `test:auth`, `test:http`, typecheck) đều pass.
- Chạy local cả Core và Agent với cùng khóa: Core nhận tin → dispatch → Agent trả 202 → Agent đọc history/scope qua API nội bộ → `POST /events` → Core lưu Message `AI_AGENT` và run `COMPLETED`; gửi lại `RunRequest` cho `DUPLICATE`, không tạo kết quả thứ hai.
- Báo phía Agent để chạy E2E Task 10 và sửa client nếu contract mục 3 đã đổi.

Không cần làm: truy cập `agent_runtime`, gửi view lịch sử từ phía caller, thêm tool tạo Ticket, hay giả lập kết quả AI để lấp UI khi Agent chưa nối.
