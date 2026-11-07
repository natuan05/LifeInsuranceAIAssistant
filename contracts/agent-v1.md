# Agent contracts v1

**Trạng thái: đề xuất để review G1, chưa duyệt.** Thực hiện Task 1 của [kế hoạch Agent/RAG](../docs/superpowers/plans/2026-10-31-agent-rag-implementation.md) theo [Agent Design](../docs/specifications/Agent_Design.md#design-overview). Chưa có DB, API, provider hoặc code runtime dùng các contract này; Task 2 bổ sung protocol bền vững/HMAC vào cùng gói.

| File | Nội dung |
| --- | --- |
| [`agent-v1.schema.json`](agent-v1.schema.json) | JSON Schema 2020-12, mọi kiểu nằm trong `$defs` |
| [`fixtures/agent-v1.json`](fixtures/agent-v1.json) | Ví dụ synthetic hợp lệ/không hợp lệ, dùng chung TS và Python |
| [`../apps/core/test/agent-contracts.test.cjs`](../apps/core/test/agent-contracts.test.cjs) | Contract tests, không cần build/DB/credentials |

Chạy từ root sau `npm install`: `node --test apps/core/test/agent-contracts.test.cjs`.

Schema chỉ kiểm **dạng**. Việc ID thuộc đúng nguồn, quyền hiện hành, ref có trong registry và ngữ nghĩa câu trả lời được kiểm ở Core (Task 3), Finalize (Task 5) và đánh giá model thật (Task 9).

## 1. Quy ước

- **Validator:** TypeScript dùng `ajv` 8.20.0 (`ajv/dist/2020`, `strict: true`, `validateFormats: false`); Python dùng `jsonschema` Draft 2020-12 ở Task 4. `format` chỉ là chú thích; UUID, thời điểm, cursor, mã được ràng buộc bằng `pattern` để hai validator cho cùng kết quả.
- **Tên trường:** Web ↔ Core dùng camelCase như API Core hiện có. Core ↔ Agent, tham số tool, kết quả tool và state Agent dùng snake_case như các tên đã chốt trong Agent Design (`response_type`, `run_id`, `evidence_id`). Core tự đổi tên ở ranh giới API nội bộ; Python không cần ánh xạ.
- **ID:** UUID cho mọi ID do Core/Agent cấp; `evidence_id`, `operation_id` là chuỗi ngắn trong phạm vi một tin nhắn. ID chỉ để liên kết/đối soát, không cấp quyền.
- **Cursor:** chuỗi opaque do Core cấp, cùng dạng cursor Core hiện có (base64url, tối đa 2731 ký tự). Agent và Web không giải mã cursor.
- **Vị trí lịch sử:** `position` là số thứ tự xử lý của Core dạng chuỗi thập phân (an toàn cho BigInt).
- **Văn bản:** `SafeText` cấm ký tự điều khiển trừ tab/xuống dòng. Giới hạn: tin người dùng 4.000; câu trả lời 8.000; query 1.000; nội dung bằng chứng 8.000; mục tóm tắt Ticket 500–1.000.
- **Phiên bản:** wire `schema_version = "agent-v1"`; state checkpoint `state_schema_version = "agent-state-v1"` kèm `graph_version`. Đổi không tương thích thì tăng phiên bản, không sửa nghĩa trường cũ.

### Đổi tên so với kế hoạch

Kế hoạch giao việc chốt ánh xạ tên cho G1. Các kiểu dưới đây được viết camelCase trong kế hoạch nhưng thuộc ranh giới Core ↔ Agent hoặc LLM nên dùng snake_case:

| Trong kế hoạch | Trong schema |
| --- | --- |
| `LinkedHistoryView={conversationId,throughCursor}` | `{conversation_id, through_cursor}` |
| `ContractSummary={policyNumber,mainProduct}` | `{policy_number, main_product}` |
| `ContractOverview` thêm `riders`, `ridersComplete` | `riders`, `riders_complete` |
| `get_contract_overview({policyNumber})`, `retrieve_private({query,policyNumber})` | `policy_number` |

`benefitsSnapshot.ridersComplete` trong JSONB Core giữ nguyên tên theo [dữ liệu hợp đồng tối thiểu](../docs/specifications/Contract_Data_Design.md); chỉ API ra Agent dùng `riders_complete`.

## 2. Bảng kiểu theo ranh giới

| Kiểu | Ranh giới | Dùng ở |
| --- | --- | --- |
| `ConversationCreate` (`…Customer`/`…Staff`), `ConversationSummary`, `ConversationListPage`, `ConversationHistoryPage`, `RunSummary`, `MessageSubmit`, `MessageSubmitAck` | Web ↔ Core | Task 3, 10 |
| `RunRequest`, `AgentEvent`, `DurableAck`, `HistoryView`, `LinkedHistoryView`, `DocumentScope`, `ContractListResult`, `ContractOverviewResult` | Core ↔ Agent | Task 2, 3, 6 |
| `ExecutionContext` | Agent nội bộ, tin cậy, không vào model | Task 4, 5 |
| `AgentDecision` = `ToolDecision` \| `AnswerDraft`; `ListContractsArgs`, `ContractOverviewArgs`, `RetrievePublicArgs`, `RetrievePrivateArgs` | Model ↔ graph | Task 5 |
| `RetrievalResult`, `Evidence` | Engine truy xuất → Agent | Task 8 |
| `AgentResult`, `Citation`, `Action` (`TicketProposalAction`, `HandoffProposalAction`), `TicketHandoffSummary` | Agent → Core → Web | Task 5, 6, 10 |
| `ConversationContext`, `MessageWork` và kiểu con | State checkpoint | Task 4, 5 |

Tên lớp dự kiến khi triển khai: Core `apps/core/src/agent/dto/agent.dto.ts` dùng `<Kiểu>Dto`; Python `apps/agent/src/life_agent/contracts.py` dùng cùng tên kiểu. Cả hai kiểm bằng cùng `fixtures/agent-v1.json`; không import mã của nhau.

## 3. Web ↔ Core

- **Tạo hội thoại:** Customer gửi `{clientConversationId}`; Staff gửi `{clientConversationId, targetCustomerId, linkedContextConversationId?}`. Core chọn biến thể theo role trong session, kiểm assignment hiện hành và chat liên kết cùng Customer/được phép đọc. Trường do Staff chọn chỉ là yêu cầu. `clientConversationId` chỉ chống trùng lệnh tạo: cùng key + cùng payload trả cùng hội thoại, khác payload là conflict; key mới tạo hội thoại mới, không áp một hội thoại/Customer.
- **Tìm lại sau reload:** `GET` list/read/history không tạo hội thoại, tin nhắn hoặc run. `ConversationSummary.currentRun` là run `RUNNING`, nếu không có thì run `QUEUED` kế tiếp, không còn việc thì `null`. Browser không cần nhớ run ID.
- **`RunSummary`:** `COMPLETED` bắt buộc có `result` (một `AgentResult` đã qua kiểm tra); trạng thái khác không có `result`.
- **Lịch sử người dùng (`ConversationHistoryPage`):** ba loại mục theo `position` tăng dần: `USER_MESSAGE` (kèm run ID/trạng thái nếu có), `AGENT_RESULT` (kết quả Core đã chấp nhận) và `RUN_OUTCOME` (lỗi/hủy kỹ thuật đã lọc mã). Đây không phải `HistoryView` của Agent.
- **Gửi tin:** `MessageSubmit {clientMessageId, content}` → `MessageSubmitAck` chỉ sau khi tin và run đã lưu bền vững; gửi lại cùng key trả `replayed=true`.

### Đối chiếu API hội thoại đã có (cần quyết định ở G1)

Module `apps/core/src/conversations` (04/11/2026) đã có tạo/list/đọc hội thoại, gửi tin, lịch sử phân trang và handoff cho Customer/Staff, dùng `clientRequestId`, `kind` (`AI`/`DIRECT`), `controlVersion`, `nextMessageSequence`. Kế hoạch được viết trước module này. Hai hướng cho Task 3:

1. Dựng các contract trên vào API hội thoại hiện có (`clientConversationId` ↔ `clientRequestId` + `kind=AI`; bổ sung `currentRun`, mục `AGENT_RESULT`/`RUN_OUTCOME`, Staff Copilot có link).
2. Giữ module `agent` riêng như bản đồ file của kế hoạch.

Schema này không chọn thay; tên trường Web ↔ Core sẽ chỉnh theo lựa chọn được duyệt.

## 4. Core ↔ Agent

- **`RunRequest`:** run/attempt, hội thoại/tin/nội dung, `channel_type`, actor (ID + role đã xác minh), Customer mục tiêu, `history_view`, `linked_history_view`, `limits`. Ràng buộc kênh: `CUSTOMER_SUPPORT` → actor `CUSTOMER`, không có linked view; `STAFF_COPILOT` → actor `STAFF`, linked view có thể `null` (khi đó Agent nêu thiếu context, không tự chọn chat khác). Core còn phải bảo đảm `actor.id = target_customer_id` với Customer và `history_view.current_message_id = message_id`; schema không biểu diễn được hai điều này.
- **`ExecutionContext`:** như `RunRequest` bỏ `message_text`, thêm `thread_id` do code ánh xạ từ hội thoại. Chỉ adapter đọc; không gửi model, không chứa khóa/chữ ký/session. Câu hỏi nằm trong `MessageWork.original_question`.
- **`limits`:** giá trị thử nghiệm đã chốt `retrieval_calls_max=3`, `core_read_requests_max=4`, `core_request_timeout_ms=3000`, `core_retry_per_call=1`. `model_calls_max`, `graph_steps_max`, `turn_token_budget`, `finish_reserve_tokens` là `null` cho tới G4; sau G4, giá trị bắt buộc còn `null` thì Agent từ chối chạy thay vì tự đặt.
- **`AgentEvent`:** `PROGRESS {stage}` với `PREPARING`/`LOOKING_UP`/`COMPOSING` (tiến độ trong `RUNNING`); `RESULT {result}`; `ERROR {failure}`. `sequence` bắt đầu từ 1, tăng theo attempt, giữ nguyên khi giao lại; `event_id` do Agent cấp.
- **`DurableAck`:** chỉ gửi sau khi bên nhận đã lưu bền vững hoặc nhận ra bản đã lưu. `event_id = null` với ACK tiếp nhận run.

| `outcome` | HTTP đề xuất | Bên gửi |
| --- | --- | --- |
| `ACCEPTED` | 202 (nhận run) / 200 (nhận event) | Dừng gửi lại |
| `DUPLICATE` | 200 | Dừng; không tạo kết quả mới |
| `IGNORED_STALE` | 200, `reason=ATTEMPT_NOT_CURRENT` | Dừng; không sửa kết quả hiện hành |
| `CONFLICT` | 409, `PAYLOAD_MISMATCH`/`SEQUENCE_CONFLICT` | Dừng, ghi sự cố |
| `REJECTED` | 400/401/403 (`SCHEMA_INVALID`, `AUTH_FAILED`, `REPLAY_REJECTED`, `UNKNOWN_RUN`) | Dừng, không tự sửa payload |

Không có ACK (mất mạng, timeout, 5xx) mới là trường hợp gửi lại cùng run/attempt/event/sequence/payload. Lịch retry, HMAC và chống phát lại thuộc G2/G3.

**Trạng thái run (mức Core):** `QUEUED → RUNNING → COMPLETED | FAILED | CANCELLED`; `QUEUED → CANCELLED`. Ba trạng thái cuối không đổi nữa; event đến muộn không đưa run về `RUNNING`. Attempt, nhận việc, fencing và đối soát là state machine riêng của Task 2.

## 5. Tool và ánh xạ lỗi

LLM chỉ chọn **một** `ToolDecision {tool, arguments}` mỗi vòng, đúng bốn tool. Tham số không có actor, Customer, scope, thread hay view; mảng nhiều tool, `tool_calls` hoặc trộn tool với câu trả lời đều bị từ chối. Lịch sử/scope là lời gọi tích hợp, không phải tool.

**Scope (`DocumentScope`)** do Core trả cho adapter: `GRANTED` kèm cặp document/version (Private có `policy_id` để kiểm chéo, `scope_version`, `expires_at`) hoặc `DENIED`. Scope hợp lệ rỗng là `GRANTED` với `documents=[]`. Timeout/lỗi Core là lỗi giao tiếp, không phải một scope.

| Tình huống | `RetrievalResult.status` | `error.code` | Agent xử lý |
| --- | --- | --- | --- |
| Tìm thấy bằng chứng | `OK` (`degraded` nếu chỉ keyword) | `null` | Tự đánh giá độ đủ |
| Tìm trong scope, không có ứng viên | `NO_MATCH` | `null` | Không suy thành không có quyền lợi |
| Scope `GRANTED` rỗng | `NO_SOURCE` | `null` | Báo thiếu nguồn |
| Scope `DENIED` | `DENIED` | `null` | Dừng Private, không dùng Public thay |
| Core timeout/lỗi khi cấp scope | `ERROR` | `SCOPE_UNAVAILABLE` | Không truy xuất Private |
| DB/engine lỗi; model embedding không tương thích | `ERROR` | `SEARCH_UNAVAILABLE`/`TIMEOUT`/`EMBEDDING_INCOMPATIBLE` | Báo lỗi nguồn |

`missing[]`/`conflicts[]` chỉ chứa vấn đề cấu trúc/nguồn (`UNRESOLVED_REFERENCE`, `REFERENCE_OUT_OF_SCOPE`, `REFERENCE_TARGET_MISSING`, `EXPANSION_CAP_REACHED`, `SOURCE_WARNING`; xung đột cần ít nhất hai `evidence_id`). Đánh giá đủ/thiếu về nghĩa nằm ở `MessageWork.agent_assessment`. `error` chỉ có mã + `retryable`, không có SQL, payload hay ID ngoài quyền.

| Business read | Trạng thái | `error.code` | Retry tự động của adapter |
| --- | --- | --- | --- |
| Danh sách rỗng sau kiểm quyền | `OK`, `contracts=[]` | `null` | — |
| Mã hợp đồng không có trong phạm vi | `NOT_FOUND` | `null` | Không |
| Từ chối quyền / attempt vô hiệu | `DENIED` | `NOT_AUTHORIZED` / `INVALID_ATTEMPT` | Không; dừng Private |
| Timeout / Core tạm lỗi | `ERROR` | `TIMEOUT` / `UNAVAILABLE` | Tối đa 1 lần, trong budget/deadline |
| Tham số sai | `ERROR` | `INVALID_INPUT` | Không |

`ContractOverview.riders_complete` là bắt buộc. Core chuẩn hóa JSON cũ/thiếu cờ thành `false`; bổ trợ chưa ánh xạ danh mục không được làm danh sách thành đầy đủ.

## 6. Kết quả, trích dẫn và action

- Node Agent trả `AnswerDraft` với `citations: [{evidence_id}]`; Finalize thay bằng `Citation` lấy metadata từ bằng chứng thật. `AgentResult` luôn đúng bốn trường. ID trích dẫn không có trong bằng chứng đã nhận thì sửa tối đa một lần rồi trả lỗi kỹ thuật an toàn.
- **Allowlist action:** `PROPOSE_TICKET {summary}` và `PROPOSE_HANDOFF {subject, reason}`. Cả hai chỉ là đề xuất; Core xác nhận với Customer, kiểm quyền/chống trùng rồi mới ghi. Không có action gửi/soạn nháp cho Customer. Đề xuất: với `STAFF_COPILOT`, Finalize chỉ chấp nhận `actions=[]` cho tới khi G6 chốt quyền Staff với Ticket.
- **`TicketHandoffSummary`** có đúng sáu nhóm: `request`, `context`, `customer_statements`, `verified_findings`, `attempted_steps`, `pending_issues`. `verified_findings[].source_refs` chỉ được dẫn `evidence:`/`core:`; tin của khách thuộc `customer_statements`. Nhóm thiếu căn cứ để rỗng, không bịa cho đủ.
- **Source registry:** code gom nguồn thật của tin hiện tại với ref `evidence:<evidence_id>`, `core:<operation_id>`, `message:<message_id>`. Schema chỉ kiểm dạng ref; Finalize kiểm ref có trong registry và tool `ERROR` không thành finding đã xác minh.

## 7. State Agent (Step 4)

| Nhóm | Vòng đời | Nội dung |
| --- | --- | --- |
| `ConversationContext` | Theo thread, qua nhiều tin | Chủ đề, hợp đồng đang xét, câu hỏi chờ làm rõ (lựa chọn có `ordinal`, run/tin đã hỏi, `PROPOSED`/`ASKED`), tóm tắt lịch sử cũ kèm cursor đã phủ, cursor lịch sử đã đồng bộ, mốc chat liên kết đã đồng bộ |
| `MessageWork` | Theo tin nhắn | Câu hỏi gốc, kết quả tool thật (`SourceOutput` có `operation_id`, `replaced`), đánh giá riêng của Agent, điều kiện đã nhận diện nhưng chưa kiểm (`basis_refs` bắt buộc, lý do), bộ đếm, tiến độ, lỗi |
| `ExecutionContext` | Theo attempt, tin cậy | ID run/attempt/thread, actor, Customer mục tiêu, view, limits |

- Kết quả tool do code ghi; diễn giải của LLM ở `agent_assessment`/`unverified_conditions`; bộ đếm do code quản lý. `WorkCounters` là bản sao để dựng context/trace; ledger bền vững của Task 2/4 mới là căn cứ budget.
- Mốc chat liên kết của Copilot (`linked_sync`) tách khỏi lịch sử của chính hội thoại Copilot (`history_synced_through`). Copilot không đọc checkpoint của hội thoại Customer.
- Không đưa credentials, chữ ký, session hoặc toàn bộ `ExecutionContext` vào model hay checkpoint. Kết quả Private trong checkpoint vẫn là dữ liệu nhạy cảm; retention thuộc G3.

## 8. Reset matrix (Step 5)

| Sự kiện | `ConversationContext` | `MessageWork` | Ledger/budget |
| --- | --- | --- | --- |
| Tin mới trong cùng hội thoại | Giữ; Prepare đồng bộ lịch sử tới `history_view` | Tạo mới | Budget mới |
| Cùng tin, attempt mới (retry/resume) | Giữ | Giữ tiến trình đã ghi | Giữ phần đã tiêu, kể cả reservation chưa rõ kết quả |
| Khách đổi chủ đề/hợp đồng | Cập nhật đối tượng; bỏ pending không còn áp dụng | Loại bằng chứng không còn phù hợp khỏi context (vẫn giữ provenance) | Không đổi |
| Pending được trả lời / khách sửa ý | Xóa hoặc cập nhật pending | Lời khách ghi là khách cung cấp | Không đổi |
| Agent tạo `CLARIFICATION` | Pending ở `PROPOSED` | — | — |
| Core chấp nhận kết quả `CLARIFICATION` | Pending chuyển `ASKED` khi Prepare đồng bộ lượt sau | — | — |
| Lượt trước lỗi/hủy | Giữ chủ đề để hiểu câu nối tiếp; lỗi chỉ là technical outcome | Lượt mới có work riêng | Budget mới |
| Quyền đổi/thu hồi | Bỏ nội dung không còn được phép khỏi context | Bằng chứng ngoài quyền không vào context | Không cấp thêm |
| Checkpoint không tương thích | Dựng lại từ lịch sử Core được phép đọc | Không chạy lại tool/side effect đã ghi | Giữ |

Chỉ pending `ASKED` được dùng để hiểu “cái thứ hai”; pending `PROPOSED` của lượt chưa được Core nhận thì coi như chưa hỏi.

## 9. History view và linked view (Step 6)

- **`HistoryView` của hội thoại:** Core cấp `through_cursor` phủ mọi mục Core đã xử lý trước tin hiện tại theo thứ tự xử lý (`position`), gồm cả kết quả/lỗi lượt trước được Core chấp nhận sau khi tin hiện tại đã vào hàng đợi. Không cắt theo `createdAt`; không chứa tin xếp sau. `through_cursor = null` nghĩa là chưa có lịch sử trước đó.
- **Lượt trước lỗi:** xuất hiện dưới dạng `RUN_OUTCOME` (mã đã lọc) tách khỏi tin của khách; không giả thành kết quả nghiệp vụ.
- **`LinkedHistoryView` của Copilot:** Core lưu cùng run lúc nhận câu hỏi Staff. Mọi trang và mọi retry/resume của run đó dùng cùng view; tin nguồn commit sau mốc vào lượt Staff kế tiếp. Mỗi lần đọc Core vẫn kiểm quyền hiện hành, nên view cũ không giữ quyền đã bị thu hồi.
- **Phiên bản:** checkpoint ghi `state_schema_version` + `graph_version`. Không tương thích thì dựng lại context từ lịch sử Core, không chạy lại nghiệp vụ.

## 10. Lỗi kỹ thuật của lượt

| `TechnicalFailure.code` | Ý nghĩa | Kết quả run (Core quyết) |
| --- | --- | --- |
| `DEADLINE_EXCEEDED`, `BUDGET_EXHAUSTED` | Chạm trần cứng, không tổng hợp được trong phần dự phòng | `FAILED` |
| `MODEL_ERROR`, `OUTPUT_INVALID` | Provider lỗi; đầu ra vẫn sai sau một lần sửa | `FAILED` hoặc attempt mới theo G2 |
| `PERMISSION_DENIED`, `ATTEMPT_INVALID` | Quyền đổi / attempt bị vô hiệu | `FAILED`/`CANCELLED`; event có thể bị `IGNORED_STALE` |
| `SOURCE_UNAVAILABLE`, `INTERNAL` | Không còn đường xử lý an toàn | `FAILED` |

Lịch sử người dùng hiển thị `RUN_OUTCOME.code` đã lọc (thêm `STAFF_TAKEOVER`, `CANCELLED_BY_CORE`); không có câu trả lời đoán thay lỗi.

## 11. Cần chốt ở review G1

1. Hướng Task 3 với module hội thoại hiện có (mục 3).
2. Quy ước camelCase/snake_case và các đổi tên ở mục 1.
3. Thêm `PROPOSE_HANDOFF` cạnh `PROPOSE_TICKET` (Agent Design nêu action gồm Ticket hoặc chuyển Staff; kế hoạch chỉ đặc tả Ticket) và đề xuất Copilot không trả action trước G6.
4. Dependency `ajv` 8.20.0 cho Core devDependencies (đã có sẵn trong lockfile qua Nest CLI); Python dùng `jsonschema` khi Task 4 pin dependency.
5. Mẫu mã: `policy_number`, `product_code`, `document_version`, `thread_id`, `scope_version`; enum `DocumentType` theo loại tài liệu đề xuất trong Agent Design; tên `ProgressStage`.
6. Các limit `null` chờ G4; HTTP mapping ACK chờ cùng profile HMAC ở G2/G3.
