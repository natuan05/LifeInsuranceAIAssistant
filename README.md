# Life Insurance AI Assistant

Ứng dụng hỗ trợ bảo hiểm nhân thọ, gồm Next.js frontend, NestJS Core, PostgreSQL/pgvector, Nginx gateway, DbGate và tool quản trị tài khoản local.

Cập nhật 30/10/2026: đã có đăng nhập Customer/Staff, tài khoản/đổi mật khẩu/đăng xuất, hồ sơ theo quyền, danh sách/chi tiết khách có phân trang cho Staff và WebSocket invalidation local. Staff dùng UI mẫu React/Tailwind với routes riêng; Inbox/Policy Lookup/Ticket mới có khung. Agent/AI, policy/PDF/chat/Ticket/notification APIs và cloud chưa triển khai.

- [Hướng dẫn thiết lập và sử dụng dự án](docs/getting-started.md) — env, Docker/npm, admin, cổng, Swagger và tài khoản seed.
- [Kiến trúc và baseline local](docs/architecture.md).
- [Tài liệu UI và thứ tự đọc](docs/ui/README.md), [checklist đã làm/còn thiếu và gap](docs/ui/implementation-status.md), [menu MVP](docs/ui/menu.md).
- [Đặc tả nguồn](docs/specifications) và [đối chiếu nguồn](docs/source-review.md).
- [Quy tắc cấu hình và dữ liệu](docs/configuration-and-data.md).

Chỉ dùng dữ liệu sinh hoàn toàn giả lập. Core sở hữu danh tính, phân quyền và nghiệp vụ; Agent gọi Business API của Core.
