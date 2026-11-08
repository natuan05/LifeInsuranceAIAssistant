# Life Insurance AI Assistant

Ứng dụng hỗ trợ bảo hiểm nhân thọ, gồm Next.js frontend, NestJS Core, PostgreSQL/pgvector, Nginx gateway, DbGate và tool quản trị tài khoản local.

Cập nhật 04/11/2026: Staff đã có tài khoản/hồ sơ, Customers search/phân trang, Policy Lookup/PDF, Products/PDF và Inbox I01–I06 với Direct/consent/Accept/chat hai đầu/realtime/handoff notifications. Customer có login/profile readonly/chat tối thiểu; UI mới còn kế hoạch. TK01 nền và TK02 Staff Ticket read API đã có; TK03 Accept Ticket đã có; TK04 UI Tickets list→detail/status dropdown đã nối, hỗ trợ resolve/close/reopen; TK05 notification/realtime Ticket đã có; nguồn tạo Ticket từ Agent còn I07. Xem [Staff plans](docs/ui/staff/plans/README.md), [Customer plans](docs/ui/customer/plans/README.md), [tiến độ](docs/ui/implementation-status.md).

MVP dùng **7 sản phẩm Manulife: 4 chính và 3 bổ trợ**; xem [danh sách và phạm vi dữ liệu](docs/specifications/Agent_Design.md#mvp-products).

- [Hướng dẫn thiết lập và sử dụng dự án](docs/getting-started.md) — env, Docker, admin, cổng, Swagger và tài khoản seed.
- [Kiến trúc và baseline local](docs/architecture.md).
- [Bản tổng thể Agent/RAG](docs/specifications/Agent_Design.md#design-overview) — các quyết định đã thống nhất; phân biệt đặc tả thực thi và lựa chọn còn mở.
- [Tài liệu UI và thứ tự đọc](docs/ui/README.md), [checklist đã làm/còn thiếu và gap](docs/ui/implementation-status.md), [menu MVP](docs/ui/menu.md).
- [Đặc tả nguồn](docs/specifications) và [đối chiếu nguồn](docs/source-review.md).
- [Quy tắc cấu hình và dữ liệu](docs/configuration-and-data.md).

Mặc định chỉ dùng dữ liệu sinh hoàn toàn giả lập; ngoại lệ được phép lưu Git là [hợp đồng đã khử định danh có dữ liệu demo](data/private/manulife-demo-full-v1/README.md), chưa được duyệt cho RAG. Core sở hữu danh tính, phân quyền và nghiệp vụ; Agent gọi Business API của Core.

Bổ sung 31/10: đã có MinIO private local trong Docker, credential đọc/ghi tách quyền và dữ liệu bền vững. Chạy riêng bằng `npm run storage:up`, kiểm bằng `npm run storage:check`; xem [hướng dẫn storage](docs/getting-started.md#35-storage-minio-local). Staff policy/catalog API đã có; Staff đã có cấp URL PDF và viewer trình duyệt.

FE/BE local chỉ chạy Docker: `docker compose up -d --build --wait`. Core chờ seed DB và khởi tạo storage thành công. Credential runtime ở volumes; tool host lưu file riêng ngoài repo, không cần tạo `.local` để chạy stack. Xem [Getting Started](docs/getting-started.md).

Cấu hình dùng một `.env` root, tạo từ `.env.example`: Compose đọc rồi truyền đúng biến cho từng service/build Web. Có thể đặt credential khởi tạo trong `.env` riêng; giá trị phải khớp volumes đã có, không tự đổi mật khẩu. PowerShell `scripts/start-local.ps1` tự tạo file mẫu nếu thiếu và in URL/đường dẫn sau khi dựng xong.

Staff đã có API list hợp đồng của khách, detail hợp đồng và catalog metadata tài liệu đúng phiên bản, kiểm session/assignment mỗi request. [Contract và kiểm thử](docs/ui/staff/plans/05-policies-contract.md). FE Staff đã nối signed URL xem/tải PDF; bootstrap chung có 7 sản phẩm Public và 17 PDF/version: 13 tài liệu Public, 4 hồ sơ hợp đồng riêng theo `data/synthetic/manulife-demo-v1/policies.json`. Mỗi khách mẫu có hai hợp đồng cho hai sản phẩm/người được bảo hiểm rõ ràng; không nhân bản để đủ trang. Bootstrap giữ chỉnh sửa hiện có; thay bộ nhân bản cũ dùng lệnh maintenance riêng trong Getting Started.

02/11/2026: Staff Policy Lookup đã nối GET /staff/policies (search/status/phân trang trong active assignment), danh sách và dossier/PDF hai cột, giữ query/Back–Forward và không reload document.

04/11/2026: [P01 catalog](docs/ui/staff/plans/products/01-catalog-read-api.md) và [P02 tài liệu/access](docs/ui/staff/plans/products/02-document-access.md) đã có Core API dùng chung Staff/Customer đã đăng nhập, kiểm active/public/current version, session/CSRF/quota và audit trước cấp PDF. Đã kiểm Core/MinIO/gateway; UI Products P03 đã triển khai.
