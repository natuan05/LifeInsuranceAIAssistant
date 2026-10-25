# Core

NestJS modular monolith sở hữu danh tính, quyền và nghiệp vụ. Source tại src/, Prisma schema/migrations tại prisma/, operator entrypoint/UI tách khỏi public Core. Không cho Agent truy cập trực tiếp business DB.

Setup env, chạy npm/Docker/admin, cổng, Swagger, tài khoản dev và lệnh test đều ở [hướng dẫn chung](../../docs/getting-started.md). Thiết kế/ràng buộc ở [kiến trúc](../../docs/architecture.md).

Source chia theo tính năng `auth/`, `customers/`, `accounts/`, `admin/`; mỗi tính năng có thư mục `controllers/`, `dto/`, `services/` theo nhu cầu và file `*.module.ts` để khai báo Nest dependency injection. `database/` cung cấp Prisma qua `DatabaseModule`; model database nằm trong `prisma/schema.prisma`, không lặp lại bằng file model TypeScript thủ công.

Public `AppModule` chỉ import Auth/Customers/Database. `AdminModule` và `AccountsModule` được ghép tại entrypoint local `src/admin/main.ts` với client `admin_runtime`. Fixtures/seed nằm ở `src/cli/`; helper mật khẩu ở `src/accounts/utils/`.
