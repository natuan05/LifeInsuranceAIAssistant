# Agent

Nơi phát triển Python + custom LangGraph, chạy local trước; hướng triển khai AgentCore Runtime.

[Agentic RAG](../../docs/specifications/Agent_Design.md#rag-terminology) chỉ toàn bộ luồng có Agent; hai tool truy xuất Public/Private trả bằng chứng, code dựng context, LLM trong node Agent viết câu trả lời. Tên gọi này thay cách gọi tắt “tool RAG” để tránh nhầm phạm vi.

Xem [bản tổng thể Agent/RAG](../../docs/specifications/Agent_Design.md#design-overview) — điểm bắt đầu trong tài liệu chuẩn thay thế AI Agent Module, Orchestrator và RAG trên Google Docs. [Phần còn lại](../../docs/specifications/Agent_Design.md#remaining-work) tách quyết định cần chọn, đặc tả thực thi và tham số cần đo; README này chỉ tóm tắt ranh giới.

Quyết định ngày 27/10/2026: dùng custom LangGraph cho điều phối Agent; loại AgentCore Harness khỏi phương án triển khai. Nhóm tự thiết kế graph, state, checkpoint, giới hạn vòng lặp và xử lý lỗi. AgentCore Runtime chỉ giữ vai trò hướng hosting cho code Agent tự xây dựng.

- Điều phối truy xuất Public/Private, Business Tools, hỏi làm rõ và đề xuất chuyển Staff.
- Business Tools chỉ gọi Core API; không đọc hoặc ghi bảng business.
- Retrieval chỉ đọc tập tài liệu và phiên bản được Core cấp quyền; Public/Private có thể dùng chung engine.
- Lưu trạng thái workflow bền vững. Checkpoint cần quyền ghi riêng, không mở quyền ghi business hay RAG index.
- Quyết định ngày 29/10/2026: checkpoint dùng PostgreSQL hiện có với schema/tài khoản riêng, chuẩn bị đường tách database; xem [thiết kế checkpoint](../../docs/specifications/Agent_Design.md#checkpoint-postgres). Chưa triển khai.
- Phân biệt trạng thái graph với lịch sử hội thoại do Core quản lý; không coi checkpoint là bằng chứng xác nhận Ticket.
- Nội dung tài liệu và tool output là dữ liệu, không được thay đổi quyền hay chỉ dẫn hệ thống.

Core–Agent đã chọn [HTTP + callback JSON](../../docs/specifications/Agent_Design.md#core-agent-callback) ngày 29/10/2026, [tạm chọn HMAC + Core tra quyền theo lượt](../../docs/specifications/Agent_Design.md#provisional-hmac-auth), chưa token riêng mỗi attempt hoặc dịch vụ cloud bổ sung. Đã chốt [lưu kết quả trước khi gửi/giao lại cùng sự kiện](../../docs/specifications/Agent_Design.md#durable-result-delivery); endpoint/schema, profile xác thực và cơ chế lưu/khôi phục cụ thể thuộc đặc tả thực thi. Provider/model và embedding chưa chọn (mốc 3 chỉ là cấu hình thử). Ngày 06/11/2026 chọn checkpointer tự viết trên `BaseCheckpointSaver` có kiểm quyền ghi, profile HMAC `LI-HMAC-SHA256-v1` và Starlette + uvicorn ([contracts mục 12.13](../../contracts/agent-v1.md#1213-quyết-định-g2g3-ngày-06112026)); chưa triển khai.

Panel Copilot ở Web chỉ là khung chưa kết nối. Native WebSocket Core hiện có không phải Core–Agent transport/checkpoint hoặc chat stream. Công việc phụ thuộc và điều kiện đóng ở [G02–G07/checklist UI](../../docs/ui/implementation-status.md); không coi UI panel là triển khai Agent.

## Trạng thái: mốc 2 — graph chạy với fake model/tool

Phần Task 5 của [kế hoạch Agent/RAG](../../docs/superpowers/plans/2026-10-31-agent-rag-implementation.md) chạy được với model, Core, retrieval và store giả lập, theo [contracts agent-v1](../../contracts/agent-v1.md). Chưa có model thật, HTTP/HMAC, checkpoint PostgreSQL, retrieval thật hay tích hợp Core; mọi kiểm tra ở đây là điều phối/giới hạn/provenance, không chứng minh quyền thật, độ bền hoặc chất lượng ngữ nghĩa.

| Module (`src/life_agent/`) | Nội dung |
| --- | --- |
| `graph.py` | Bốn node Prepare → Agent → Execute tools → Agent/Finalize; một tool mỗi vòng; finish reserve; Finalize kiểm trích dẫn/action/source ref, sửa tối đa một lần; `AgentRunner` nhận `RunRequest`, trả `AgentEvent` đã lưu |
| `core_client.py` | Cổng Core nội bộ (lịch sử, lịch sử liên kết, scope, hai đọc hợp đồng) và adapter Business Tools: 4 request/tin gồm retry, timeout `min(3 s, deadline còn lại)`, tối đa 1 retry khi lỗi tạm thời |
| `context.py` | Dựng context năm nhóm cho từng lần gọi model và thu gọn theo thứ tự đã chốt |
| `prompts.py` | System prompt theo kênh, giữ nguyên văn sáu quy tắc dữ liệu nhạy cảm; `prompt_version` đổi khi chỉ dẫn/tool đổi |
| `contracts.py` | Kiểm dữ liệu bằng chính `contracts/agent-v1.schema.json` |
| `config.py`, `state.py`, `store.py`, `model.py` | Limits/config không có giá trị mặc định ẩn; ba nhóm state; giao diện ledger/kết quả cuối (bản bền vững ở Task 4); giao diện model/embedding (bản thật ở Task 9) |

Cách làm đã chọn ở mốc này, cần review cùng PR:

- `ExecutionContext` tin cậy đi qua runtime context của LangGraph, không nằm trong state/checkpoint và không vào context model; `thread_id = conv:<conversation_id>`.
- Budget nằm trong ledger theo tin nhắn và được trừ **trước** lời gọi ngoài; mã thao tác gắn số bước graph nên chạy lại sau crash không được cấp lại phần đã trừ. Lần giao lại một tin đã có kết quả cuối không chạy lại graph.
- Token ước lượng bằng `chars_per_token` cấu hình cho tới khi có tokenizer của provider (G4). Các trần model/bước/token/finish reserve là `null` trong limits thì lượt bị từ chối, không tự đặt số.
- Lựa chọn trong câu hỏi làm rõ lấy theo thứ tự danh sách Core trả, không theo model; chỉ dùng để hiểu câu sau khi Core đã chấp nhận kết quả hỏi lại.
- Đánh giá độ đủ, điều kiện chưa kiểm tra và chủ đề do model trả kèm (`ModelReply.notes`); điều kiện không có nguồn thật trong lượt bị loại.
- Copilot giữ thread riêng, đọc chat Customer qua view Core cố định cho từng câu hỏi Staff; lỗi đồng bộ được giữ thành trạng thái nguồn.
- Contract đổi một chỗ: `HistorySummary.covers_through` là `position` của Core thay vì cursor.

### Chạy test

Cần Python 3.13 trở lên. Từ `apps/agent`:

```bash
python -m venv .venv
# Windows: .venv\Scripts\activate   Linux/macOS: source .venv/bin/activate
python -m pip install -e . --group dev
python -m pytest
```

`pip install --group` cần pip 25.1 trở lên. Thư viện được pin trong `pyproject.toml`: `langgraph` 1.2.20, `jsonschema` 4.26.0, `psycopg[binary]` 3.3.6, `pytest` 9.2.0. Checkpointer chỉ dùng `InMemorySaver`; thư viện checkpointer và HTTP framework chọn ở G2–G3.

## Trạng thái: mốc 3 — Public RAG thử nghiệm

Phần Public của Tasks 7–9: tài liệu → chunk → embedding → hybrid search → câu trả lời có nguồn → báo cáo chất lượng. **Corpus Public vẫn `ai_checked/needs_human_review` (G5 chưa duyệt)**; người dùng cho phép dùng để thử ngày 05/11/2026, mọi chunk ghi trạng thái duyệt và UL049 trang 29 mang cảnh báo nguồn. Cấu hình Gemini trong [`evaluation/trial-config.json`](evaluation/trial-config.json) là cấu hình **thử** theo G4, không phải mặc định hay model được chọn. Private, Copilot, Core thật, checkpoint bền vững và HTTP chưa làm ở mốc này.

| Thành phần | Nội dung |
| --- | --- |
| `corpus.py` | Inventory 13 PDF/243 trang/7 sản phẩm và checksum; NFC, anchor trang, bỏ dòng lặp đầu/cuối trang, tách ghi chú hiệu đính; parent theo Điều/Phụ lục/mục, child theo khối không cắt câu, bảng tách lặp header; prefix metadata tách khỏi nội dung gốc; dẫn chiếu Điều/Phụ lục phân giải trong cùng tài liệu/phiên bản; ghi index một transaction/tài liệu–phiên bản, chống nạp trùng bằng fingerprint |
| `retrieval.py` | PostgreSQL FTS + pgvector + RRF trong đúng cặp document/version Core cấp ở mọi câu lệnh; mở rộng parent và một bước dẫn chiếu có cap; năm trạng thái, `degraded` khi embedding lỗi, lỗi keyword/DB là `ERROR`; kiểm model/version/số chiều trước khi so vector |
| `model.py` | Adapter Gemini qua REST (thư viện chuẩn, không SDK): embedding theo định dạng từng model, sinh quyết định JSON theo schema, đếm token input/output/thinking; lỗi chỉ trả mã đã lọc, key chỉ đi trong header |
| `evaluation/` | `cases.json` (43 ca Public/ngoài phạm vi/tấn công/lỗi nguồn), `evaluate.py` hai chế độ `retrieval`/`end-to-end`; `mandatory_checks` PASS/FAIL/NOT_RUN tách `quality_metrics` (Recall@k, nDCG@k, MRR, trích dẫn, latency, token, chi phí) |

Quyền DB: thêm role `rag_indexer` (SELECT/INSERT/DELETE `rag`, chỉ dùng offline) và `rag_retriever` (chỉ SELECT `rag`) qua bootstrap/compose; cả hai không có quyền `business`.

Đề xuất cần review cùng PR (chưa phải quyết định):

- Metadata `rag-chunk-v1` trong `RagKnowledgeChunk.metadata`: `kind`, `chunk_key`, `evidence_key`, `parent_key`, `section_key`, `heading_path`, `clause`, `pages`/`page_end`, `anchor`, `prefix`, `refs`, `issues`, `editorial_notes`, `product`, `approval`, `dataset_version`, `corpus_config_id`, `fingerprint`, `embedding`. Parent cũng là một dòng có vector (cột embedding bắt buộc) nhưng không vào nhánh tìm kiếm.
- Catalog Public tạm: `document_id` uuid5 theo đường dẫn nguồn, `document_version` = `sha256-` + 12 ký tự checksum PDF, tiêu đề ghép tên sản phẩm. Thay bằng catalog Core ở Task 3; không phải `currentVersion`.
- Unique `(document_id, document_version, chunk_index)` chỉ cho một không gian vector mỗi tài liệu/phiên bản: so hai embedding phải index lại tuần tự hoặc đổi schema sau review.
- FTS `simple`, truy vấn OR các từ, `tsvector` tính khi truy vấn (chưa thêm migration/GIN/HNSW); 40/40 ứng viên → 20 hợp nhất → tối đa 8 bằng chứng, RRF 60 chỉ là biến thể thử có `config_id`.
- Dẫn chiếu tới Chương không được mở rộng; dòng mục lục không tính là dẫn chiếu; dẫn chiếu sang Luật/Điều Khoản Chung/Sản Phẩm Chính là chưa phân giải.
- Phát hiện khi chunk corpus, chuyển người duyệt G5: TnC Dự Phòng Xanh có tiêu đề “Điều 12” dính vào cuối đoạn 11.2 nên dẫn chiếu tới Điều 12 không tìm thấy đích; TnC Hộ Vệ Xanh không có tiêu đề Điều riêng (Điều nằm trong đoạn/bảng) nên dẫn chiếu Điều trong tài liệu đó chưa phân giải được.

### Chạy với PostgreSQL và Gemini

1. `.env` ở root: thêm `DB_RAG_INDEXER_PASSWORD` và `DB_RAG_RETRIEVER_PASSWORD` (giá trị mẫu trong `.env.example`) rồi `docker compose up -d --build --wait` để tạo hai role.
2. Copy `apps/agent/.env.example` thành `apps/agent/.env` (bị Git ignore), điền `GEMINI_API_KEY`. Không đưa key vào Git, chat hay log.
3. Từ `apps/agent`, sau khi cài như trên:

```bash
python -m pytest                       # DB tests chạy khi có LIFE_AGENT_TEST_RAG_*_DSN, không thì skip
python -m life_agent.corpus --manifest ../../data/public/manifest-manulife-text.json --trial evaluation/trial-config.json --index
python evaluation/evaluate.py --cases evaluation/cases.json --mode retrieval
python evaluation/evaluate.py --cases evaluation/cases.json --mode end-to-end
```

Lệnh index gọi embedding có tính phí theo cấu hình thử; chạy lại cùng dữ liệu/cấu hình sẽ bỏ qua tài liệu đã nạp. Báo cáo ghi vào `.local/agent-eval/` (ignored), gồm câu hỏi/câu trả lời Public để người chấm, không ghi prompt hay nội dung chunk. Kiểm “không cam kết Claim” và “không báo Ticket đã tạo” là `NOT_RUN` cho tới khi người chấm điền file `--human-review`; báo cáo không tự tuyên bố đạt nghiệm thu.

## Trạng thái: mốc 4 — Task 4, lưu bền phía Agent

Triển khai phần Agent của [gói G2/G3](../../contracts/agent-v1.md#12-protocol-bền-vững-và-tích-hợp--gói-đề-xuất-g2g3-task-2) theo các quyết định ngày 06/11/2026. Chưa có HTTP/HMAC (Task 6), API Core (Task 3, đội application) hay worker nhận việc chạy nền. Vì vậy mới kiểm bằng gọi trực tiếp store và graph, chưa qua Core thật.

| Thành phần (`store.py`, `migrations/`) | Nội dung |
| --- | --- |
| `PgRuntimeStore` | `accept_run` (receipt theo attempt, `DUPLICATE`/`CONFLICT`/`IGNORED_STALE`), `revoke` (tombstone cho attempt chưa tới), `claim_execution` (lease, mỗi claim nâng epoch), ledger `open_message`/`reserve`/`settle`, `persist_final`/`persist_progress`, `pending_events`/`ack_event`, `recoverable`, `fence_after_restore` |
| `FencedPostgresSaver` | Checkpointer LangGraph; `put`, `put_writes`, `delete_thread` kiểm `(thread_id, attempt_id, writer_epoch)` `FOR SHARE` trong cùng transaction. Graph chạy `durability="sync"` |
| `LeasedStore`, `execute_attempt` | Store của graph gắn lease; receipt `FINALIZED` trả lại event đã lưu, không chạy graph |
| `migrations/001_durable_runtime.sql`, `python -m life_agent.store migrate` | Bảng trong schema `agent_runtime` (do bootstrap tạo, chủ là `agent_migrator`); runner ghi `schema_migrations` và từ chối file đã áp bị sửa |

`StaleWriter` là `BaseException` để không bị các khối `except Exception` trong graph/adapter nuốt mất rồi tiếp tục gửi request hoặc ghi. Role `agent_runtime` chỉ có DML trên `agent_runtime`; role Core không có quyền trên schema này.

### Chạy

1. `.env` root: thêm `DB_AGENT_MIGRATOR_PASSWORD`, `DB_AGENT_RUNTIME_PASSWORD` (giá trị mẫu ở `.env.example`) rồi `docker compose up -d --build --wait`.
2. `apps/agent/.env`: điền `LIFE_AGENT_STORE_MIGRATOR_DSN`, `LIFE_AGENT_STORE_DSN` và các DSN test theo `.env.example`. Test tách DB cần `LIFE_AGENT_TEST_ADMIN_DSN` (role `local_owner`).
3. Từ `apps/agent`: `python -m life_agent.store migrate`, rồi `python -m pytest tests/test_store.py`.

### Runbook tách `agent_runtime` sang PostgreSQL riêng (bảo trì)

1. Dựng DB đích: tạo role, `CREATE SCHEMA agent_runtime AUTHORIZATION agent_migrator`, cấp quyền như `bootstrap-database.mjs`, chạy `migrate` tới cùng version với nguồn.
2. Dừng nhận việc: Core ngừng dispatch; chờ các lượt đang chạy kết thúc hoặc revoke chúng; xác nhận không còn event chưa ACK.
3. Dừng ghi: tắt tiến trình Agent.
4. Sao chép: `copy_runtime_data(nguồn, đích)` (COPY từng bảng theo thứ tự FK, kiểm cùng version migration). Có thể dùng `pg_dump --schema=agent_runtime` nếu có công cụ.
5. Kiểm: số dòng từng bảng; đọc lại một thread mẫu bằng checkpointer; event cuối của một attempt mẫu giống nguồn.
6. Trên đích chạy `fence_after_restore()`: thu hồi receipt `ACCEPTED` và nâng epoch, để writer trước khi tách không ghi được nữa.
7. Đổi `LIFE_AGENT_STORE_DSN` sang đích, mở lại nhận việc.

Rollback: nếu đích **chưa nhận ghi**, chỉ cần trỏ lại nguồn (nguồn còn nguyên). Nếu đích **đã nhận ghi**, phải chép các dòng mới của đích về nguồn (hoặc giữ đích) rồi chạy `fence_after_restore()` trên bên dùng tiếp. Không chạy hai bên song song, không dual-write/CDC.

## Trạng thái: mốc 5 — Private và Copilot (thử nghiệm)

Phần Private/Copilot của Tasks 5, 7–9 trên **hợp đồng hoàn toàn synthetic** [`manulife-demo-v1`](../../data/synthetic/manulife-demo-v1/README.md). Quyết định G5 ngày 06/11/2026 (người dùng chọn):

- Chỉ bộ synthetic được chunk, embed và gửi provider. Bản đầy đủ đã khử định danh [`manulife-demo-full-v1`](../../data/private/manulife-demo-full-v1/README.md) (`synthetic=false`) không được chuẩn bị/index; `prepare_private_fixture` từ chối dữ liệu không synthetic hoặc lệch checksum manifest.
- Hai quyền lợi `DEMO-TITAN` giữ **chưa ánh xạ** sang sản phẩm bổ trợ thương mại; không sửa fixture. Core double trả hai mục theo nhãn fixture với `riders_complete=false`, nên Agent không được kết luận “không tham gia” một bổ trợ khác.
- Chưa có quyết định nguồn cho UL049 trang 29: giữ cảnh báo nguồn như mốc 3. Corpus Public vẫn chưa được người duyệt.

| Thành phần | Nội dung |
| --- | --- |
| `corpus.py` | `prepare_private_fixture`: `PRIVATE_POLICY`, `document_type=CONTRACT`, `policy_id`/`owner_customer_id` từ `contract.json` chỉ để kiểm chéo (quyền vẫn do Core cấp), vị trí là anchor `syn-*` không tạo trang PDF. Writer ghi `policy_id`/`owner_customer_id`, từ chối Private thiếu metadata chủ sở hữu hoặc Public có metadata đó; fingerprint Private gồm chủ sở hữu. CLI `--private-fixture` |
| `evaluation/evaluate.py` | `LocalCore` mô phỏng quyền dự kiến của fixture (khách sở hữu và Staff được phân công; khách/Staff khác bị từ chối, không phân biệt “không có” với “không được xem”), lịch sử hội thoại và chat liên kết theo view đã chốt. Không chứng minh quyền Core (Task 3/10). Ca `multi_turn` chạy thật từng lượt trước rồi lưu như lịch sử Core đã nhận; ca `copilot` đọc chat Customer synthetic cắt tại `linked_through` |
| `evaluation/cases.json` | 84 ca: 43 Public, 21 Private (15 từ `expected-answers.json`), 8 kết hợp Private + Public Hành Trình Hạnh Phúc, 6 nhiều lượt, 6 Copilot. Đích Private khớp đúng anchor |

Kiểm bắt buộc thêm: `cross_access_denied` (không bằng chứng/trích dẫn Private của hợp đồng actor không được đọc ở mọi lượt; chế độ retrieval còn đòi trạng thái `DENIED`) và `linked_view_frozen` (mọi lần đọc chat liên kết dùng đúng view của lượt, tin commit sau mốc không vào câu trả lời). `review_checks` tách riêng, không đổi `mandatory_status`: Copilot không kèm action (code kiểm), còn lại — không soạn nháp, phạm vi gần/từ đầu, rider chưa ánh xạ, không hỏi sức khỏe, không lấy giá trị tài khoản thay giá trị hoàn lại… — là `NOT_RUN` tới khi người chấm điền `--human-review`. Lượt có nhiều lần retrieval được chấm trên thứ hạng xen kẽ giữa các lần gọi.

Báo cáo mặc định không ghi câu hỏi/câu trả lời/query của ca không phải Public. `--include-synthetic-private-text` cho phép ghi để người chấm, chỉ với ca dùng dữ liệu synthetic; nội dung chunk không bao giờ được ghi.

### Chạy

Từ `apps/agent`, sau phần chạy của mốc 3 (cùng `trial-config.json`, đã có `private_fixture`):

```bash
python -m life_agent.corpus --manifest ../../data/public/manifest-manulife-text.json --trial evaluation/trial-config.json --private-fixture ../../data/synthetic/manulife-demo-v1 --index
python evaluation/evaluate.py --cases evaluation/cases.json --mode retrieval --kind private mixed
python evaluation/evaluate.py --cases evaluation/cases.json --mode end-to-end --kind private mixed multi_turn copilot --include-synthetic-private-text
```

Tài liệu Public đã nạp ở mốc 3 được bỏ qua nhờ fingerprint; chỉ hợp đồng synthetic gọi embedding mới. `--kind public` giữ phép đo mốc 3 để so sánh.

## Trạng thái: Task 6 phía Agent — HTTP/HMAC và giao lại kết quả

Người dùng chọn ngày 06/11/2026 làm phần Agent của Task 6 trước, vì GitHub chưa có API Core của Task 3. Phần Core của Task 6 (`apps/core/src/agent/…`, `npm run test:agent-delivery`) và E2E Task 10 chờ Task 3; việc của đội application ở [handoff](../../docs/superpowers/plans/2026-11-07-agent-core-handoff.md). Core trong test là double; không chứng minh transaction, quyền hay HMAC của Core.

| Thành phần | Nội dung |
| --- | --- |
| `signing.py` | Profile `LI-HMAC-SHA256-v1` bằng thư viện chuẩn: ký/kiểm trên byte body thô, ±120 giây, nonce bền 10 phút (`request_nonces`, chỉ ghi sau khi chữ ký đúng), body ≤ 1 MiB, keyring theo `key_id` để xoay khóa; lỗi chỉ trả `AUTH_FAILED`/`REPLAY_REJECTED` |
| `http.py` | `AgentService` (xác thực → lưu receipt/revoke → ACK; graph không chạy trong request), app Starlette, `deliver_pending` (gửi nguyên event đã lưu, ký lại mỗi lần, backoff, bỏ cuộc sau hạn tối đa), `Worker` (chạy receipt `ACCEPTED` đọc từ DB, cũng là đường phục hồi sau restart), `serve` |
| `core_client.HttpCoreClient` | Đọc Core có ký theo đường dẫn nội bộ của kế hoạch Task 3 (`/api/v1/internal/agent/runs/{runId}/…`), luôn kèm `attemptId`; phần query/body chưa có trong kế hoạch là đề xuất ([contracts 12.10](../../contracts/agent-v1.md#1210-endpoint-giao-lại-và-framework-g3)) |
| `migrations/002_delivery.sql` | `gave_up_at`, `last_failure` cho `outbound_events`; index nonce theo thời gian |

Lịch gửi lại (1 → 60 giây, jitter 0,2, bỏ cuộc sau 24 giờ) và hạn lưu vẫn là đề xuất của 12.10, đặt qua `.env`. Lease không gia hạn trong lúc chạy nên `LIFE_AGENT_LEASE_S` phải lớn hơn deadline Core gửi. Pin `starlette` 1.10.0 (thay 1.9.0 dự kiến) và `uvicorn` 0.54.0.

### Chạy

1. Cài lại từ `apps/agent` để có Starlette/uvicorn, rồi `python -m life_agent.store migrate` (áp `002_delivery`).
2. `apps/agent/.env`: thêm các biến của khối "Agent HTTP service" trong `.env.example`. Hai keyring (Core → Agent, Agent → Core) mỗi khóa ≥ 32 byte ngẫu nhiên, cùng giá trị phía Core; không đưa vào Git/chat/log.
3. `python -m pytest tests/test_delivery.py` (ca DB cần `LIFE_AGENT_TEST_STORE_DSN`), `node --test ../core/test/agent-hmac-vector.test.cjs`.
4. `python -m life_agent.http serve` khi Core đã có endpoint của Task 3; trước đó service vẫn nhận việc, nhưng đọc Core và gửi kết quả sẽ thử lại theo lịch.

