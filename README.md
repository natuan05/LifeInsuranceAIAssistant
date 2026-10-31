# Life Insurance AI Assistant

Ứng dụng hỗ trợ bảo hiểm nhân thọ, gồm Next.js frontend, NestJS Core, PostgreSQL/pgvector, Nginx gateway, DbGate và tool quản trị tài khoản local.

Cập nhật 31/10/2026: đã có đăng nhập Customer/Staff, tài khoản/đổi mật khẩu/đăng xuất, hồ sơ theo quyền, danh sách/chi tiết khách có phân trang cho Staff và WebSocket invalidation local. Staff có ba API đọc danh sách/chi tiết hợp đồng và catalog tài liệu; FE list/detail/catalog Policy đã nối. Staff đã có xem/tải PDF; Agent/AI, Customer PDF, chat/Ticket/notification APIs và cloud chưa triển khai.

- [Hướng dẫn thiết lập và sử dụng dự án](docs/getting-started.md) — env, Docker, admin, cổng, Swagger và tài khoản seed.
- [Kiến trúc và baseline local](docs/architecture.md).
- [Tài liệu UI và thứ tự đọc](docs/ui/README.md), [checklist đã làm/còn thiếu và gap](docs/ui/implementation-status.md), [menu MVP](docs/ui/menu.md).
- [Đặc tả nguồn](docs/specifications) và [đối chiếu nguồn](docs/source-review.md).
- [Quy tắc cấu hình và dữ liệu](docs/configuration-and-data.md).

Chỉ dùng dữ liệu sinh hoàn toàn giả lập. Core sở hữu danh tính, phân quyền và nghiệp vụ; Agent gọi Business API của Core.

Bổ sung 31/10: đã có MinIO private local trong Docker, credential đọc/ghi tách quyền và dữ liệu bền vững. Chạy riêng bằng `npm run storage:up`, kiểm bằng `npm run storage:check`; xem [hướng dẫn storage](docs/getting-started.md#35-storage-minio-local). Staff policy/catalog API đã có; Staff đã có cấp URL PDF và viewer trình duyệt.

FE/BE local chỉ chạy Docker: `docker compose up -d --build --wait`. Core chờ seed DB và khởi tạo storage thành công. Credential runtime ở volumes; tool host lưu file riêng ngoài repo, không cần tạo `.local` để chạy stack. Xem [Getting Started](docs/getting-started.md).

Cấu hình dùng một `.env` root, tạo từ `.env.example`: Compose đọc rồi truyền đúng biến cho từng service/build Web. Có thể đặt credential khởi tạo trong `.env` riêng; giá trị phải khớp volumes đã có, không tự đổi mật khẩu. PowerShell `scripts/start-local.ps1` tự tạo file mẫu nếu thiếu và in URL/đường dẫn sau khi dựng xong.

Staff đã có API list hợp đồng của khách, detail hợp đồng và catalog metadata tài liệu đúng phiên bản, kiểm session/assignment mỗi request. [Contract và kiểm thử](docs/ui/staff/policies.md). FE Staff đã nối cả signed URL xem/tải PDF; bootstrap chung đã có 2 sản phẩm, 14 hợp đồng và 20 PDF/version synthetic; fixture riêng có sẵn được giữ nguyên.
