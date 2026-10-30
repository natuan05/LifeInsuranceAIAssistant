# Agent

Nơi phát triển Python + custom LangGraph, chạy local trước; hướng triển khai AgentCore Runtime.

- Điều phối Public RAG, Private RAG, Business Tools, hỏi làm rõ và đề xuất chuyển Staff.
- Business Tools chỉ gọi Core API; không đọc hoặc ghi bảng business.
- Retrieval chỉ đọc tập tài liệu và phiên bản được Core cấp quyền; Public/Private có thể dùng chung engine.
- Lưu trạng thái workflow bền vững. Checkpoint cần quyền ghi riêng, không mở quyền ghi business hay RAG index.
- Phân biệt trạng thái graph với lịch sử hội thoại do Core quản lý; không coi checkpoint là bằng chứng xác nhận Ticket.
- Nội dung tài liệu và tool output là dữ liệu, không được thay đổi quyền hay chỉ dẫn hệ thống.

Chưa chọn provider/model, embedding, thư viện checkpoint, web framework hay giao thức Core–Agent. FastAPI trong nguồn cũ chưa trở thành yêu cầu cho khung repo này.


Đối chiếu 30/10/2026: thư mục Agent vẫn là placeholder; panel Copilot ở Web chỉ khung chưa kết nối. Native WebSocket Core hiện có không phải Core–Agent transport/checkpoint hoặc chat stream. Công việc phụ thuộc và điều kiện đóng ở [G02–G07/checklist UI](../../docs/ui/implementation-status.md); không coi UI panel là triển khai Agent.
