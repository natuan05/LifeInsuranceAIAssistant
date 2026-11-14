# PO01 — Customer policy list/detail Core

05/11/2026 · **Đã triển khai** · [C04](../04-policies-contract.md) · Tiếp: [PO02](02-policy-ui.md), [D01](../documents/01-owner-document-access.md).

## Bổ sung bảo vệ dữ liệu Customer — 12/11/2026

**P — chưa triển khai phần bảo vệ bổ sung; giữ trạng thái baseline của phase.** Theo [ma trận dữ liệu chung](../../../../configuration-and-data.md#customer-sensitive-data); email/phone Customer được che mặc định theo định dạng A ngày 13/11, Staff có Hiện/Ẩn để liên hệ theo cập nhật 14/11. Core kiểm lại quyền khi reveal, phần triển khai và các quyết định còn mở theo ma trận chung. Vị trí code/API và data model của phase bên dưới là nơi rà tác động; bổ sung này không tự yêu cầu migration hoặc sửa dữ liệu gốc.

**Thay đổi của phase:** Rà policy.service/policy-snapshot: chủ hợp đồng khác người được bảo hiểm/người thụ hưởng; self-read không mặc nhiên cho mọi định danh trong snapshot. Chốt allowlist từng trường, giữ số liệu/ngày và exact binding.

**Kiểm thử cần bổ sung, chưa chạy:** API: nhiều owner, snapshot canary ở key hợp lệ/key lạ; không rò trường ngoài ma trận, không thay Decimal/null/version khi che.

## Data model và phạm vi ảnh hưởng

Bảng bên dưới mô tả tác động của phase, gồm cả ghi gián tiếp qua Core. Tên bảng thuộc schema `business` trừ nơi ghi rõ; cột còn đề xuất được đánh dấu **P**. Web không truy cập DB trực tiếp.

| Bảng/model | Cột hoặc dữ liệu liên quan | Thao tác của phase | Quan hệ/ràng buộc cần giữ | Mức ảnh hưởng và nơi bị tác động |
| --- | --- | --- | --- | --- |
| users + auth_sessions | users.id/role/status, auth_sessions.user_id/token_hash/expires_at/revoked_at | Đọc | AuthSession.user_id → User.id; session phải còn hạn, không bị thu hồi | Cao — mọi API dùng session; không trả token/hash trong DTO |
| insurance_policies + insurance_products | customer_id/product_id/policy_number/status, premium_amount/payment_frequency/next_due_date, effective_date/expiry_date/sum_assured/benefits_snapshot, product_code/name | Đọc | Policy.customer_id → CustomerProfile.user_id; product_id → InsuranceProduct.id; unique policy_number | Cao — DTO tiền/ngày/snapshot dùng chung Staff/Customer; không OCR PDF để cập nhật DB |
| users + customer_profiles | users.id/account_code/email/phone/status/updated_at; customer_profiles.user_id/full_name/birth/address/assignment_version | Đọc own profile | CustomerProfile.user_id/role → User.id/role; owner actor từ session, không nhận customerId tự chọn | Cao — Customer header/Home/profile và Staff customer projection dùng chung dữ liệu |

**Schema/migration:** Không migration; dùng Policy.customer_id/FK/product và JSON hiện có; không thêm bảng người/benefit cho read API.

**Nhất quán và hồi quy:** Owner filter customer_id=actor trước search/status/count/page; không lấy Staff assignment làm quyền Customer. Kiểm UUID khách khác/không tồn tại, decimal/null/ngày và late response sau đổi actor.

## 1. Vị trí và scope

Triển khai tại `apps/core/src/policies/controllers/customer-policy.controller.ts`, tích hợp vào `PoliciesModule` và `PolicyService` (`ownerList`, `ownerDetail`). Xác thực session `CUSTOMER` → truy vấn `InsurancePolicy.customerId = actor.id`, kiểm tra quyền sở hữu nghiêm ngặt, không cho phép truyền `customerId` từ client để xem hợp đồng của người khác.

| Vị trí từ root repo | Hiện trạng | Trách nhiệm trong phase | Mức ảnh hưởng | Phạm vi cần kiểm lại |
| --- | --- | --- | --- | --- |
| [apps/core/src/policies/controllers/customer-policy.controller.ts](<../../../../../apps/core/src/policies/controllers/customer-policy.controller.ts>) | Hiện có | Owner list/detail endpoints | Cao | Customer My policies |
| [apps/core/src/policies/services/policy.service.ts](<../../../../../apps/core/src/policies/services/policy.service.ts>) | Hiện có | ownerList/ownerDetail và projection dùng chung | Cao | Staff policy methods cũng trong service |
| [apps/core/src/policies/services/policy-snapshot.ts](<../../../../../apps/core/src/policies/services/policy-snapshot.ts>) | Hiện có | Safe benefits/financial JSON parser | Cao | Seed, PDF metadata và hai role |
| [apps/web/src/lib/policy-api.ts](<../../../../../apps/web/src/lib/policy-api.ts>) | Hiện có | ownPolicies/ownPolicyDetail wrappers | Trung bình | Home và policy UI |

## 2. API spec đã triển khai

- `GET /api/v1/customers/me/policies?search=...&status=ACTIVE&page=1&pageSize=10`
  - Tìm kiếm theo `policyNumber`, `productCode`, `product.name`.
  - Lọc theo enum trạng thái: `ACTIVE`, `LAPSED`, `MATURED`, `PENDING`.
  - Phân trang chuẩn với `page`, `pageSize`, trả về `PolicyListResponseDto`.
  - Sort theo `createdAt DESC, id DESC`.
- `GET /api/v1/customers/me/policies/:policyId`
  - Đọc chi tiết hợp đồng sở hữu kèm `benefitsSnapshot` đã whitelist.
  - Trả về 404 an toàn nếu hợp đồng không tồn tại hoặc không thuộc quyền sở hữu của khách hàng đang đăng nhập.

## 3. Model và implementation

- Projection whitelist dữ liệu tài chính (decimal string chính xác, không ép về số 0 giả) và ngày tháng (YYYY-MM-DD).
- Parser `policy-snapshot.ts` đảm bảo an toàn snapshot, không phơi bày dữ liệu kỹ thuật nội bộ.
- Client API phía web: `ownPolicies`, `ownPolicyDetail` trong `apps/web/src/lib/policy-api.ts`.

```mermaid
sequenceDiagram
  participant W as Customer Web
  participant C as Customer Policy Core
  participant D as PostgreSQL
  W->>C: GET own policies/search/status/page
  C->>D: Auth + owner + filters, count/page cùng snapshot
  C-->>W: Safe summaries
  W->>C: GET policy theo UUID
  C->>D: WHERE id và customerId=actor
  C-->>W: Detail allowlist hoặc safe 404
```

## 4. Test cases

Các ca dưới đây là **đặc tả kiểm thử**, không phải báo cáo kết quả. Kiểm từng lớp API/service/DB/browser đúng nhãn; mock UI không thay kiểm quyền Core hoặc E2E thật.

**Quy ước dữ liệu:** S-A/S-B là hai Staff synthetic; C-A/C-B là hai Customer synthetic khác nhau. Thay alias bằng UUID/token của fixture cô lập; các path HTTP dùng prefix /api/v1 nếu chưa ghi đầy đủ. Chỉ thay assignment, khóa account, inject lỗi hoặc migration trong harness/môi trường test, không trên tài khoản/dữ liệu đang sử dụng.

### PO01-T01 — Owner trước filter/count/page

**Lớp kiểm thử:** API + DB.
**Điều kiện và dữ liệu:** C-A có 12 policies, C-B có 1 policy khác; đủ status synthetic.

**Các bước:**

1. GET /customers/me/policies hai trang bằng C-A.
2. Search policy ở trang2 và lọc từng status.
3. Tìm mã policy C-B.

**Kết quả mong đợi:** Items/total chỉ C-A; search trên toàn tập owner; C-B không có trong kết quả/count.

### PO01-T02 — Detail và 404 parity

**Lớp kiểm thử:** API.
**Điều kiện và dữ liệu:** PolicyA thuộc C-A; PolicyB thuộc C-B; UUID hợp lệ khác không tồn tại.

**Các bước:**

1. C-A GET detail PolicyA/PolicyB/UUID thiếu.
2. Kiểm DTO của PolicyA.
3. Thử gửi customerId như query quyền.

**Kết quả mong đợi:** PolicyA có whitelist đúng; ngoài owner/không tồn tại safe 404; client không chọn actor; không raw Prisma/storage metadata.

### PO01-T03 — Decimal, null và ngày

**Lớp kiểm thử:** API + DB.
**Điều kiện và dữ liệu:** PolicyA có số tiền lớn, vài trường null và date-only xác định.

**Các bước:**

1. Đọc list/detail.
2. So sánh số tiền dưới dạng string và ngày với fixture.
3. Kiểm nextDueDate quá hạn.

**Kết quả mong đợi:** Không mất chính xác hoặc biến null thành0; ngày giữ đúng; không suy payment state.

### PO01-T04 — Auth và query validation

**Lớp kiểm thử:** API.
**Điều kiện và dữ liệu:** Session Customer/Staff và bucket test riêng.

**Các bước:**

1. Gọi owner endpoint không session hoặc bằng Staff.
2. Gửi status lạ, page=0, pageSize51 và query ngoài DTO.
3. Gọi lại bằng Customer hợp lệ.

**Kết quả mong đợi:** 401/403/400 đúng contract, no-store; lỗi không lộ policy của owner khác.

**Suite tham khảo:** [customer-policies.spec.mjs](../../../../../apps/web/tests/browser/customer-policies.spec.mjs). Tên suite là vị trí tự động hóa, không phải chứng nhận các ca đã chạy.

**Checklist chức năng liên quan** (giữ trạng thái triển khai, không phải kết quả của lần sửa tài liệu):

- [x] Core controller và service methods cho quyền sở hữu Customer (`CustomerPolicyController`, `PolicyService.ownerList`, `PolicyService.ownerDetail`).
- [x] Swagger documentation được công bố tại `/api/docs`.
- [x] Client API `ownPolicies` và `ownPolicyDetail` kết nối Gateway hoạt động ổn định.
- [x] Không mở rộng quyền Staff hoặc rò rỉ dữ liệu ngoài phạm vi tài khoản khách hàng.

**Dọn sau kiểm thử:** xóa đúng fixture/session/object/schema theo runId; phục hồi fault injection và đóng context/socket test. Không reset DB/credential, sửa bootstrap hoặc xóa volumes. Với PDF kiểm metadata/bytes/hash; với UI kiểm DOM/focus/network, không cần screenshot.
