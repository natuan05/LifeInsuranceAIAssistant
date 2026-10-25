# Life Insurance AI Assistant

Ứng dụng hỗ trợ bảo hiểm nhân thọ, gồm Next.js frontend, NestJS Core, PostgreSQL/pgvector, Nginx gateway, DbGate và tool quản trị tài khoản local.

Đã có đăng nhập Customer/Staff bằng email, đổi mật khẩu, hồ sơ và phân công khách hàng. Agent/AI, nghiệp vụ hợp đồng/Ticket và triển khai cloud chưa hoàn tất.

- [Hướng dẫn thiết lập và sử dụng dự án](docs/getting-started.md) — env, Docker/npm, admin, cổng, Swagger và tài khoản seed.
- [Kiến trúc và baseline local](docs/architecture.md).
- [Đặc tả nguồn](docs/specifications) và [đối chiếu nguồn](docs/source-review.md).
- [Quy tắc cấu hình và dữ liệu](docs/configuration-and-data.md).

Chỉ dùng dữ liệu sinh hoàn toàn giả lập. Core sở hữu danh tính, phân quyền và nghiệp vụ; Agent gọi Business API của Core.
