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

Core–Agent đã chọn [HTTP + callback JSON](../../docs/specifications/Agent_Design.md#core-agent-callback) ngày 29/10/2026, [tạm chọn HMAC + Core tra quyền theo lượt](../../docs/specifications/Agent_Design.md#provisional-hmac-auth), chưa token riêng mỗi attempt hoặc dịch vụ cloud bổ sung. Đã chốt [lưu kết quả trước khi gửi/giao lại cùng sự kiện](../../docs/specifications/Agent_Design.md#durable-result-delivery); endpoint/schema, profile xác thực và cơ chế lưu/khôi phục cụ thể thuộc đặc tả thực thi. Provider/model, embedding, thư viện checkpoint và web framework chưa chọn; chưa triển khai.

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
- Budget nằm trong ledger theo tin nhắn và được trừ **trước** lời gọi ngoài. Reservation model/summary lấy số thứ tự từ ledger để crash trước checkpoint Prepare không tái dùng lượt đã tiêu; tool dùng operation ID trong graph. Lần giao lại cùng attempt đã có kết quả cuối không chạy lại model/tool.
- Token ước lượng bằng `chars_per_token` cấu hình cho tới khi có tokenizer của provider (G4). Các trần model/bước/token/finish reserve là `null` trong limits thì lượt bị từ chối, không tự đặt số.
- Lựa chọn trong câu hỏi làm rõ lấy theo thứ tự danh sách Core trả, không theo model; chỉ dùng để hiểu câu sau khi Core đã chấp nhận kết quả hỏi lại.
- Đánh giá độ đủ, điều kiện chưa kiểm tra và chủ đề do model trả kèm (`ModelReply.notes`); điều kiện không có nguồn thật trong lượt bị loại.
- Copilot giữ thread riêng, đọc chat Customer qua view Core cố định cho từng câu hỏi Staff; lỗi đồng bộ được giữ thành trạng thái nguồn.
- Contract đổi một chỗ: `HistorySummary.covers_through` là `position` của Core thay vì cursor.
- Resume Copilot kiểm lại quyền bằng Core với cùng frozen view; quyền/attempt bị từ chối thì không gửi cached history vào model. Lỗi nguồn tạm thời giữ trạng thái chưa đồng bộ, không tự mở rộng mốc.
- Repair chỉ dùng bằng chứng đã nhận, không gọi tool mới; kiểm deadline/token cap sau model và trước lưu kết quả cuối. Evidence ID được cấp theo operation và thứ tự, không cắt ID nguồn gây va chạm.

### Chạy test

Cần Python 3.13 trở lên; tạo/kích hoạt virtualenv riêng ngoài repo, rồi từ `apps/agent`:

```bash
python -m pip install -e . --group dev
python -m pytest -p no:cacheprovider
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

- Metadata `rag-chunk-v2` trong `RagKnowledgeChunk.metadata`: `kind`, `chunk_key`, `evidence_key`, `parent_key`, `section_key`, `section_parent_keys`, `heading_path`, `clause`, `pages`/`page_end`, `anchor`, `prefix`, `refs`, `issues`, `editorial_notes`, `product`, `approval`, `dataset_version`, `corpus_config_id`, `fingerprint`, `embedding`. Parent cũng là một dòng có vector (cột embedding bắt buộc) nhưng không vào nhánh tìm kiếm. Parent giữ tham chiếu của toàn đoạn; `section_parent_keys` xác định khi nào đã trả đủ mọi phần của Điều. Identity embedding gồm provider/model/version/dimensions/config/input format/normalization, không chỉ config ID.
- Catalog Public tạm: `document_id` uuid5 theo đường dẫn nguồn, `document_version` = `sha256-` + 12 ký tự checksum PDF, tiêu đề ghép tên sản phẩm. Thay bằng catalog Core ở Task 3; không phải `currentVersion`.
- Unique `(document_id, document_version, chunk_index)` chỉ cho một không gian vector mỗi tài liệu/phiên bản: so hai embedding phải index lại tuần tự hoặc đổi schema sau review.
- FTS `simple`, truy vấn OR các từ, `tsvector` tính khi truy vấn (chưa thêm migration/GIN/HNSW); 40/40 ứng viên → 20 hợp nhất → tối đa 8 bằng chứng, RRF 60 chỉ là biến thể thử có `config_id`.
- Dẫn chiếu tới Chương không được mở rộng; dòng mục lục không tính là dẫn chiếu; dẫn chiếu sang Luật/Điều Khoản Chung/Sản Phẩm Chính là chưa phân giải.
- Phát hiện khi chunk corpus, chuyển người duyệt G5: TnC Dự Phòng Xanh có tiêu đề “Điều 12” dính vào cuối đoạn 11.2 nên dẫn chiếu tới Điều 12 không tìm thấy đích; TnC Hộ Vệ Xanh không có tiêu đề Điều riêng (Điều nằm trong đoạn/bảng) nên dẫn chiếu Điều trong tài liệu đó chưa phân giải được.

### Chạy với PostgreSQL và Gemini

1. `.env` ở root: thêm `DB_RAG_INDEXER_PASSWORD` và `DB_RAG_RETRIEVER_PASSWORD` (giá trị mẫu trong `.env.example`) rồi `docker compose up -d --build --wait` để tạo hai role.
2. Dùng `.env` root theo `.env.example`: điền `GEMINI_API_KEY`, DSN indexer/retriever cho đúng DB/cổng và credential đang có. Agent tool chỉ đọc các biến `GEMINI_*`/`LIFE_AGENT_*`; biến môi trường tiến trình ưu tiên hơn file. Không tạo `.env` riêng cho Agent, không đổi credential/volumes để khớp mẫu. Nếu còn file Agent cũ, tự chuyển đúng các biến cần dùng vào root và giữ bản cũ tới khi xác minh; tool không tự sửa hoặc xóa file của thành viên. Indexer DSN chỉ cấp cho job offline. Test DB dùng hai DSN `LIFE_AGENT_TEST_RAG_*` trỏ tới DB synthetic cô lập, không chạy fixture vào dữ liệu ứng dụng đang dùng. Không đưa key/DSN có mật khẩu vào Git, chat hay log.
3. Từ `apps/agent`, sau khi cài như trên:

```bash
python -m pytest                       # DB tests chạy khi có LIFE_AGENT_TEST_RAG_*_DSN, không thì skip
python -m life_agent.corpus --manifest ../../data/public/manifest-manulife-text.json --trial evaluation/trial-config.json --index
python evaluation/evaluate.py --cases evaluation/cases.json --mode retrieval
python evaluation/evaluate.py --cases evaluation/cases.json --mode end-to-end
```

Lệnh index gọi embedding có tính phí theo cấu hình thử; chỉ chạy khi được phép cho đúng cấu hình/corpus. Schema chunk v2 và fingerprint đầy đủ làm index v1 hoặc identity khác cần được dựng lại có chủ đích; tool không tự chạy reindex hoặc gọi API để nâng dữ liệu. Chạy lại cùng dữ liệu/schema/identity sẽ bỏ qua tài liệu đã nạp.

Báo cáo mặc định ở thư mục dữ liệu người dùng `LifeInsuranceAIAssistant/agent-eval`: Windows dùng `%LOCALAPPDATA%`, macOS dùng `~/Library/Application Support`, Linux dùng `$XDG_STATE_HOME` hoặc `~/.local/state`. `--out` có thể chọn file ngoài repo; đường dẫn trong repo bị từ chối trước khi mở client/gọi model. CLI in đường dẫn tuyệt đối sau khi ghi; khi chưa chạy thì chưa tạo file báo cáo. Đây là file tool trên host, tách với credential runtime trong Docker volumes. Báo cáo gồm câu hỏi/câu trả lời Public để người chấm, không ghi prompt/nội dung chunk. Kiểm “không cam kết Claim” và “không báo Ticket đã tạo” là `NOT_RUN` tới khi có `--human-review`; không tự tuyên bố nghiệm thu đạt.

Wrapper model ghi từng attempt, kể cả lỗi; HTTP 429 trả lỗi lượt, không chờ rồi retry ngầm ngoài ngân sách. Retry model cần policy/budget/deadline riêng được review, không mượn chính sách một retry của Business Tools. Các quyết định và regression của đợt sửa được ghi tại [Public RAG review fixes](../../docs/public-rag-review-fixes.md).
