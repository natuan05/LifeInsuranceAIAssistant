# Life Insurance AI Assistant

Ứng dụng hỗ trợ bảo hiểm nhân thọ, gồm Next.js frontend, NestJS Core, PostgreSQL/pgvector, Nginx gateway, DbGate và tool quản trị tài khoản local.

Customer và Staff có tài khoản, tra cứu sản phẩm/hợp đồng/PDF, chat hai đầu và Ticket. Chức năng đã triển khai và phần còn làm được quản lý tại [tiến độ Application](docs/ui/implementation-status.md); [spec Phase 0–5](docs/application-code-alignment-spec.md) mô tả các sửa đổi Application hiện có.

Gemini API đã được chọn ngày 13/11/2026 cho model sinh và embedding của MVP. Cặp model MVP đã chốt ngày 13/11/2026 gồm Gemini 3.8 Flash (`gemini-3.8-flash`) cho model sinh và Gemini Embedding 2 (`gemini-embedding-2`), 1536 chiều. Cấu hình vận hành và nghiệm thu tiếp tục theo G4 trong [Agent Design](docs/specifications/Agent_Design.md#managed-model-api).

MVP dùng **7 sản phẩm Manulife: 4 chính và 3 bổ trợ**; xem [danh sách và phạm vi dữ liệu](docs/specifications/Agent_Design.md#mvp-products).

- [Hướng dẫn thiết lập và sử dụng dự án](docs/getting-started.md) — env, Docker, admin, cổng, Swagger và tài khoản seed.
- [Kiến trúc và baseline local](docs/architecture.md).
- [Kiến trúc Cloud và trách nhiệm thành phần](docs/specifications/Cloud_Architecture.md) — sơ đồ capability đích, đã loại Scheduled Task Execution; không phải bản kiểm kê hạ tầng đang chạy.
- [Đặc thù hệ thống và phân tích tải](docs/specifications/Workload_Analysis.md) — giả định P1–P3, phép tính capacity, nút thắt mở rộng và chi phí model.
- [Bản tổng thể Agent/RAG](docs/specifications/Agent_Design.md#design-overview) — các quyết định đã thống nhất; phân biệt đặc tả thực thi và lựa chọn còn mở.
- [Tài liệu UI và thứ tự đọc](docs/ui/README.md), [checklist đã làm/còn thiếu và gap](docs/ui/implementation-status.md), [menu MVP](docs/ui/menu.md).
- [Đặc tả nguồn](docs/specifications) và [đối chiếu nguồn](docs/source-review.md).
- [Quy tắc cấu hình và dữ liệu](docs/configuration-and-data.md).

Mặc định chỉ dùng dữ liệu sinh hoàn toàn giả lập; ngoại lệ được phép lưu Git là [hợp đồng đã khử định danh có dữ liệu demo](data/private/manulife-demo-full-v1/README.md), chưa được duyệt cho RAG. Core sở hữu danh tính, phân quyền và nghiệp vụ; Agent gọi Business API của Core.

Chạy local bằng `docker compose up -d --build --wait` qua gateway. Cấu hình dùng `.env` root từ `.env.example`; runtime credentials và dữ liệu lưu trong Docker volumes. Tool host dùng thư mục dữ liệu người dùng ngoài repo. Cài đặt, tài khoản và vận hành tại [Getting Started](docs/getting-started.md).
