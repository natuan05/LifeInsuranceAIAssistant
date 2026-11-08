# C08 — Hồ sơ Customer, account và bảo mật

04/11/2026 · **Kế hoạch phần sửa; read/auth đã có** · C08 · [Chung](00-customer-contract.md).

## Truy vết data model và vị trí code theo phase

Mỗi phase dưới đây có bảng cột/đọc–ghi/FK/version, migration, transaction và mức ảnh hưởng chi tiết; xem mục **Data model và phạm vi ảnh hưởng** và bảng **Vị trí code** trong phase. Hiện có file không đồng nghĩa mọi thay đổi dự kiến trong file đã được triển khai. Các phần P giữ P.

| Phase sở hữu | Bảng/dữ liệu chính và thao tác | Code cần rà từ root repo | Mức ảnh hưởng khi sửa |
| --- | --- | --- | --- |
| [PF01 — Customer PATCH và optimistic concurrency](profile/01-self-edit-core.md) | users + customer_profiles (PATCH ghi dự kiến, profile_version DDL mới) | [apps/core/src/customers/controllers/customer.controller.ts](<../../../../apps/core/src/customers/controllers/customer.controller.ts>); [apps/core/src/customers/services/customer.service.ts](<../../../../apps/core/src/customers/services/customer.service.ts>) | Cao — Customer own projection |
| [PF02 — Profile editor và Account Customer](profile/02-profile-account-ui.md) | users + customer_profiles (Đọc own profile); users + customer_profiles (PATCH ghi dự kiến, profile_version DDL mới) | [apps/web/src/components/customer-account.tsx](<../../../../apps/web/src/components/customer-account.tsx>); [apps/web/src/lib/customer-api.ts](<../../../../apps/web/src/lib/customer-api.ts>) | Cao — Account và Home/sidebar labels |

Không tự áp dụng DDL khi triển khai UI, không biến model dự kiến thành hiện trạng, không reset seed/volume để né lỗi FK. Các dependency xuyên vai trò và operator xem [Data Model](../../../specifications/Data_Model.md#iii-bản-đồ-tác-động-khi-triển-khai-chức-năng).

## 1. Căn cứ và model

FR-002 còn thiếu Customer tự sửa. GET `/customers/me` đã có User.email/phone/accountCode/status + CustomerProfile.fullName/birth/address + Staff contact theo availability. Password/logout đã E qua auth, không viết lại. CustomerProfile không có updatedAt; User.updatedAt không tự đổi khi sửa chỉ profile, assignmentVersion chỉ cho routing. Không sao chép expectedUpdatedAt Staff một cách sai nguồn.

| Phase | Kết quả | Gate |
| --- | --- | --- |
| [PF01](profile/01-self-edit-core.md) | Chốt editable fields, profileVersion/migration, PATCH ownership/concurrency | Model/auth/audit contract trước UI |
| [PF02](profile/02-profile-account-ui.md) | Profile read/edit và ghép Account hiện có | H01+PF01 |

## 2. Phạm vi đề xuất

Customer sửa fullName/phone/birth/address chính mình; email/accountCode/role/status/citizenId/assignment chỉ đọc hoặc không expose như baseline. Chốt validation và giới hạn field trước code tại PF01. Không cập nhật policy snapshot/PDF lịch sử theo profile mới. Không hồ sơ KYC/upload hoặc đổi Staff.

- [ ] PF01 model/version/atomic update/uniquephone/conflict tests pass.
- [ ] PF02 form keyboard/dirty/409/unknown outcome/401/mobile/no-F5 và E2E thật pass.
- [ ] Đổi password/logout hai role giữ behavior cũ; FR-002 chỉ đánh dấu phần tự sửa sau khi thật.

## UX và baseline của chức năng

## Thành phần và thao tác hiện có

- `/customer`: actor và hồ sơ read-only (name/code/email/phone/birth/address/status) từ `GET /api/v1/customers/me`; contact Staff được phân công khi khả dụng.
- `/account`: actor từ `GET /auth/me`, form `POST /auth/change-password` với current/new/confirm, hiện/ẩn từng password, lỗi/thành công; `POST /auth/logout` về `/login`.
- Không có API sửa hồ sơ/KYC, tự đổi phân công hoặc khóa tài khoản. Dữ liệu thiếu hiển thị Not provided.

## Trạng thái và checklist

- [x] Loading/rỗng/lỗi, phiên hết hạn; Staff ASSIGNED/UNASSIGNED/STAFF_UNAVAILABLE từ Core.
- [x] Đổi mật khẩu/logout thật; password mới 6 ký tự đến 72 byte UTF-8, không trim, thu hồi các phiên cũ.
- [x] Lời nhắc password có Later; refresh thủ công và WebSocket ready/invalidate tải lại dữ liệu theo quyền.
- [x] Refresh nền giữ nội dung khi cùng actor; không refetch profile mỗi lần focus, vẫn kiểm lại session.
- [x] Layout/menu/font Customer theo H01/PF02, Tailwind4 `tw:` và Lexend/tokens cùng hệ Staff; giữ auth/chat đang chạy.
- [ ] Chỉnh sửa hồ sơ chỉ làm sau khi chốt trường, quyền và API; không đánh dấu FR-002 hoàn tất chỉ vì đọc được hồ sơ.
