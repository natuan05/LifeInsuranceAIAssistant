# Agent contracts v1

**Trạng thái: G1 và phần còn lại của G2/G3 tiếp tục review; profile HMAC và framework HTTP đã chọn theo code hiện có (12.9–12.10).** Thực hiện Task 1–2 của [kế hoạch Agent/RAG](../docs/superpowers/plans/2026-10-31-agent-rag-implementation.md) theo [Agent Design](../docs/specifications/Agent_Design.md#design-overview). Phía Agent đã có checkpoint bền vững và HTTP/HMAC; Core run/attempt và tích hợp thật còn theo Task 3/6/10. Mục 12 phân biệt phần đã chọn và proposal còn mở.

| File | Nội dung |
| --- | --- |
| [`agent-v1.schema.json`](agent-v1.schema.json) | JSON Schema 2020-12, mọi kiểu nằm trong `$defs` |
| [`fixtures/agent-v1.json`](fixtures/agent-v1.json) | Ví dụ synthetic hợp lệ/không hợp lệ, dùng chung TS và Python |
| [`../apps/core/test/agent-contracts.test.cjs`](../apps/core/test/agent-contracts.test.cjs) | Contract tests, không cần build/DB/credentials |
| [`../apps/core/test/agent-protocol.test.cjs`](../apps/core/test/agent-protocol.test.cjs) | Reference model protocol mục 12 (chỉ cho test) |

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

<a id="application-conversation-api-mapping"></a>
### Ánh xạ API hội thoại Application — đã chọn, tích hợp còn P

Mở rộng module `apps/core/src/conversations` và API Web hiện có; không dựng bộ API chat công khai thứ hai. `ConversationCreate`/`ConversationSummary`/`ConversationHistoryPage` trong schema G1 là kiểu logic tham chiếu; không ghi đè DTO REST đang chạy. Core phải có ánh xạ rõ và kiểm tương thích khi bổ sung run/history/Copilot; không sửa wire `agent-v1` hoặc fixtures trong đợt chốt tài liệu này.

| Ranh giới | Contract Application cần giữ/bổ sung |
| --- | --- |
| Customer create/list/detail | Giữ `/api/v1/customers/me/conversations`; create dùng `clientRequestId`, `kind`, `subject?`, DIRECT giữ `expectedAssignmentVersion`. `clientConversationId` trong schema tham chiếu ánh xạ tới `clientRequestId`, không bắt Web đổi tên |
| Gửi tin | Giữ `clientMessageId` (đã có trong `SendMessageDto`), `expectedVersion`, `content` và route role-specific `/conversations/:id/messages`. Không đổi tên key gửi tin thành `clientRequestId` |
| Fence và ACK | Giữ `controlVersion`/capabilities, envelope message/replayed và lookup bằng key cũ; phần Agent bổ sung run liên kết. Với tin cần AI, tin + run + dispatch intent phải được lưu nguyên tử trước ACK; lỗi gửi HTTP sau commit được reconcile, không tạo trùng tin/run |
| Discovery/history | Mở rộng list/detail/history hiện có với `currentRun` và projection kết quả/lỗi `AGENT_RESULT`/`RUN_OUTCOME`; giữ message sequence/cursor/REST envelope hiện tại, không trộn progress thành chat message. DTO bổ sung cụ thể còn P; reload/GET không tạo run |
| Staff Copilot | Mở rộng API dưới module conversations theo CP01; A24–26 còn là route đề xuất cần ánh xạ source conversation → conversation STAFF_COPILOT đúng Staff/Customer. Tái dùng cùng run/attempt/event lifecycle, không tạo task store hoặc chat history độc lập thứ hai; không append vào transcript Customer |
| Core → Agent | Adapter dựng `RunRequest` snake_case từ dữ liệu Core tin cậy; Core cấp run/attempt/message/conversation IDs và quyền, browser không gửi RunRequest hoặc tự chọn role/audience |

Module mới `apps/core/src/agent/` chỉ sở hữu run/attempt/event, dispatcher/reconcile, HMAC và API nội bộ cho Agent. Public create/list/detail/messages/history/Copilot ở module conversations, gọi service Agent trong transaction phù hợp. `GET /agent-runs/:id` trong plan cũ không phải API mới bắt buộc; discovery qua conversation là đường chuẩn, lookup bổ sung chỉ review nếu cần cụ thể. DDL, request/response bổ sung và kiểm tích hợp còn P; chọn cách tổ chức không tự nghiệm thu G1/G2/G3.

Sau Staff, Customer dùng [New AI chat với conversation/thread/context riêng](../docs/specifications/Agent_Design.md#new-ai-chat-after-staff); giữ lịch sử và grant cũ độc lập, không có chuyển STAFF_ACTIVE về AI. Tích hợp Agent còn P.

Chính sách logout/hết phiên theo [Agent Design](../docs/specifications/Agent_Design.md#agent-logout-session-policy): run đã được Core tiếp nhận tiếp tục bằng service/run authorization, phiên Web chỉ dùng cho tương tác. Core vẫn reauthorize actor/resource/attempt; không thêm cookie/session token vào wire. Tích hợp Core và kiểm race còn P.

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

Không có ACK (mất mạng, timeout, 5xx) mới là trường hợp gửi lại cùng run/attempt/event/sequence/payload. Lịch retry còn đề xuất; profile HMAC/chống phát lại đã chọn ở 12.9.

**`AttemptRevocation` / `RevocationAck`** (đề xuất G2, mục 12.3–12.5): Core yêu cầu kho Agent thu hồi quyền ghi của một attempt; ACK `REVOKED`/`ALREADY_REVOKED` kèm `writer_epoch` chỉ gửi sau commit.

**Trạng thái run (mức Core):** `QUEUED → RUNNING → COMPLETED | FAILED | CANCELLED`; `QUEUED → CANCELLED`. Ba trạng thái cuối không đổi nữa; event đến muộn không đưa run về `RUNNING`. Attempt, nhận việc, fencing và đối soát: mục 12.

## 5. Tool và ánh xạ lỗi

LLM chỉ chọn **một** `ToolDecision {tool, arguments}` mỗi vòng, đúng bốn tool. Tham số không có actor, Customer, scope, thread hay view; mảng nhiều tool, `tool_calls` hoặc trộn tool với câu trả lời đều bị từ chối. Lịch sử/scope là lời gọi tích hợp, không phải tool.

Copilot chọn hợp đồng theo [câu hỏi/lịch sử Staff](../docs/specifications/Agent_Design.md#copilot-policy-selection), không theo selector hoặc linkedPolicyId update API. Số hợp đồng rõ cho phép gọi tool ngay sau kiểm quyền; mơ hồ hỏi lại, không tự đổi Customer mục tiêu. Tích hợp còn P.

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

Dữ liệu gửi model theo [phạm vi MVP](../docs/specifications/Agent_Design.md#mvp-model-data-policy): prompt/synthetic cùng quyền/scope/validation hiện có, không bổ sung bộ lọc định danh bằng code. Không suy kiểm schema/source refs thành đã che PII hoặc nghiệm thu dữ liệu thật.

<a id="ticket-source-metadata-callback"></a>
### 6.1 Metadata nguồn summary Ticket qua callback — hướng đã chọn, triển khai P

Agent gửi metadata tối thiểu của các nguồn được summary Ticket tham chiếu cùng callback RESULT. Đây là mở rộng wire **chưa triển khai**: `AgentResult` hiện vẫn đúng bốn trường, schema/fixtures `agent-v1` chưa đổi và từ chối field lạ. Đề xuất đặt registry metadata ở envelope RESULT, bên cạnh result; phải chốt schema, giới hạn kích thước/số nguồn và phiên bản wire mới trước khi code hai bên. Không tự thêm field vào payload agent-v1 đang chạy hoặc dùng metadata browser tự khai làm nguồn trusted.

| Bên | Trách nhiệm |
| --- | --- |
| Contract chung — Task 1/6 | Đặc tả metadata có version và khóa ref duy nhất trong run/attempt/message; fixtures hợp lệ/không hợp lệ, reject version chưa hỗ trợ. Không đổi cấu trúc sáu nhóm summary hoặc để LLM tự viết metadata nguồn |
| Agent — Task 5/6 | Sau Finalize, lấy metadata từ registry nguồn thật của tin hiện tại đã dùng trong `verified_findings[].source_refs`; loại nguồn replaced/error, không gom toàn bộ registry/tool trace. Lưu kết quả + metadata trước callback; mất ACK/restart giao lại cùng event/metadata, không đọc lại nguồn hoặc chạy model để tái tạo |
| Core — Task 3/6 và I07 | Xác thực service/run/attempt/fence, schema/version và coverage của refs; đối chiếu document/version với scope và quyền hiện hành, kết quả Core với đọc nghiệp vụ của run. Core chuẩn hóa registry được phép, lưu cùng draft/revision và confirmed snapshot trong transaction nghiệp vụ; thiếu/sai nguồn thì không tạo draft Agent tin cậy hoặc xác nhận draft thiếu payload chuẩn |
| Web — T01/T02, TK04 | Customer review sáu nhóm và projection nguồn của revision; Staff xem snapshot được phép. Mở nguồn qua Core kiểm quyền exact version, không tự tải từ URL callback |

Metadata cần đặc tả gồm `ref` và loại nguồn; evidence có document/version, title/type và location pages/clause/anchor đúng nguồn, không bịa trang cho Markdown. Nguồn `core:` cần loại đọc nghiệp vụ, resource/result identity và mốc đối chiếu đủ để Core kiểm trong run/attempt/view; chỉ có operation ID do Agent tự cấp không chứng minh Core đã xác nhận. Nhóm khách khai vẫn là `customer_statements`, không trở thành finding đã xác minh. `message:` nếu cần cho provenance phải thuộc history view được phép, không dùng làm chứng cứ verified finding.

Không gửi nguyên chunk, tool response/trace, token/chữ ký/session, signed URL hoặc bucket/object key trong metadata này. Core không coi chữ ký hợp lệ hay metadata đủ field là bằng chứng ngữ nghĩa đúng. Summary thiếu căn cứ để nhóm rỗng, không bịa nguồn. Khi sửa title/description/policy làm summary không còn phù hợp, cần cập nhật summary/nguồn hợp lệ và Customer review lại; hash/version bao phủ summary + nguồn. Snapshot đã confirm bất biến, mở lại không lấy current version thay thế.

Kiểm triển khai bắt buộc: ref thiếu/trùng/ngoài scope/sai version, core operation không đối chiếu được, tool error/replaced, payload quá giới hạn, version cũ/mới, callback replay nguyên metadata sau restart, draft edit/confirm race và UI mất quyền nguồn. Các ca này là acceptance dự kiến, không phải kết quả đã chạy. Quyền Ticket vẫn độc lập transcript; manual Ticket không bị bắt buộc có nguồn Agent.

## 7. State Agent (Step 4)

| Nhóm | Vòng đời | Nội dung |
| --- | --- | --- |
| `ConversationContext` | Theo thread, qua nhiều tin | Chủ đề, hợp đồng đang xét, câu hỏi chờ làm rõ (lựa chọn có `ordinal`, run/tin đã hỏi, `PROPOSED`/`ASKED`), tóm tắt lịch sử cũ kèm `position` cuối đã phủ, cursor lịch sử đã đồng bộ, mốc chat liên kết đã đồng bộ |
| `MessageWork` | Theo tin nhắn | Câu hỏi gốc, kết quả tool thật (`SourceOutput` có `operation_id`, `replaced`), đánh giá riêng của Agent, điều kiện đã nhận diện nhưng chưa kiểm (`basis_refs` bắt buộc, lý do), bộ đếm, tiến độ, lỗi |
| `ExecutionContext` | Theo attempt, tin cậy | ID run/attempt/thread, actor, Customer mục tiêu, view, limits |

- Kết quả tool do code ghi; diễn giải của LLM ở `agent_assessment`/`unverified_conditions`; bộ đếm do code quản lý. `WorkCounters` là bản sao để dựng context/trace; ledger bền vững của Task 2/4 mới là căn cứ budget.
- Mốc chat liên kết của Copilot (`linked_sync`) tách khỏi lịch sử của chính hội thoại Copilot (`history_synced_through`). Copilot không đọc checkpoint của hội thoại Customer.
- Không đưa credentials, chữ ký, session hoặc toàn bộ `ExecutionContext` vào model hay checkpoint. Kết quả Private trong checkpoint vẫn là dữ liệu nhạy cảm; lưu trong MVP theo [chính sách khôi phục](../docs/configuration-and-data.md#mvp-agent-recovery-retention), quyền truy cập tiếp tục theo protocol.

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
| `MODEL_ERROR`, `OUTPUT_INVALID` | Provider lỗi; đầu ra vẫn sai sau một lần sửa | `FAILED` terminal; không tự tạo attempt mới |
| `PERMISSION_DENIED`, `ATTEMPT_INVALID` | Quyền đổi / attempt bị vô hiệu | `FAILED`/`CANCELLED`; event có thể bị `IGNORED_STALE` |
| `SOURCE_UNAVAILABLE`, `INTERNAL` | Không còn đường xử lý an toàn | `FAILED` |

Lịch sử người dùng hiển thị `RUN_OUTCOME.code` đã lọc (thêm `STAFF_TAKEOVER`, `CANCELLED_BY_CORE`); không có câu trả lời đoán thay lỗi.

## 11. Cần chốt ở review G1

1. Ánh xạ DTO REST bổ sung cho [API conversations đã chọn](#application-conversation-api-mapping), gồm Copilot/discovery/history; tích hợp còn P.
2. Quy ước camelCase/snake_case và các đổi tên ở mục 1.
3. Thêm `PROPOSE_HANDOFF` cạnh `PROPOSE_TICKET` (Agent Design nêu action gồm Ticket hoặc chuyển Staff; kế hoạch chỉ đặc tả Ticket) và đề xuất Copilot không trả action trước G6.
4. Dependency `ajv` 8.20.0 cho Core devDependencies (đã có sẵn trong lockfile qua Nest CLI); Python dùng `jsonschema` khi Task 4 pin dependency.
5. Mẫu mã: `policy_number`, `product_code`, `document_version`, `thread_id`, `scope_version`; enum `DocumentType` theo loại tài liệu đề xuất trong Agent Design; tên `ProgressStage`.
6. Các limit `null` chờ G4; HTTP mapping ACK và phần G2/G3 còn lại tiếp tục review; profile HMAC đã chọn ở 12.9.

## 12. Protocol bền vững và tích hợp — gói đề xuất G2/G3 (Task 2)

**Trạng thái: gói đề xuất Task 2; các phương án ở 12.13 ghi nhận từ nhánh nguồn ngày 06/11/2026. Tổ chức module/API ở phương án 1, hành vi FAILED ở phương án 4 và profile/framework ở phương án 5 đã chọn; các phần khác chưa đóng G2/G3.** Các phương án còn lại không tự trở thành quyết định được duyệt từ việc có code hoặc merge. Phần này là đầu vào cho G2 (persistence/concurrency) và G3 (transport/policy). Theo kế hoạch, Task 3/4 phần DB và Task 6 chỉ bắt đầu khi phần tương ứng được duyệt. Reference model [`agent-protocol-model.cjs`](../apps/core/test/helpers/agent-protocol-model.cjs) và [`agent-protocol.test.cjs`](../apps/core/test/agent-protocol.test.cjs) (`node --test apps/core/test/agent-protocol.test.cjs`) kiểm tính nhất quán của các bảng dưới. Chúng không chứng minh khóa DB, mạng hay hai tiến trình thật; các phép đó nằm trong acceptance matrix (12.12).

| Mục | Trạng thái | Nguồn ghi nhận/review | Ngày ghi nhận |
| --- | --- | --- | --- |
| 12.2–12.8 Storage, state machine, fencing, ledger, final record, crash matrix (G2) | Hành vi FAILED không tự retry ở phương án 4 đã chọn; module/API ở phương án 1 đã chọn; storage/fencing/ledger và các phần G2 còn lại tiếp tục review | Ghi nhận từ nhánh; chưa xác minh nguồn duyệt | 06/11/2026 |
| 12.9–12.10 HMAC, endpoint, framework (G3) | Profile/framework đã chọn theo code; retention dữ liệu khôi phục MVP theo chính sách chung; endpoint mapping, lịch giao lại và tích hợp Core tiếp tục review | Người dùng chọn theo code hiện có; không đóng toàn bộ G3 | 15/11/2026 |
| 12.11 DDL | Core: đề xuất cho Task 3; Agent: migration Task 4 đã có, không tự đóng G2 | — | — |


### 12.1 Bất biến cần giữ

1. Mỗi hội thoại có tối đa một run `RUNNING`; tin xếp hàng theo `messages.sequence`; hội thoại khác chạy độc lập.
2. Mỗi run có tối đa một attempt sống (`DISPATCHING`/`ACCEPTED`/`INVALIDATING`). Attempt mới cho cùng thread chỉ được giao sau khi kho Agent đã ACK thu hồi attempt cũ.
3. Mỗi thread chỉ một writer hợp lệ. Mọi lần ghi checkpoint, reservation và kết quả cuối kiểm `(thread_id, attempt_id, writer_epoch)` **trong cùng transaction** với lần ghi.
4. ACK chỉ gửi sau commit. Gửi lại dùng đúng run/attempt/event/sequence/payload. Bản đã lưu không cấp quyền công bố: Core kiểm attempt hiện hành, takeover và quyền khi nhận.
5. Budget theo tin nhắn, trừ **trước** lời gọi ngoài; reservation chưa rõ kết quả vẫn tính là đã tiêu; attempt mới cùng tin không có ledger mới.
6. Kết quả cuối, event bất biến, sequence và dấu hoàn tất được ghi cùng một transaction. Đã có bản ghi cuối thì không chạy lại graph.
7. Không có transaction, FK, view hay join giữa schema Core (`business`) và schema Agent (`agent_runtime`). ID chỉ dùng để liên kết.

Trước khi áp ACK, bên gửi kiểm đủ trường, kiểu, outcome/reason nhất quán và khớp request đang chờ: dispatch khớp `run_id`/`attempt_id` và `event_id=null`; event khớp cả `run_id`/`attempt_id`/`event_id`; revoke khớp `run_id`/`attempt_id`, không có `event_id`, có `writer_epoch` nguyên không âm cho `REVOKED`/`ALREADY_REVOKED` và `reason=null`. ACK thiếu/sai trường, không rõ outcome hoặc thuộc request khác không đổi trạng thái, không mở revoke barrier, không xóa event đang chờ; tiếp tục giao đúng request/event đã lưu.

### 12.2 Phân chia lưu trữ và quyền

| Nơi lưu | Chủ sở hữu, quyền | Nội dung |
| --- | --- | --- |
| `business.agent_runs`, `agent_attempts`, `agent_run_events`, `agent_request_nonces` | Core; `app_migrator` (DDL), `core_runtime` (DML) | Vòng đời run/attempt, hàng đợi, dedup event, kết quả đã chấp nhận, nonce HMAC |
| `agent_runtime.*` | Agent; role migration riêng (`agent_migrator`) và role runtime (`agent_runtime`) với pool riêng | Receipt, chủ sở hữu thread, checkpoint, ledger, outbound event, nonce |
| `rag.*` | Indexer (ghi offline) / retriever (đọc) | Không liên quan protocol |

Runtime Agent không có quyền `business` và không ghi `rag`; Core không có quyền `agent_runtime`. Hai schema dùng chung PostgreSQL local nhưng có thể tách sang database riêng bằng dump/restore schema `agent_runtime` (runbook ở Task 4). Sau khi restore, phải thu hồi mọi receipt `ACCEPTED` và nâng `writer_epoch` của mọi thread trước khi nhận việc lại; epoch không được lùi.

### 12.3 Core: run và attempt

| Lệnh (Storage API) | Transaction Core | Kết quả |
| --- | --- | --- |
| `acceptMessage(conversation, clientMessageId, content)` | Khóa `conversations` (`FOR UPDATE`); cấp `messages.sequence`; tạo Message + `agent_runs(QUEUED)` | `ACCEPTED`; cùng key + cùng payload → `REPLAYED` cùng run; khác payload → conflict; hội thoại không còn `AI_ACTIVE` → từ chối |
| `claimNext(conversation)` | Khóa hội thoại; từ chối nếu không `AI_ACTIVE`, đã có `RUNNING` hoặc còn attempt `INVALIDATING`; lấy run `QUEUED` có `queue_position` nhỏ nhất → `RUNNING`; cố định `history_view`; tạo `agent_attempts(DISPATCHING)` với RunRequest + SHA-256 | Commit **trước** khi gửi HTTP; không giữ transaction qua mạng |
| Gửi/đối soát | Ngoài transaction: `POST /internal/runs`; nhận `ACCEPTED`/`DUPLICATE` → `ACCEPTED`. Không có ACK → gửi lại đúng request đã lưu theo `next_dispatch_at` (backoff) | Lặp an toàn nhờ receipt của Agent |
| `applyEvent(event)` | Khóa hội thoại; chèn `agent_run_events` (khóa `event_id`, unique `(attempt_id, sequence)`); kiểm attempt là `current_attempt_id` và đang sống, hội thoại `AI_ACTIVE`, quyền actor hiện hành. `RESULT` kiểm schema và trích dẫn trong scope của run → Message `AI_AGENT` + run `COMPLETED` + attempt `FINISHED`. `ERROR` → `FAILED`. `PROGRESS` chỉ cập nhật khi `sequence` lớn hơn | `DurableAck` mục 4: `DUPLICATE` (cùng hash), `CONFLICT` (`PAYLOAD_MISMATCH`/`SEQUENCE_CONFLICT`), `IGNORED_STALE` (attempt không còn hiện hành hoặc run đã kết thúc), `REJECTED` (`UNKNOWN_RUN`) |
| `invalidateAttempt(attempt, reason)` | Khóa hội thoại; attempt → `INVALIDATING` (tool, scope, history và event của attempt bị từ chối ngay). Chuyển khỏi AI theo [fence request handoff](#handoff-request-agent-fence) ngay khi REQUEST_HANDOFF commit; Staff takeover phòng vệ cùng transaction với handoff hiện có: tăng `control_version`, run đang chạy và các run `QUEUED` → `CANCELLED`. `DEADLINE` → run `FAILED`. `CANCELLED_BY_CORE`/`PERMISSION_CHANGED` → run hiện tại `CANCELLED`. `RETRY` giữ run `RUNNING` | Gửi `AttemptRevocation`; lặp lại tới khi có `RevocationAck` hợp lệ, đúng run/attempt |
| Nhận `RevocationAck` | Chỉ ACK hợp lệ `REVOKED`/`ALREADY_REVOKED` đúng run/attempt mới chuyển attempt → `INVALIDATED`, lưu `revoked_epoch`. Với `RETRY`: tạo attempt mới cùng run | Hội thoại được claim tiếp; attempt đang chờ ACK vẫn giữ barrier dù run đã terminal |

<a id="handoff-request-agent-fence"></a>
### Fence Agent ngay khi yêu cầu chuyển Staff commit — đã chọn, tích hợp P

Mốc bắt đầu là transaction Customer `REQUEST_HANDOFF` chuyển cuộc CUSTOMER_SUPPORT từ `AI_ACTIVE` sang `PENDING_HANDOFF`, không đợi Staff Accept. Cùng khóa/transaction: kiểm consent/owner/routing/version, lưu yêu cầu handoff và tăng controlVersion theo luồng hiện có; hủy run AI đang chạy và các run QUEUED của **chính cuộc đó**, vô hiệu attempt hiện hành và lưu intent revoke bền vững. Rollback không hủy run hay phát revoke; chỉ gửi HTTP sau commit, retry từ intent đã lưu.

- Core chặn ngay tools/scope/history và kết quả của attempt bị vô hiệu; không nhận thêm việc AI hoặc dispatch AI trong PENDING_HANDOFF/STAFF_ACTIVE. Callback đã commit trước request handoff được giữ; callback sau mốc handoff không append hoặc hồi sinh run CANCELLED. Lock/transaction phải giải quyết race callback/request, không dựa vào browser hủy request.
- Request handoff dùng reason wire hiện có `CANCELLED_BY_CORE` cho attempt đang chạy. Command handoff hủy thêm các run QUEUED của cuộc trong cùng transaction; đây là tác động của command, không thay nghĩa generic PERMISSION_CHANGED/CANCELLED_BY_CORE chỉ hủy run hiện tại ở 12.3. Không thêm enum wire trong lượt tài liệu này.
- Revoke được gửi lại tới khi có RevocationAck hợp lệ, đúng run/attempt. Core không suy Agent đã dừng ghi checkpoint chỉ vì HTTP lỗi/lease hết hạn: writer cũ có thể còn chạy tới khi revoke được ghi bền tại Agent. Không cấp writer Agent kế tiếp trên cùng thread trước ACK/fence hợp lệ; giữ nguyên các bảo đảm 12.5.
- Staff Accept vẫn là gate riêng cấp quyền transcript, không phải mốc đầu tiên dừng AI. Revoke chưa ACK không tự cấp quyền Staff hoặc chặn giao dịch hỗ trợ của Staff đã có grant; barrier áp vào writer Agent kế tiếp. Không hủy run của cuộc khác hoặc Copilot riêng còn đúng quyền; Copilot vẫn recheck source grant theo chính sách của nó. Không tự tạo Ticket.

Kiểm Core/Agent thật cần bổ sung ở Task 3/6/10 và CH02/I03: request khi AI chạy/queued, race RESULT trước/sau commit, rollback handoff, replay request, mất ACK/restart, revoke đến trước dispatch, Staff Accept khi revoke pending và Copilot độc lập. Source Application hiện có pending/controlVersion nhưng chưa có run/attempt/revoke tích hợp; các ca này vẫn P.

`history_view.through_cursor` cố định lúc claim, nên gồm kết quả lượt trước dù kết quả đó commit sau lúc tin hiện tại vào hàng đợi; tin xếp sau không thuộc view. `linked_history_view` của Copilot cố định lúc `acceptMessage`. Deadline: reconcile thấy attempt quá `deadline_at` + thời gian ân hạn thì gọi `invalidateAttempt(DEADLINE)`. **Hành vi MVP đã chọn:** lỗi thực thi kỹ thuật hoặc quá deadline kết thúc run `FAILED`, không tự tạo attempt mới; takeover giữ `CANCELLED`. UI/lượt mới theo [chính sách chuẩn](../docs/specifications/Agent_Design.md#failed-turn-policy), tích hợp Core/UI còn P. Gửi lại cùng attempt khi mất ACK vẫn giữ; lý do `RETRY` chỉ dùng khi có thao tác chủ động sau này.

**Người dùng xác nhận bổ sung ngày 12/11/2026:** `PERMISSION_CHANGED` kết thúc run bằng `CANCELLED`, với mã lịch sử Core `RUN_OUTCOME.code=PERMISSION_DENIED`; `CANCELLED_BY_CORE` cũng kết thúc `CANCELLED`, mã lịch sử `CANCELLED_BY_CORE`. Không tự tạo attempt mới. Hai lý do này hủy run hiện tại; không chuyển hội thoại sang Staff hoặc tự hủy các run đang xếp hàng. FIFO chỉ được claim tiếp sau revoke ACK tương quan hợp lệ; Core vẫn kiểm quyền hiện hành cho lượt tiếp theo. Đây là quyết định bổ sung, không phải một trong năm lựa chọn ngày 06/11.

Dispatcher là vòng polling trong tiến trình Core (`SELECT … FOR UPDATE SKIP LOCKED` trên hội thoại có run chờ), chạy cùng bộ đối soát. Đây là ứng viên, chưa chọn queue/worker service mới; nhiều instance Core vẫn đúng nhờ khóa hội thoại và các unique index.

### 12.4 Agent: receipt, quyền ghi, ledger, event

| Lệnh (Storage API) | Transaction `agent_runtime` |
| --- | --- |
| `accept_run(request) -> DurableAck` | Xác thực HMAC → kiểm schema → bên nhận tự tính SHA-256 của JSON canonical `RunRequest` nhận được → receipt theo `attempt_id`: chưa có → tạo `ACCEPTED`, chuyển `thread_owners` sang attempt này (`writer_epoch + 1`, receipt cũ còn `ACCEPTED` → `REVOKED`), mở ledger của `message_id` nếu chưa có. Đã có, cùng SHA-256 → `DUPLICATE` và lên lịch giao lại event chưa ACK. Khác SHA → `CONFLICT`. Tombstone/`REVOKED` → `IGNORED_STALE` |
| `revoke(attempt) -> RevocationAck` | Khóa hàng `thread_owners`; nếu attempt đang sở hữu thì `writer_epoch + 1`, `revoked = true`; receipt `ACCEPTED` → `REVOKED`; attempt chưa từng nhận → tombstone (`status=REVOKED`, `run_id=NULL`, `request_sha256=NULL`) để request đến muộn bị từ chối. `run_id` trong ACK lấy từ control request, không từ tombstone. Commit rồi mới ACK |
| `claim_execution(run_id, attempt_id) -> ExecutionLease` | Chỉ receipt `ACCEPTED` còn sở hữu thread; lấy lease (`claimed_by`, `lease_expires_at`) và **nâng epoch ở mỗi lần claim**, nên tiến trình cũ chạy cùng attempt sau restart/hết lease cũng bị chặn |
| `reserve(...)`, `write_checkpoint(...)`, `persist_final(...)` | Đều kiểm quyền ghi (12.5) trong cùng transaction |
| `pending_events() / ack_event()` | Đọc `outbound_events` chưa ACK theo `next_delivery_at`; ACK `ACCEPTED`/`DUPLICATE`/`IGNORED_STALE`/`CONFLICT` thì dừng gửi (`CONFLICT` ghi sự cố); `REJECTED` hoặc không có ACK thì giữ lại |
| Khởi động lại | Giao lại event chưa ACK; chạy tiếp chỉ receipt `ACCEPTED` còn sở hữu thread, sau khi đồng bộ lại với Core (gửi lại request của Core luôn là `DUPLICATE`). Receipt `FINALIZED` không chạy lại graph |

Fingerprint receipt gồm toàn bộ trường wire `RunRequest`: schema/run/attempt/conversation/message, nội dung, channel, actor, Customer mục tiêu, cả hai history view và limits. Sắp khóa object khi canonical hóa, giữ thứ tự array. Không lấy hash do bên gửi khai làm căn cứ; không thêm trường fingerprint vào wire. Header HMAC/nonce/timestamp và giá trị nội bộ dẫn xuất như `thread_id` không thuộc fingerprint receipt. Hash byte body dùng cho HMAC (12.9) là phép kiểm riêng, không thay hash canonical phía nhận.

Tombstone chưa có payload để đối chiếu run: revoke lặp đúng attempt/thread trả `ALREADY_REVOKED`, ACK echo `run_id` của control request đã xác thực; không tra kho Core và không điền `run_id` vào tombstone. Quy tắc dựa vào control từ Core tin cậy và `attempt_id` duy nhất toàn hệ thống. Thread khác bị từ chối; với receipt đã nhận run, cả run và thread đều phải khớp. Bất kỳ dispatch đến muộn cho attempt đã có tombstone đều `IGNORED_STALE`.

### 12.5 Quyền ghi checkpoint và điểm tuyến tính hóa revoke

**Phương án từ nhánh 06/11/2026 (12.13 #2), chờ duyệt G2:** checkpointer là lớp con `BaseCheckpointSaver` do dự án viết trên psycopg (`put`, `put_writes`, `delete_thread`, `get_tuple`, `list`), dùng serializer của chính thư viện. Không dùng thẳng `langgraph-checkpoint-postgres`, vì không chèn được bước kiểm epoch vào cùng transaction của mọi đường ghi (kể cả pending writes). Graph chạy đồng bộ với `durability="sync"`; lease được truyền qua `configurable` do code đặt, không qua state. Pin `langgraph-checkpoint` 4.3.1 (bản đi cùng `langgraph` 1.2.20 hiện dùng) ở Task 4 và đối chiếu interface với tài liệu chính thức khi triển khai.

```sql
-- mọi lần ghi (checkpoint, pending writes, reservation, kết quả cuối) bắt đầu bằng:
SELECT writer_epoch FROM agent_runtime.thread_owners
 WHERE thread_id = $1 AND attempt_id = $2 AND writer_epoch = $3 AND NOT revoked
 FOR SHARE;                          -- 0 dòng => StaleWriter, rollback, không ghi
-- revoke / chuyển quyền:
UPDATE agent_runtime.thread_owners SET writer_epoch = writer_epoch + 1, revoked = true
 WHERE thread_id = $1 AND attempt_id = $2 AND NOT revoked RETURNING writer_epoch;
```

**Điểm tuyến tính hóa** là lúc transaction revoke commit trong kho Agent. Lần ghi đã giữ `FOR SHARE` trước đó commit xong thì revoke mới tiếp tục. Lần ghi bắt đầu sau đó đọc epoch mới và thất bại. Ở READ COMMITTED, lần ghi đang chờ khóa được đánh giá lại trên phiên bản dòng mới nên cũng thất bại. Phép thử sơ bộ trên PostgreSQL 16 với hai kết nối cho đúng thứ tự này: revoke chờ lần ghi đang mở, lần ghi sau revoke bị từ chối, attempt mới ghi được. Đây chưa phải test nghiệm thu; test hai tiến trình nằm ở Task 4.

**Phương án từ nhánh 06/11/2026 (12.13 #3), chờ duyệt G2: chấp nhận khoảng hở dưới đây, không thêm điều kiện lease vào câu kiểm quyền ghi.** Khi Core không gửi được revoke (mất mạng), Core đã chặn tool/scope/history/event của attempt cũ và không giao attempt mới hay tin kế tiếp cho hội thoại đó. Tuy vậy, writer cũ vẫn có thể gọi model và ghi checkpoint cho thread tới khi revoke tới được kho Agent. Các lần ghi này không thành kết quả Core. Attempt kế tiếp chỉ đọc chúng sau khi revoke đã ACK. Lease chỉ dùng để tiến trình khác nhận lại receipt khi tiến trình cũ chết (mỗi lần claim nâng epoch); nó không thay revoke, vì một writer chỉ mất mạng tới Core vẫn tới được DB của mình và vẫn gia hạn được. Core không bao giờ suy ra đã thu hồi chỉ vì lease hết hạn.

### 12.6 Ledger

`ledgers(message_id, kind, cap, used)` và `reservations(message_id, kind, operation_id, amount, settled)`. Thứ tự trong một transaction: kiểm quyền ghi → khóa dòng ledger → chèn reservation (`ON CONFLICT DO NOTHING`; trùng `operation_id` = replay, không cấp thêm) → `used + amount <= cap` mới cộng, không thì rollback và `BudgetExhausted` **trước** khi gửi. Mã thao tác nhận diện từng lần gọi ngoài, không mặc định chỉ dựa vào số bước graph. Graph hiện tại cấp ID cho summary/model từ usage ledger đã tiêu để lần gọi mới sau crash không dùng lại reservation cũ; các retry cũng cần reservation riêng trong budget gốc của tin nhắn. Replay reservation chỉ cho biết phần đã cấp, không cho phép gửi lại lời gọi chưa rõ kết quả. Nếu không có kết quả đã lưu để tái sử dụng, lần thử gọi ngoài mới phải có operation ID và reservation mới; reservation chưa rõ kết quả vẫn tính đã tiêu.

| Loại | Đơn vị | Ghi chú |
| --- | --- | --- |
| `retrieval_calls` | 1 / lần gọi logic, kể cả lỗi | Mở rộng parent/ref không tính |
| `core_read_requests` | 1 / request thực, kể cả retry | Không gồm history/scope |
| `model_calls` | 1 / lần gọi model, gồm tóm tắt, repair, retry | |
| `model_tokens` | Dự trù trước khi gọi; `settle` bằng input + output + thinking thực tế | Không rõ usage sau crash thì giữ số đã dự trù; phần dự phòng kết thúc nằm trong cap |
| `graph_steps` | 1 / node | Hiện là counter trong state; đề xuất đưa vào ledger để sống qua crash |

### 12.7 Bản ghi kết quả cuối

`persist_final` trong một transaction: kiểm quyền ghi → khóa receipt (`FINALIZED` thì trả lại event đã lưu) → cấp `sequence` từ `attempt_sequences` → chèn `outbound_events` (JSON + SHA-256) → receipt `FINALIZED` + `final_event_id`. Checkpoint của node Finalize ghi sau, ở transaction riêng. Crash giữa hai bước thì khi khởi động lại thấy `FINALIZED` → chỉ giao event, không chạy graph. Progress event cũng cấp sequence cùng cách nên sequence duy nhất theo attempt. Không có transaction chung với Core.

### 12.8 Ma trận crash và mất mạng

| # | Thời điểm | Hành vi đề xuất | Model test |
| --- | --- | --- | --- |
| 1 | Core commit tin, mất response tới Web | Web gửi lại cùng `clientMessageId` → `REPLAYED` | `same_request_key_and_payload_returns_same_run` |
| 2 | Core commit claim, chết trước khi gửi | Đối soát gửi lại đúng request đã lưu | — (Task 3) |
| 3 | Agent chết trước commit receipt | Không có ACK → Core gửi lại → `ACCEPTED` | — |
| 4 | Agent commit receipt, ACK mất | Gửi lại → `DUPLICATE` + giao lại event | `lost_dispatch_ack_resend_is_duplicate_and_returns_pending_events` |
| 5 | Agent chết sau reserve, trước/sau gửi request | Reservation còn; replay cùng `operation_id` không cấp thêm | `reservation_cap_and_replay_never_regrant_budget` |
| 6 | Không rõ token sau crash | Giữ số dự trù | `token reservations are spent even when usage is unknown after a crash` |
| 7 | Agent commit kết quả cuối, chết trước callback | Khởi động lại giao event đã lưu, không chạy graph | `recovery_redelivers_finalized_events_and_resumes_only_unfinished_owners` |
| 8 | Core commit event, ACK mất | Agent gửi lại → `DUPLICATE`, giữ một kết quả | `duplicate_event_keeps_one_result` |
| 9 | Core chết giữa `applyEvent` | Rollback, không ACK → Agent gửi lại | — (Task 6) |
| 10 | Writer cũ treo, revoke + attempt mới, writer cũ nối lại | `StaleWriter` khi ghi/reserve/finalize; Core `IGNORED_STALE` | `stale_writer_cannot_checkpoint_reserve_or_finalize_after_revoke_ack` |
| 11 | Revoke tới trước dispatch đang bay | Tombstone → request đến muộn `IGNORED_STALE` | `revoke_before_dispatch_arrives_leaves_a_tombstone` |
| 12 | Revoke không tới được Agent | Hội thoại chờ ACK; không attempt mới/tin kế tiếp | `new_attempt_and_next_message_wait_for_the_revoke_ack` |
| 13 | Takeover sau khi Agent đã lưu kết quả | Run `CANCELLED`; kết quả đến sau `IGNORED_STALE` | `takeover_cancels_the_run_and_ignores_its_late_result` |
| 14 | Hai tiến trình cùng chạy một attempt | Claim sau nâng epoch, tiến trình trước bị chặn | `a second claim of the same attempt fences the first process` |
| 15 | RESULT tới trước progress / progress cũ tới muộn | Kết thúc không chờ progress; không lùi trạng thái | `terminal_result_ignores_late_progress`, `lower_sequence_progress_does_not_regress` |
| 16 | Event cùng `event_id` khác nội dung / cùng sequence khác ID | `CONFLICT` | `duplicate_event_keeps_one_result`, `lower_sequence_progress_does_not_regress` |
| 17 | Kho Agent restore từ bản cũ | Thu hồi receipt `ACCEPTED`, nâng epoch trước khi nhận việc (12.2) | — (runbook Task 4) |

### 12.9 Profile HMAC (G3)

| Thành phần | Đề xuất |
| --- | --- |
| Thuật toán | HMAC-SHA-256; mỗi chiều một khóa ≥ 32 byte ngẫu nhiên (Core → Agent, Agent → Core); không dùng chung khóa |
| Header | `X-LI-Key-Id`, `X-LI-Timestamp` (Unix giây), `X-LI-Nonce` (16 byte ngẫu nhiên, base64url), `X-LI-Content-SHA256` (hex SHA-256 của body thô), `X-LI-Signature` (base64url không padding) |
| Chuỗi ký | `LI-HMAC-SHA256-v1` ⏎ `METHOD` ⏎ path + query đúng như gửi ⏎ timestamp ⏎ nonce ⏎ content SHA-256 ⏎ key id, nối bằng `\n`, UTF-8 |
| Kiểm | Tính SHA-256 trên **byte body thô trước khi parse JSON**; so sánh hằng thời gian; lệch đồng hồ ±120 giây; nonce lưu bền (`agent_request_nonces` / `agent_runtime.request_nonces`) trong 10 phút, trùng → `REPLAY_REJECTED`; body tối đa 1 MiB |
| Lỗi | 401 `AUTH_FAILED` chung cho mọi sai khác (không nói phần nào sai); 401 `REPLAY_REJECTED`; không log header chữ ký hay body |
| Gửi lại | Mỗi lần gửi lại ký lại với timestamp/nonce mới; run/attempt/event/sequence/payload giữ nguyên. Chống trùng nghiệp vụ dựa trên ID, không dựa trên chữ ký |
| Xoay khóa | Keyring theo `key_id`: một khóa ký hiện hành, khóa cũ chỉ để kiểm trong thời gian chuyển; khóa nằm trong credential volume local, ngoài Git/prompt/checkpoint/log |
| Đường truyền | Local: mạng Docker nội bộ. Ngoài local bắt buộc TLS (HMAC không mã hóa nội dung) |

**Profile đã chọn cho MVP theo code `signing.py`:** dùng profile tự đặt ở bảng trên (`LI-HMAC-SHA256-v1`), lấy cảm hứng từ [RFC 9421](https://www.rfc-editor.org/rfc/rfc9421.html) nhưng không triển khai đủ RFC đó. Hai phía chỉ cần thư viện chuẩn (`hmac`/`hashlib` của Python, `node:crypto` của Core); có test vector chung ở Task 6. Đổi profile thì tăng tên phiên bản trong chuỗi ký.

### 12.10 Endpoint, giao lại và framework (G3)

| Chiều | Endpoint | Body → ACK |
| --- | --- | --- |
| Core → Agent | `POST /internal/runs` | `RunRequest` → `DurableAck` (202 `ACCEPTED`, 200 `DUPLICATE`/`IGNORED_STALE`, 409 `CONFLICT`, 400/401 `REJECTED`) |
| Core → Agent | `POST /internal/attempts/{attempt_id}/revoke` | `AttemptRevocation` → `RevocationAck` |
| Agent → Core | `POST /api/v1/internal/agent/events` | `AgentEvent` → `DurableAck` |
| Agent → Core | Các đọc nội bộ Task 3 (history, linked-history, scope, contracts) | Ký cùng profile; quyền theo attempt hiện hành |

**Phía Agent đã có code (Task 6, viết 06/11/2026, review lại và merge 15/11/2026; chờ Core ở Task 3/6):**

- Lỗi xác thực trả 401 `{"error":{"code":"AUTH_FAILED"}}` hoặc `REPLAY_REJECTED`, không kèm `DurableAck`, vì chưa có ID đáng tin. Body đã xác thực nhưng sai schema trả 400 `DurableAck` `REJECTED`/`SCHEMA_INVALID` nếu có `run_id`/`attempt_id` hợp lệ, không thì `{"error":{"code":"SCHEMA_INVALID"}}`. Kho Agent lỗi trả 503 (không ACK, Core gửi lại). Revoke có `attempt_id` trên path khác body → 400 `REJECTED`/`SCHEMA_INVALID`; receipt thuộc run/hội thoại khác → 400 `REJECTED`/`PAYLOAD_MISMATCH` (không phải thu hồi thành công). `GET /healthz` không cần chữ ký và không trả chi tiết.
- Event nhận `REJECTED` từ Core vẫn được giữ và gửi lại theo backoff tới hạn tối đa (theo 12.4), payload không đổi; mục 4 "dừng, không tự sửa payload" được hiểu là không sửa nội dung. Hết hạn thì ghi `gave_up_at` và log sự cố; Core gửi lại `RunRequest` (`DUPLICATE`) mở lại việc giao. Migration `002_delivery.sql` thêm `gave_up_at`, `last_failure`.
- **Đọc nội bộ theo đúng đường dẫn của kế hoạch Task 3** dưới `/api/v1/internal/agent`: `GET /runs/{runId}/history`, `GET /runs/{runId}/linked-history`, `POST /runs/{runId}/scope`, `GET /runs/{runId}/contracts`, `GET /runs/{runId}/contracts/{policyNumber}` (mã hợp đồng được URL-encode). Đề xuất cho phần kế hoạch chưa định (đội application xác nhận hoặc đổi): `attemptId` đi trong query đã ký, `cursor` trong query của hai đọc lịch sử; Core phân trang theo view đã lưu cho run, không nhận view từ caller. Body scope `{attempt_id, kind, policy_number}`. Trả 200 với `ConversationHistoryPage`, `DocumentScope`, `{"contracts":[ContractSummary]}`, `ContractOverview`; lỗi `{"error":{"code":…}}` với 403 `NOT_AUTHORIZED`, 404 `NOT_FOUND`, 409 `INVALID_ATTEMPT`, 400 `INVALID_INPUT`. Agent kiểm schema mọi câu trả lời; sai dạng hoặc 5xx là `UNAVAILABLE`. Bàn giao chi tiết: [handoff cho đội application](../docs/superpowers/plans/2026-11-07-agent-core-handoff.md).
- Test vector chung [`fixtures/hmac-v1.json`](fixtures/hmac-v1.json) (khóa chỉ dùng cho test, công khai), kiểm bằng Python và `node --test apps/core/test/agent-hmac-vector.test.cjs` (chỉ `node:crypto`).

Giao lại đề xuất: backoff mũ 1 → 60 giây có jitter. Dispatch/revoke lặp tới khi có ACK hoặc tới hạn của run. Event lặp tối đa 24 giờ rồi ghi sự cố. Dữ liệu khôi phục Agent, gồm checkpoint/receipt/ledger/kết quả và event đã ACK, giữ trong MVP, chưa tự xóa theo thời gian; theo [chính sách lưu chung](../docs/configuration-and-data.md#mvp-agent-recovery-retention). Giữ dữ liệu không tự mở lại delivery đã kết thúc. Các mức 3 giây/4 request/1 retry của Business Tools không áp vào callback. URL callback lấy từ cấu hình, không từ model/tài liệu/body.

**HTTP framework phía Agent đã chọn theo code:** Starlette **1.10.0** + uvicorn **0.54.0**, pin trong `apps/agent/pyproject.toml`. Handler chỉ làm xác thực → lưu → ACK; graph chạy ở worker đọc receipt từ DB, không chạy trong background task của request.

### 12.11 DDL đề xuất

Đã chạy thử trên PostgreSQL 16 + pgvector (sau các migration Core hiện có). Phần Core là đề xuất cho Task 3 (đội application); phần Agent đã thành migration ở Task 4.

<details><summary>Core — schema <code>business</code></summary>

```sql
CREATE TYPE business."AgentRunStatus" AS ENUM ('QUEUED', 'RUNNING', 'COMPLETED', 'FAILED', 'CANCELLED');
CREATE TYPE business."AgentAttemptState" AS ENUM ('DISPATCHING', 'ACCEPTED', 'INVALIDATING', 'INVALIDATED', 'FINISHED');

CREATE TABLE business.agent_runs (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id     uuid NOT NULL REFERENCES business.conversations(id),
  message_id          uuid NOT NULL UNIQUE REFERENCES business.messages(id),
  queue_position      bigint NOT NULL,                 -- messages.sequence of the user message
  status              business."AgentRunStatus" NOT NULL DEFAULT 'QUEUED',
  current_attempt_id  uuid,
  history_view        jsonb,                           -- fixed when the run is claimed
  linked_history_view jsonb,                           -- Copilot: fixed when Core accepts the Staff question
  limits              jsonb NOT NULL,
  progress_stage      varchar(20),
  progress_sequence   integer NOT NULL DEFAULT 0,
  result              jsonb,
  failure             jsonb,
  result_message_id   uuid REFERENCES business.messages(id),
  created_at          timestamptz(3) NOT NULL DEFAULT now(),
  started_at          timestamptz(3),
  finished_at         timestamptz(3),
  UNIQUE (conversation_id, queue_position),
  CONSTRAINT agent_run_result CHECK ((status = 'COMPLETED') = (result IS NOT NULL)),
  CONSTRAINT agent_run_failure CHECK (status NOT IN ('FAILED', 'CANCELLED') OR failure IS NOT NULL)
);
CREATE UNIQUE INDEX agent_runs_one_running ON business.agent_runs (conversation_id) WHERE status = 'RUNNING';
CREATE INDEX agent_runs_queued ON business.agent_runs (conversation_id, queue_position) WHERE status = 'QUEUED';

CREATE TABLE business.agent_attempts (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id                  uuid NOT NULL REFERENCES business.agent_runs(id),
  attempt_no              integer NOT NULL CHECK (attempt_no > 0),
  state                   business."AgentAttemptState" NOT NULL DEFAULT 'DISPATCHING',
  request                 jsonb NOT NULL,              -- exact RunRequest; reconcile resends it unchanged
  request_sha256          char(64) NOT NULL,
  dispatch_count          integer NOT NULL DEFAULT 0,
  next_dispatch_at        timestamptz(3) NOT NULL DEFAULT now(),
  accepted_at             timestamptz(3),
  revocation_reason       varchar(30),
  revocation_requested_at timestamptz(3),
  revoked_at              timestamptz(3),
  revoked_epoch           bigint,
  created_at              timestamptz(3) NOT NULL DEFAULT now(),
  UNIQUE (run_id, attempt_no),
  CONSTRAINT agent_attempt_revocation CHECK (state NOT IN ('INVALIDATING', 'INVALIDATED') OR revocation_reason IS NOT NULL)
);
CREATE UNIQUE INDEX agent_attempts_one_live ON business.agent_attempts (run_id)
  WHERE state IN ('DISPATCHING', 'ACCEPTED', 'INVALIDATING');
CREATE INDEX agent_attempts_reconcile ON business.agent_attempts (next_dispatch_at)
  WHERE state IN ('DISPATCHING', 'INVALIDATING');
ALTER TABLE business.agent_runs ADD CONSTRAINT agent_runs_current_attempt_fk
  FOREIGN KEY (current_attempt_id) REFERENCES business.agent_attempts(id);

CREATE TABLE business.agent_run_events (
  event_id       uuid PRIMARY KEY,                     -- issued by the Agent
  attempt_id     uuid NOT NULL REFERENCES business.agent_attempts(id),
  run_id         uuid NOT NULL REFERENCES business.agent_runs(id),
  sequence       integer NOT NULL CHECK (sequence > 0),
  kind           varchar(10) NOT NULL CHECK (kind IN ('PROGRESS', 'RESULT', 'ERROR')),
  payload_sha256 char(64) NOT NULL,                    -- SHA-256 of the canonical event JSON
  decision       varchar(20) NOT NULL CHECK (decision IN ('ACCEPTED', 'IGNORED_STALE')),
  received_at    timestamptz(3) NOT NULL DEFAULT now(),
  UNIQUE (attempt_id, sequence)
);

CREATE TABLE business.agent_request_nonces (
  key_id      varchar(40) NOT NULL,
  nonce       varchar(32) NOT NULL,
  received_at timestamptz(3) NOT NULL DEFAULT now(),
  PRIMARY KEY (key_id, nonce)
);
```
</details>

Agent — schema `agent_runtime`: đã triển khai ở Task 4 bằng [`apps/agent/migrations/001_durable_runtime.sql`](../apps/agent/migrations/001_durable_runtime.sql) (thêm `checkpoint_blobs` và `task_path` theo cách LangGraph lưu giá trị kênh/pending writes).

### 12.12 Acceptance matrix sau khi duyệt

| Bất biến | Phép kiểm bắt buộc (DB/tiến trình thật) |
| --- | --- |
| FIFO, một `RUNNING`/hội thoại, history view gồm kết quả commit muộn | Task 3: enqueue B khi A chạy, A commit sau B; nhiều dispatcher chỉ một claim |
| Không ghi đè sau revoke | Task 4: `test_stale_process_cannot_publish_checkpoint_after_revoke_ack` với hai tiến trình |
| Budget không cấp lại sau crash | Task 4: `test_core_budget_survives_crash_after_send_before_checkpoint`, `test_token_reservations_survive_replay` |
| Không chạy lại graph khi giao lại | Task 6: `test_restart_after_lost_ack_redelivers_without_graph` (đã có phía Agent với Core double; Core thật ở Task 10) |
| HMAC | Task 6: sửa body/path/header, sai khóa, lệch giờ, nonce lặp, gửi lại nonce mới cùng ID nghiệp vụ — phía Agent có trong `apps/agent/tests/test_delivery.py`; phía Core chờ Task 3 |
| Takeover/late event | Task 6/10: takeover khi tool đang chờ; event muộn không đổi kết quả |

<a id="1213-quyết-định-g2g3-ngày-06112026"></a>

### 12.13 Phương án G2/G3 ghi nhận từ nhánh ngày 06/11/2026

Lịch sử nhánh ghi: “Người dùng giao Agent tự chọn và ghi lại ngày 06/11/2026; anh Tuấn review cùng PR.” Review hiện tại chưa xác minh nguồn xác nhận của ghi nhận này. Tổ chức module/API ở phương án 1, hành vi FAILED ở phương án 4 và profile/framework ở phương án 5 đã chọn; các phương án khác và chi tiết kỹ thuật còn lại vẫn trong gói đề xuất Task 2, review hoặc merge không tự đóng G2/G3. Xác nhận trực tiếp ngày 12/11/2026 về `PERMISSION_CHANGED` ở 12.3 là quyết định bổ sung riêng.

| # | Câu hỏi | Phương án từ nhánh, chưa duyệt | Lý do |
| --- | --- | --- | --- |
| 1 | Bảng run/attempt/event đặt ở module `conversations` hay module `agent` riêng (kèm G1 mục 11.1) | **Đã chọn cách kết hợp theo [ánh xạ API](#application-conversation-api-mapping); tích hợp còn P:** API Web ↔ Core (tạo/list/đọc hội thoại, lịch sử, gửi tin) dùng tiếp module `conversations` hiện có, thêm `currentRun` và mục `AGENT_RESULT`/`RUN_OUTCOME`. Vòng đời run/attempt/event, dispatcher/đối soát, API nội bộ cho Agent và HMAC nằm trong module mới `apps/core/src/agent/` như bản đồ file của kế hoạch. `acceptMessage` do service gửi tin của `conversations` gọi trong cùng transaction; REQUEST_HANDOFF của `ConversationHandoff` gọi fence/invalidate và hủy queued của cuộc trong cùng transaction theo [chính sách handoff](#handoff-request-agent-fence) | Không dựng API hội thoại thứ hai song song; giữ `controlVersion`, khóa hội thoại và handoff đã có. Phần tích hợp Agent tách riêng để review và thay transport/auth khi lên cloud |
| 2 | Checkpointer | **Tự viết lớp con `BaseCheckpointSaver`** trên psycopg trong schema `agent_runtime`, kiểm `(thread_id, attempt_id, writer_epoch)` trong cùng transaction với mọi đường ghi; pin `langgraph-checkpoint` 4.3.1 | `langgraph-checkpoint-postgres` tự quản bảng/migration và không cho chèn bước kiểm quyền ghi vào cùng transaction, kể cả pending writes; kế hoạch yêu cầu dừng nếu thư viện không hook được mọi đường ghi |
| 3 | Revoke không tới được Agent | **Chấp nhận khoảng hở ở 12.5**, không thêm điều kiện lease vào câu kiểm. Core chặn ngay tool/scope/history/event của attempt cũ, không giao attempt mới hay tin kế tiếp cho hội thoại tới khi có `RevocationAck`, gửi lại revoke theo backoff và để trạng thái chờ hiện cho vận hành | Lease không giải quyết trường hợp này (writer mất mạng tới Core vẫn tới được DB và gia hạn được) mà thêm heartbeat; các lần ghi muộn không thành kết quả Core và attempt kế tiếp chỉ đọc sau ACK |
| 4 | Attempt lỗi/quá hạn | **Đã chọn hành vi MVP theo [chính sách lượt lỗi](../docs/specifications/Agent_Design.md#failed-turn-policy); tích hợp Core/UI còn P. Run kết thúc `FAILED`** (takeover: `CANCELLED`), không tự tạo attempt mới. Mất ACK thì gửi lại cùng attempt | MVP đơn giản, tránh chạy lại model/tool ngoài ý người dùng; khách gửi tin mới thì có lượt mới với budget mới. Lý do `RETRY` giữ trong protocol cho thao tác chủ động sau này |
| 5 | Xác thực và framework | **Đã chọn theo code hiện có; chi tiết ở 12.9–12.10.** **Profile HMAC tự đặt `LI-HMAC-SHA256-v1`** (12.9: ±120 giây, nonce lưu 10 phút, keyring theo `key_id`); **Starlette + uvicorn** phía Agent; pin ở Task 6 là `starlette` 1.10.0 (thay 1.9.0 dự kiến, xem 12.10) / `uvicorn` 0.54.0 | Profile ngắn, kiểm được bằng thư viện chuẩn hai phía và test vector chung; RFC 9421 đầy đủ cần thư viện/canonicalization phức tạp hơn mức hai dịch vụ nội bộ cần. Starlette đủ cho vài endpoint ASGI, ít phụ thuộc hơn FastAPI (không cần Pydantic/OpenAPI vì đã kiểm bằng JSON Schema); `http.server` không dành cho production |

Còn đề xuất, chưa chốt:

- Lịch giao lại ở 12.10 (backoff 1 → 60 giây, event lặp tối đa 24 giờ). Hạn giao lại khác thời gian lưu dữ liệu; retention khôi phục MVP theo chính sách chung, thời hạn production còn mở.
- Đưa `graph_steps` vào ledger bền vững (12.6).
