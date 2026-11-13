# P01 — Catalog sản phẩm: Core read API

04/11/2026 · **Đã triển khai và kiểm chứng Core/gateway** · [Contract P](../04-products-contract.md) · Tiếp: [P02](02-document-access.md).

Nghiệp vụ đã chốt tại contract P: active catalog, hai role đã đăng nhập, tên/mã/summary từ DB; nội dung đầy đủ trong PDF. A17/DTO/query bên dưới đã E; P02 tài liệu/access hiện cũng đã E theo phase riêng, UI P03 đã triển khai.

## Data model và phạm vi ảnh hưởng

Bảng bên dưới mô tả tác động của phase, gồm cả ghi gián tiếp qua Core. Tên bảng thuộc schema `business` trừ nơi ghi rõ; cột còn đề xuất được đánh dấu **P**. Web không truy cập DB trực tiếp.

| Bảng/model | Cột hoặc dữ liệu liên quan | Thao tác của phase | Quan hệ/ràng buộc cần giữ | Mức ảnh hưởng và nơi bị tác động |
| --- | --- | --- | --- | --- |
| users + auth_sessions | users.id/role/status, auth_sessions.user_id/token_hash/expires_at/revoked_at | Đọc | AuthSession.user_id → User.id; session phải còn hạn, không bị thu hồi | Cao — mọi API dùng session; không trả token/hash trong DTO |
| insurance_products | id/product_code/name/summary/is_active | Đọc | Unique product_code; chỉ catalog active, không sửa hợp đồng đã tham gia khi sản phẩm inactive | Trung bình — catalog và tài liệu dùng chung hai role |
| rate_limit_buckets | client_token/endpoint_group/window_start/request_count/blocked_until | Ghi phụ trợ khi endpoint áp quota | PK (client_token,endpoint_group); tăng atomic, giới hạn theo actor/nhóm endpoint | Trung bình — quota có thể ghi dù nghiệp vụ bị từ chối; không log định danh nhạy cảm |

**Schema/migration:** Không DDL; không thêm bảng benefit/pricing hoặc policy cá nhân vào catalog.

**Nhất quán và hồi quy:** Quota ghi riêng; read count/page RepeatableRead, recheck session. Kiểm inactive/search/DTO hai role; không tự sửa các policy của sản phẩm inactive.

## 1. Kết quả và file

FR-008: hai role tìm/chọn sản phẩm đang công bố, không cần Agent. Đã thêm `apps/core/src/products/products.module.ts`, `controllers/product.controller.ts`, `services/product.service.ts`, `dto/product-query.dto.ts`, `dto/product-response.dto.ts`; import ProductsModule tại `app.module.ts`. Dùng AuthService/DatabaseService và RepeatableRead, không thay schema hoặc dependency. Không đọc business DB từ Web/Agent.

| Vị trí từ root repo | Hiện trạng | Trách nhiệm trong phase | Mức ảnh hưởng | Phạm vi cần kiểm lại |
| --- | --- | --- | --- | --- |
| [apps/core/src/products/controllers/product.controller.ts](<../../../../../apps/core/src/products/controllers/product.controller.ts>) | Hiện có | Catalog/detail hai role | Trung bình | Staff/Customer Products |
| [apps/core/src/products/services/product.service.ts](<../../../../../apps/core/src/products/services/product.service.ts>) | Hiện có | Active filter/search/count/page projection | Cao | Không kéo policies/customer relations vào DTO |
| [apps/core/src/products/services/product-quota.ts](<../../../../../apps/core/src/products/services/product-quota.ts>) | Hiện có | Atomic actor quota dùng chung P01/P02 | Trung bình | Read và PDF access độc lập nhóm |
| [apps/core/src/products/dto/product-query.dto.ts](<../../../../../apps/core/src/products/dto/product-query.dto.ts>) | Hiện có | Validate literal search/page | Trung bình | product-api.ts và browser search |

## 2. API spec đã triển khai — A17 E

`GET /api/v1/products?search=...&page=1&pageSize=10`

| Query | Quy tắc hiện có |
| --- | --- |
| search | Trim, tối đa100 ký tự sau trim, không control character còn lại; literal substring name/productCode, không tìm summary/PDF; case-insensitive, không bỏ dấu |
| page | Integer1–100000, mặc định1; giới hạn đồng nhất policy lookup để chặn offset vô hạn |
| pageSize | Integer1–50, mặc định10 |

Không nhận isActive/customerId/role/sort hoặc query lạ. Auth hai role; cùng DTO. Lọc isActive=true và search **trước** total/page, sort productCode ASC rồi id ASC. Escape LIKE `%`, `_`, `\`; parameterized query. Page vượt cuối trả items rỗng, total đúng; UI điều chỉnh một lần khi dữ liệu đổi.

Quota `PRODUCT_READ`: tổng list/detail 120 request/phút/actor, bucket DB hashed actor, không theo cookie hoặc assignment. Upsert quota autocommit riêng, sau đó recheck session trong read transaction RepeatableRead; count/page cùng snapshot.429 dùng RATE_LIMITED + Retry-After. Không ghi product, policy hoặc assignment từ GET.

```json
{
  "items": [{"id":"10000000-0000-4000-8000-000000000001","productCode":"SIM-LIFE-01","name":"Synthetic Life","summary":null,"isActive":true}],
  "total":1,"page":1,"pageSize":10
}
```

`GET /api/v1/products/:productId` → `200 {product:{id,productCode,name,summary,isActive}}`; UUID sai400, không có/inactive404. Không trả policies/customers/documents cùng detail. Không giả summary khi null. Các trạng thái/auth/quota theo contract P. Total catalog này độc lập với quyết định **không counts của Inbox**.

## 3. Data và an toàn

Chỉ select allowlist InsuranceProduct, không raw relations. Không bảng giá/benefit mới, không gắn policy cá nhân để đọc sản phẩm. Inactive bị loại ở catalog nhưng không sửa quan hệ/DTO lịch sử policy hiện có. Không migration mặc định: kiểm index hiện tại; chỉ đề xuất migration mới nếu query plan cần, không sửa migration đã apply.

## 4. Luồng

```mermaid
sequenceDiagram
  participant W as Web hai role
  participant C as Core Products
  participant D as PostgreSQL
  W->>C: GET products search/page
  C->>C: Session, role, quota, validation
  C->>D: Active + search, count/page cùng snapshot
  D-->>C: Allowlist rows
  C-->>W: items/total/page/pageSize
  W->>C: GET product theo UUID
  C->>D: Chỉ active product
  C-->>W: product hoặc safe 404
```

## 5. Test cases

Các ca dưới đây là **đặc tả kiểm thử**, không phải báo cáo kết quả. Kiểm từng lớp API/service/DB/browser đúng nhãn; mock UI không thay kiểm quyền Core hoặc E2E thật.

**Quy ước dữ liệu:** S-A/S-B là hai Staff synthetic; C-A/C-B là hai Customer synthetic khác nhau. Thay alias bằng UUID/token của fixture cô lập; các path HTTP dùng prefix /api/v1 nếu chưa ghi đầy đủ. Chỉ thay assignment, khóa account, inject lỗi hoặc migration trong harness/môi trường test, không trên tài khoản/dữ liệu đang sử dụng.

### P01-T01 — Catalog dùng chung hai role

**Lớp kiểm thử:** API + DB.
**Điều kiện và dữ liệu:** Có sản phẩm active P1/P2 và inactive P0, mã synthetic.

**Các bước:**

1. GET /products bằng Staff và Customer.
2. GET detail P1 rồi P0.
3. So sánh field trả về giữa hai role.

**Kết quả mong đợi:** Hai role thấy cùng catalog active, P0 không xuất hiện và detail 404; DTO không kèm policy/Customer hoặc storage fields.

### P01-T02 — Search trên toàn tập và literal

**Lớp kiểm thử:** API.
**Điều kiện và dữ liệu:** Hơn10 sản phẩm active; P11 có mã riêng, một tên chứa % hoặc _.

**Các bước:**

1. GET page 2 rồi search mã P11 từ page 1.
2. Search literal %/_ và từ chỉ có trong summary.
3. Search tên với case khác và khoảng trắng.

**Kết quả mong đợi:** Search áp trước count/page; ký tự literal không thành wildcard; summary không được tìm; thứ tự productCode/id ổn định.

### P01-T03 — Query và quyền session

**Lớp kiểm thử:** API.
**Điều kiện và dữ liệu:** Phiên Staff/Customer và product UUID hợp lệ đã chuẩn bị.

**Các bước:**

1. Gửi page=0, pageSize=51, query isActive hoặc customerId.
2. Gọi detail bằng UUID sai và UUID không tồn tại.
3. Gọi catalog không cookie.

**Kết quả mong đợi:** Input400, UUID không tồn tại404, thiếu session 401; không phản chiếu dữ liệu gửi lên vào lỗi.

### P01-T04 — Quota và snapshot

**Lớp kiểm thử:** API + DB harness.
**Điều kiện và dữ liệu:** Bucket PRODUCT_READ cô lập; barrier có thể đổi isActive giữa truy vấn.

**Các bước:**

1. Đặt bucket sát ngưỡng rồi gọi list và detail.
2. Gọi vượt ngưỡng.
3. Dùng barrier đổi publication trong một request list.

**Kết quả mong đợi:** List/detail dùng chung quota;429 có Retry-After; count/items trong từng response cùng snapshot, không nửa trạng thái.

**Suite tham khảo:** [products.test.cjs](../../../../../apps/core/test/products.test.cjs). Tên suite là vị trí tự động hóa, không phải chứng nhận các ca đã chạy.

**Dọn sau kiểm thử:** xóa đúng fixture/session/object/schema theo runId; phục hồi fault injection và đóng context/socket test. Không reset DB/credential, sửa bootstrap hoặc xóa volumes. Với PDF kiểm metadata/bytes/hash; với UI kiểm DOM/focus/network, không cần screenshot.

## 6. Gate hoàn tất

- [x] DTO/query/quota khớp nghiệp vụ đã chốt; PostgreSQL thật, no-store và Swagger đã kiểm.
- [x] Account/Customers/Policies/Inbox smoke gateway pass; không thêm dependency/migration.
- [x] A17 đã E; P02 hiện đã E theo phase riêng, P03 đã triển khai.

## 7. Ghi chú triển khai



```powershell
docker compose --profile tests build core-tests
docker compose --profile tests run --rm --no-deps core-tests node --test test/products.test.cjs
# Sau khi Core runtime đã build/cập nhật P01:
docker compose --profile tests run --rm --no-deps -e P01_GATEWAY=1 core-tests node --test --test-name-pattern=gateway test/products.test.cjs
```

Core đã build và `docker compose up -d --no-deps --wait core` thành công. App qua `http://localhost:8080`, Swagger nhóm Products tại `http://localhost:8081/api/v1/docs`. Không tạo file riêng/credential trên host; credential runtime đang có trong Docker volumes được giữ nguyên. Bước tiếp theo P02, không thêm UI hoặc PDF trong P01.
