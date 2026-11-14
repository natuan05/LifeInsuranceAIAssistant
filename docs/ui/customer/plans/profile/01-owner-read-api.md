# PF01 — API đọc hồ sơ Customer

**Quyết định 13/11/2026, đã xác nhận lại phương án A:** Customer chỉ xem hồ sơ cá nhân. Baseline đọc hồ sơ đã có trong Core. [C08](../08-profile-contract.md) · [PF02](02-profile-account-ui.md).

## 1. Phạm vi và API

`GET /api/v1/customers/me` dùng session Customer, trả hồ sơ của chính actor và Staff phụ trách khi khả dụng. Core kiểm role/ownership trong read transaction. Customer khác và Staff dùng endpoint theo vai trò tương ứng.

| Dữ liệu trả về | Nguồn |
| --- | --- |
| id, fullName, birth, address | CustomerProfile và projection trong CustomerService |
| accountCode, email, phone, status | User qua allowlist |
| assignmentStatus, staff | Phân công hiện hành và trạng thái khả dụng của Staff |

`citizenId`, password hash và token nằm ngoài DTO hồ sơ. Masking dữ liệu theo vai trò còn P tại [ma trận dữ liệu Customer](../../../../configuration-and-data.md#customer-sensitive-data).

Core hiện đăng ký GET cho hồ sơ Customer. Yêu cầu `PATCH /api/v1/customers/me` đi vào xử lý route không tồn tại, trả 404 theo routing hiện tại. Tiêu chí bảo vệ là request tự sửa không ghi thay đổi vào hồ sơ. Đổi mật khẩu và đăng xuất dùng contract Auth riêng.

## 2. Data model và vị trí code

| Bảng/dữ liệu | Thao tác | Phạm vi ảnh hưởng |
| --- | --- | --- |
| users, customer_profiles | Đọc allowlist theo owner | Customer Account/Home và projection Staff dùng chung nguồn dữ liệu |
| auth_sessions | Đọc xác thực | Phiên hết hạn hoặc bị thu hồi phải được xử lý |
| staff_assignments, staff_profiles | Đọc contact hiện hành | ASSIGNED, UNASSIGNED, STAFF_UNAVAILABLE |
| customer_profiles.assignment_version | Routing fence hiện có | Phân công Staff và invalidation |

PF01 dùng schema hiện có, không đề xuất cột `profile_version` hoặc migration self-edit. Mức ảnh hưởng cao khi đổi projection vì cả Customer và Staff có caller liên quan.

| Vị trí từ root repo | Trách nhiệm |
| --- | --- |
| [customer.controller.ts](../../../../../apps/core/src/customers/controllers/customer.controller.ts) | GET own profile |
| [customer.service.ts](../../../../../apps/core/src/customers/services/customer.service.ts) | Role/owner, allowlist và contact theo availability |
| [realtime.service.ts](../../../../../apps/core/src/realtime/realtime.service.ts) | Fingerprint/invalidation khi nguồn hồ sơ hoặc assignment đổi |

## 3. Bổ sung bảo vệ dữ liệu — P

CustomerService cần projection self-read riêng với projection Staff khi triển khai masking. Dữ liệu hồ sơ dùng hiển thị, không có form ghi lại chuỗi đã che. Các ca canary phải kiểm JSON, log và dữ liệu ngoài quyền theo ma trận chung.

## 4. Test cases

Các ca sau là tiêu chí hồi quy, chưa được chạy lại trong lần đồng bộ tài liệu.

| Mã | Lớp | Thao tác | Kết quả mong đợi |
| --- | --- | --- | --- |
| PF01-T01 | API/DB | C-A GET hồ sơ bằng session Customer | Đúng allowlist của C-A; không có citizenId/hash/token |
| PF01-T02 | API/DB | C-A gửi PATCH thay fullName/phone/birth/address | Route hiện tại trả 404; hồ sơ trước/sau giống nhau |
| PF01-T03 | API | Gọi own profile bằng phiên hết hạn hoặc role sai | Bị từ chối theo auth/role, không lộ hồ sơ |
| PF01-T04 | API/DB | Thay trạng thái assignment trong fixture cô lập rồi GET lại | Contact/assignmentStatus đúng nguồn hiện hành; null xử lý rõ |
| PF01-T05 | API/DB | Customer gọi own profile khi Staff projection thay đổi | Self-read vẫn theo contract owner; dữ liệu mask không trở thành mutation |

Fixtures hoàn toàn synthetic. Kiểm tra trực tiếp bằng response và DB assertions, dọn đúng fixture theo runId.

## 5. Điều kiện hoàn tất

- [x] Đã chốt Customer chỉ xem hồ sơ.
- [x] GET own profile và kiểm quyền đã có trong source.
- [ ] Chạy các ca hồi quy PF01 theo phạm vi đọc hồ sơ.
- [ ] Nghiệm thu masking khi phần bảo vệ dữ liệu được triển khai.
