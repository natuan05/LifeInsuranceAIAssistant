# Core

NestJS modular monolith sở hữu danh tính, phân quyền và nghiệp vụ. Chạy bằng Docker Compose qua gateway; xem [Getting Started](../../docs/getting-started.md). Phần đã có/còn thiếu theo [tiến độ Application](../../docs/ui/implementation-status.md).

## Tổ chức source

AppModule gồm Database, Auth, Customers, Policies, Products, Conversations, Realtime, Outbox, Notifications và Tickets. Mỗi tính năng có controllers/dto/services/module. AdminModule/AccountsModule dùng entrypoint `src/admin/main.ts` và role `admin_runtime` riêng.

- Auth: login/session/password/logout và Staff tự sửa tên/phone.
- Customers: Customer self-read; Staff tìm khách được phân công, nhận projection che liên hệ và reveal từng trường.
- Policies/Products: list/detail/catalog tài liệu, cấp quyền xem/tải PDF đúng owner/assignment và phiên bản áp dụng.
- Conversations: Direct, consent/request/Accept, transcript, gửi tin và đối soát; pending chỉ chia sẻ metadata, Accept mới cấp transcript grant.
- Tickets: Staff read/Accept/status; Customer manual/draft/edit/confirm/list/detail/receipt, fingerprint/CAS và snapshot cơ bản.

Notification DTO/event/read-cycle và tool verify/reset còn phải sửa theo spec Phase 3–5. Core–Agent/Copilot tích hợp thuộc kế hoạch riêng.

## Database và storage

Prisma schema/migrations là nguồn model hiện hành: 20 model, 14 migrations. Dùng migration mới cho thay đổi schema; giữ dữ liệu/credentials đang dùng. Core runtime dùng role `core_runtime` và storage-reader từ Docker volumes; seed/admin có quyền riêng.

Policy dùng exact applied version; Product dùng current published version. Core kiểm quyền/binding, object và audit trước cấp signed URL; link đã cấp có thể còn hiệu lực đến hết TTL.

## Realtime và kiểm thử

WebSocket `/api/v1/realtime` gửi invalidation; client đọc lại dữ liệu qua REST theo quyền. Worker outbox local xử lý retry/dedup trong một Core process.

Lệnh Core/DB/browser và quy ước fixture nằm tại [tài liệu chức năng Application](../../docs/ui/README.md). API và phase theo [Staff](../../docs/ui/staff/plans/README.md), [Customer](../../docs/ui/customer/plans/README.md).
