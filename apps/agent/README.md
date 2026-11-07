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

`pip install --group` cần pip 25.1 trở lên. Thư viện được pin trong `pyproject.toml`: `langgraph` 1.2.20, `jsonschema` 4.26.0, `pytest` 9.2.0. Checkpointer chỉ dùng `InMemorySaver` trong test; thư viện checkpointer, HTTP framework và provider model chọn ở G2–G4.
