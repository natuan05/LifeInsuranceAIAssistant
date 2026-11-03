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
