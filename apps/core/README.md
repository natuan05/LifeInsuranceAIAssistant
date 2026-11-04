# Core

NestJS modular monolith sở hữu danh tính, quyền và nghiệp vụ. Source tại src/, Prisma schema/migrations tại prisma/, operator entrypoint/UI tách khỏi public Core. Không cho Agent truy cập trực tiếp business DB.

Setup env, chạy Docker/admin, cổng, Swagger, tài khoản dev và lệnh test đều ở [hướng dẫn chung](../../docs/getting-started.md). Thiết kế/ràng buộc ở [kiến trúc](../../docs/architecture.md).

Source chia theo tính năng `auth/`, `customers/`, `accounts/`, `admin/`; mỗi tính năng có thư mục `controllers/`, `dto/`, `services/` theo nhu cầu và file `*.module.ts` để khai báo Nest dependency injection. `database/` cung cấp Prisma qua `DatabaseModule`; model database nằm trong `prisma/schema.prisma`, không lặp lại bằng file model TypeScript thủ công.

Public `AppModule` import Auth/Customers/Database và đăng ký `RealtimeService`. `AdminModule` và `AccountsModule` được ghép tại entrypoint local `src/admin/main.ts` với client `admin_runtime`. Fixtures/seed nằm ở `src/cli/`; helper mật khẩu ở `src/accounts/utils/`.


Đối chiếu 30/10/2026: public APIs hiện gồm auth, `customers/me`, assigned `staff/customers` list/detail và health. Native WebSocket receive-only `/api/v1/realtime` kiểm cookie/Origin và snapshot theo scope mỗi 2 giây, phát invalidation account/profile/assignment; không nhận mutation. Đã có ba API Staff policy list/detail/catalog. Chưa có product API độc lập, cấp URL PDF, conversation/Ticket/Copilot/notification controllers hoặc outbox worker.

Prisma `InsurancePolicy`/`PolicyStatus` và bảng `business.insurance_policies` được chuẩn hóa bằng migration `202610300001_rename_insurance_policies`; ba migration trước giữ nguyên. A01–06 và A14/A16/A18 trong [bản đồ UI/API](../../docs/ui/staff/api-map.md) đã dùng; Các API còn lại vẫn đề xuất. [Checklist/gap](../../docs/ui/implementation-status.md) không coi schema/route/UI shell là hoàn thành nghiệp vụ.
