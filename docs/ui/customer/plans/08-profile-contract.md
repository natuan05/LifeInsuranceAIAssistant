# C08 — Hồ sơ Customer, Account và bảo mật

**Quyết định chốt 13/11/2026, xác nhận phương án A:** Customer chỉ xem hồ sơ cá nhân. [Chung](00-customer-contract.md).

## 1. Phạm vi

FR-002 trong MVP gồm Customer xem hồ sơ bản thân và Staff xem Customer theo assignment. Customer xem fullName, accountCode, email, phone, birth, address và status theo allowlist, cùng Staff contact khi khả dụng. Đổi mật khẩu và đăng xuất theo Auth.

Customer không tự sửa hồ sơ. Bỏ kế hoạch editor, PATCH self-profile và migration concurrency dành cho Customer. Quy chuẩn writer được cấp quyền nếu có phạm vi triển khai riêng được ghi tại PF01.

## 2. Phase, data model và vị trí code

| Phase | Kết quả | Dữ liệu | Vị trí từ root repo |
| --- | --- | --- | --- |
| [PF01 — API đọc hồ sơ](profile/01-owner-read-api.md) | GET own profile, role/owner và contact | users, customer_profiles, auth_sessions, staff_assignments, staff_profiles — đọc | [customer.controller.ts](../../../../apps/core/src/customers/controllers/customer.controller.ts), [customer.service.ts](../../../../apps/core/src/customers/services/customer.service.ts) |
| [PF02 — Hồ sơ chỉ đọc và Account](profile/02-profile-account-ui.md) | Read-only view, refresh, security và logout | Hiển thị own projection; Auth mutation qua API hiện có | [customer-account.tsx](../../../../apps/web/src/components/customer-account.tsx), [customer-api.ts](../../../../apps/web/src/lib/customer-api.ts) |

Hai phase dùng schema hiện có. `assignment_version` là routing fence cho phân công. Thay đổi projection cần kiểm Customer Account/Home và Staff callers cùng nguồn dữ liệu. [Data Model](../../../specifications/Data_Model.md#iii-bản-đồ-tác-động-khi-triển-khai-chức-năng) mô tả phụ thuộc xuyên module.

## 3. API và UX

- `GET /api/v1/customers/me` trả own profile, assignmentStatus và Staff contact theo availability.
- `/customer` và `/account` hiển thị hồ sơ chỉ đọc. Dữ liệu thiếu hiển thị `Not provided`.
- Account dùng `POST /api/v1/auth/change-password` và `POST /api/v1/auth/logout`.
- Refresh/retry giữ nội dung đúng actor và cập nhật tại chỗ; logout/401 xóa dữ liệu riêng, bỏ response đến muộn.
- Phần giảm/che thông tin theo vai trò còn P tại [đặc tả bảo vệ dữ liệu](../../../configuration-and-data.md#customer-sensitive-data).

## 4. Trạng thái và kiểm chứng

- [x] Đã chốt quyền Customer chỉ xem hồ sơ.
- [x] GET own profile và UI chỉ đọc đã có trong source.
- [x] Account/password/logout có implementation hiện hành.
- [ ] Chạy lại các ca hồi quy PF01/PF02 sau khi đồng bộ contract.
- [ ] Nghiệm thu masking theo ma trận dữ liệu khi triển khai.

Checkbox source ghi nhận code hiện có. Kết quả chạy test cần ghi theo đợt kiểm chứng tương ứng.
