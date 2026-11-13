# PF01 — Hồ sơ Customer và quy chuẩn dữ liệu

04/11/2026 · **P, chốt phạm vi 13/11/2026** · [C08](../08-profile-contract.md) · Tiếp: [PF02](02-profile-account-ui.md).

> [!IMPORTANT]
> **Quyết định người dùng chốt (13/11/2026):**
> 1. **Quyền hạn Customer:** Toàn bộ hồ sơ cá nhân người dùng **CHỈ HIỂN THỊ, KHÔNG CHO PHÉP NGƯỜI DÙNG SỬA HỒ SƠ** (Customer read-only 100%). Không cung cấp API `PATCH /customers/me` cho khách hàng tự sửa nhằm đảm bảo tính toàn vẹn định danh pháp lý và hợp đồng bảo hiểm.
> 2. **Quy chuẩn kỹ thuật đã chốt:**
>    - Trường `address`: Trim string tối thiểu **5 ký tự**, tối đa **100 ký tự** (5–100), không HTML/control chars.
>    - Quota/Rate limit (nếu có writer mutation hồ sơ): **10 patch / phút / actor**.
>    - Mã lỗi khi stale version / optimistic lock: **409 `PROFILE_CONFLICT`**.

## Data model và phạm vi ảnh hưởng

Bảng bên dưới mô tả tác động của phase. Tên bảng thuộc schema `business` trừ nơi ghi rõ. Web không truy cập DB trực tiếp.

| Bảng/model | Cột hoặc dữ liệu liên quan | Thao tác của phase | Quan hệ/ràng buộc cần giữ | Mức ảnh hưởng và nơi bị tác động |
| --- | --- | --- | --- | --- |
| users + auth_sessions | users.id/role/status, auth_sessions.user_id/token_hash/expires_at/revoked_at | Đọc | AuthSession.user_id → User.id; session phải còn hạn, không bị thu hồi | Cao — mọi API dùng session; không trả token/hash trong DTO |
| users + customer_profiles | users.account_code/email/phone/status; customer_profiles.full_name/birth/address/citizen_id | Đọc projection (Read-only) | Customer chỉ đọc hồ sơ chính mình; không mở quyền sửa | Cao — bảo toàn toàn vẹn dữ liệu hợp đồng và KYC |
| rate_limit_buckets | client_token/endpoint_group/window_start/request_count/blocked_until | Áp dụng quota | 10 request/phút/actor cho nhóm endpoint mutation nếu được mở | Trung bình — bảo vệ hệ thống chống lạm dụng |
| audit_logs | actor_id/action/target_type/target_id/outcome/request_id/metadata/created_at | Ghi log truy cập/thay đổi | actor_id → User.id; không lưu PII/credential vào log | Cao — tuân thủ NFR-002 |

**Schema/migration:** Giữ nguyên schema hiện tại của `CustomerProfile`. Quyết định 13/11/2026 chốt Customer read-only 100%, không mở API sửa cho khách hàng nên không cần thêm DDL `profile_version` cho phía Customer.

**Nhất quán và hồi quy:** Khách hàng đọc hồ sơ cá nhân qua `GET /api/v1/customers/me` (đã E). Mọi request chỉnh sửa hồ sơ từ role Customer đều bị chặn an toàn (403 Forbidden hoặc 405 Method Not Allowed). Không làm thay đổi snapshot hoặc file PDF hợp đồng lịch sử.

## 1. Vị trí và quyền hạn dữ liệu

**Quyết định 13/11/2026:** Khách hàng (Customer) **hoàn toàn không được sửa bất kỳ trường nào trong hồ sơ cá nhân**. Khách hàng chỉ có quyền xem (Read-only 100%) qua endpoint `GET /api/v1/customers/me` (đã E). Core không mở API `PATCH /customers/me` cho role Customer tự sửa.

Nếu hệ thống trong tương lai mở rộng endpoint cập nhật hồ sơ khách hàng cho các writer khác (như Operator tool hoặc Staff hỗ trợ), các writer liên quan phải tuân thủ nghiêm ngặt quy chuẩn kiểm soát tranh chấp (optimistic concurrency control) và quy tắc validation đã chốt.

| Vị trí từ root repo | Hiện trạng | Trách nhiệm trong phase | Mức ảnh hưởng | Phạm vi cần kiểm lại |
| --- | --- | --- | --- | --- |
| [apps/core/src/customers/controllers/customer.controller.ts](<../../../../../apps/core/src/customers/controllers/customer.controller.ts>) | Hiện có | GET /customers/me (E); chặn mọi mutation từ Customer | Cao | Customer own projection read-only |
| [apps/core/src/customers/services/customer.service.ts](<../../../../../apps/core/src/customers/services/customer.service.ts>) | Hiện có | Trả safe projection theo quyền, không mở self-edit | Cao | Staff Customers query cùng profile |
| [apps/core/src/realtime/realtime.service.ts](<../../../../../apps/core/src/realtime/realtime.service.ts>) | Hiện có | Giữ fingerprint/invalidation an toàn, không phát PII | Cao | WebSocket sync khi có cập nhật từ nguồn hợp lệ |

## 2. Quy chuẩn dữ liệu và API spec

### 2.1. Phân quyền và trường dữ liệu của Customer

Toàn bộ thông tin hiển thị tại trang hồ sơ khách hàng là **CHỈ ĐỌC (READ-ONLY)**:

| Field | Trạng thái quyền Customer | Quy chuẩn validation hệ thống đã chốt |
| --- | --- | --- |
| fullName | **Chỉ đọc (Read-only)** | Trim, 1–255 ký tự; không null/empty/control chars |
| phone | **Chỉ đọc (Read-only)** | Max 20 ký tự, format chuẩn E.164/utility Staff |
| birth | **Chỉ đọc (Read-only)** | YYYY-MM-DD hợp lệ, không phải ngày tương lai |
| address | **Chỉ đọc (Read-only)** | **Trim string 5–100 ký tự** (chốt 13/11/2026), không HTML/control chars |
| citizenId | **Chỉ đọc (Read-only)** | Cố định theo định danh KYC/hợp đồng |
| accountCode | **Chỉ đọc (Read-only)** | Mã tài khoản hệ thống |
| email | **Chỉ đọc (Read-only)** | Email đăng nhập tài khoản |
| status | **Chỉ đọc (Read-only)** | Trạng thái tài khoản |

### 2.2. Quy chuẩn kỹ thuật khi có Writer Mutation

Trong trường hợp có writer hợp lệ thực hiện cập nhật thông tin khách hàng:
- **Rate limit / Quota:** Tối đa **10 patch / phút / actor** (chốt 13/11/2026).
- **Mã lỗi khi stale version:** **409 `PROFILE_CONFLICT`** khi phiên bản gửi lên không khớp phiên bản hiện hành.
- **Bảo vệ quyền riêng tư số điện thoại:** Lỗi trùng số điện thoại trả về generic 409 (không tiết lộ chủ sở hữu).
- **Quyền Customer:** Nếu Customer cố tình gửi request `PATCH /api/v1/customers/me` (qua Postman/curl/script), Core từ chối với mã **`403 Forbidden`** hoặc **`405 Method Not Allowed`**.

## 3. Transaction và tính toàn vẹn

- Khi có luồng cập nhật thông tin khách hàng từ writer được cấp phép: Lock User và CustomerProfile theo thứ tự thống nhất, kiểm tra concurrency version, ghi audit log atomic. Tuyệt đối không log dữ liệu PII cũ/mới vào audit log (chỉ log actor, action, target, outcome, changed fields).
- Không tự ý cập nhật snapshot hoặc file PDF hợp đồng lịch sử khi thông tin địa chỉ/hồ sơ thay đổi.

## 4. Test cases

Các ca kiểm thử nhằm bảo đảm tính bảo mật và tính toàn vẹn dữ liệu theo quyết định 13/11/2026:

### PF01-T01 — Customer Self-Edit bị chặn hoàn toàn (Read-Only Enforcement)

**Lớp kiểm thử:** API Security.
**Điều kiện và dữ liệu:** Session Customer C-A hợp lệ.

**Các bước:**
1. C-A gọi `GET /api/v1/customers/me` xác nhận đọc được đầy đủ thông tin hồ sơ.
2. C-A thử gửi request `PATCH /api/v1/customers/me` chứa thay đổi `address`, `phone` hoặc `fullName`.

**Kết quả mong đợi:**
- Request GET thành công 200 trả đúng projection hồ sơ của chính mình.
- Request PATCH bị từ chối `403 Forbidden` hoặc `405 Method Not Allowed`; dữ liệu trong database hoàn toàn không bị thay đổi.

### PF01-T02 — Quy chuẩn độ dài Address (5–100 ký tự)

**Lớp kiểm thử:** Validation Unit/Integration.
**Điều kiện và dữ liệu:** Payload cập nhật address qua writer/service hợp lệ.

**Các bước:**
1. Gửi address có độ dài < 5 ký tự (ví dụ: "HN") -> Bị từ chối 400 Bad Request.
2. Gửi address có độ dài > 100 ký tự -> Bị từ chối 400 Bad Request.
3. Gửi address chứa HTML/script/control chars -> Bị sanitize/từ chối 400 Bad Request.
4. Gửi address hợp lệ từ 5 đến 100 ký tự -> Chấp nhận.

### PF01-T03 — Quota Rate Limit (10 patch / phút / actor)

**Lớp kiểm thử:** Rate Limiting.
**Điều kiện và dữ liệu:** Gửi liên tục vượt quá 10 request/phút.

**Kết quả mong đợi:** Request thứ 11 trong cửa sổ 1 phút bị từ chối với mã `429 Too Many Requests`.

### PF01-T04 — Stale Version Concurrency Conflict (409 PROFILE_CONFLICT)

**Lớp kiểm thử:** Optimistic Concurrency.
**Điều kiện và dữ liệu:** Hai writer cùng sửa một khách hàng với cùng version ban đầu.

**Kết quả mong đợi:** Writer thứ hai nhận mã lỗi `409 PROFILE_CONFLICT`, không ghi đè dữ liệu của writer thứ nhất.

**Checklist chức năng liên quan:**
- [x] Hồ sơ cá nhân người dùng chỉ hiển thị, không cho phép khách hàng tự sửa (Customer read-only 100%).
- [x] Chốt quy chuẩn validation trường address: 5–100 ký tự.
- [x] Chốt rate limit: 10 patch / phút / actor.
- [x] Chốt mã lỗi stale version: 409 PROFILE_CONFLICT.

**Dọn sau kiểm thử:** xóa đúng fixture/session/object/schema theo runId; phục hồi fault injection và đóng context/socket test. Không reset DB/credential, sửa bootstrap hoặc xóa volumes. Với PDF kiểm metadata/bytes/hash; với UI kiểm DOM/focus/network, không cần screenshot.
