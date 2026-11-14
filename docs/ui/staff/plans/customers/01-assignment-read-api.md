# CU01 — Customers API theo phân công

04/11/2026 · **Đã triển khai; baseline Core** · [Contract](../02-customers-contract.md) · [Chung](../00-staff-contract.md).

## Data model và phạm vi ảnh hưởng

Bảng bên dưới mô tả tác động của phase, gồm cả ghi gián tiếp qua Core. Tên bảng thuộc schema `business` trừ nơi ghi rõ; cột còn đề xuất được đánh dấu **P**. Web không truy cập DB trực tiếp.

| Bảng/model | Cột hoặc dữ liệu liên quan | Thao tác của phase | Quan hệ/ràng buộc cần giữ | Mức ảnh hưởng và nơi bị tác động |
| --- | --- | --- | --- | --- |
| users + auth_sessions | users.id/role/status, auth_sessions.user_id/token_hash/expires_at/revoked_at | Đọc | AuthSession.user_id → User.id; session phải còn hạn, không bị thu hồi | Cao — mọi API dùng session; không trả token/hash trong DTO |
| staff_assignments + customer_profiles + staff_profiles | staff_id/customer_id/is_active/ended_at, assignment_version, user_id/full_name | Đọc | Assignment gắn đúng Customer/Staff; Inbox còn ràng buộc assignment id cụ thể | Cao — Customers, Policy Lookup, Ticket và Inbox cùng phụ thuộc phân công |
| users + customer_profiles | users.id/account_code/email/phone/status, customer_profiles.user_id/full_name/birth/address/assignment_version | Đọc projection | CustomerProfile.user_id/role → User.id/role; assignment filter trước total/page | Cao — tên/phone hiển thị ở Customers, Policy, Inbox và Ticket; không trả citizen_id/password |

**Schema/migration:** Không migration; không cấp/sửa assignment hoặc profile từ trang Customers.

**Nhất quán và hồi quy:** Lọc quyền và search trước count/page trong read transaction; API không cập nhật hồ sơ khách. Kiểm khách ngoài assignment, search trang sau và Back giữ query.

## 1. Phạm vi và model

FR-002/003, NFR-001/002. StaffAssignment active mới cấp quyền customer read; không cấp chat AI transcript.

## 2. Vị trí code

`apps/core/src/customers/controllers/customer.controller.ts`, `services/customer.service.ts`, `dto/customer-query.dto.ts`; model User/CustomerProfile/StaffAssignment.

| Vị trí từ root repo | Hiện trạng | Trách nhiệm trong phase | Mức ảnh hưởng | Phạm vi cần kiểm lại |
| --- | --- | --- | --- | --- |
| [apps/core/src/customers/controllers/customer.controller.ts](<../../../../../apps/core/src/customers/controllers/customer.controller.ts>) | Hiện có | Staff list/detail endpoint | Cao | Customers list/detail |
| [apps/core/src/customers/services/customer.service.ts](<../../../../../apps/core/src/customers/services/customer.service.ts>) | Hiện có | Scope active assignment và allowlist projection | Cao | Customer self read và Staff callers |
| [apps/core/src/customers/dto/customer-query.dto.ts](<../../../../../apps/core/src/customers/dto/customer-query.dto.ts>) | Hiện có | Search/page validation | Trung bình | customer-api.ts và tests |

## 3. API và dữ liệu

Prefix REST `/api/v1`; `E` là runtime, không endpoint đề xuất mới.

`GET /staff/customers?search=&page=1&pageSize=10` → `{items,total,page,pageSize}`. search0–100 literal case-insensitive: source hiện tìm tên/mã/email/phone, phương án A ngày 13/11 chỉ giữ tên/mã Customer (còn cần sửa code); page 1–100000, pageSize1–50; query lạ 400. Scope+search trước total/page, snapshot RepeatableRead, sort userId tăng dần.

`GET /staff/customers/:customerId` → `{customer}` allowlist id/fullName/accountCode/email/phone/status/birth/address; không citizenId/KYC. Customer ngoài quyền/không tồn tại cùng404; UserStatus LOCKED của khách không tự bỏ active assignment. Staff lock/session invalid vẫn bị chặn.

<a id="customer-privacy-api"></a>
### Bổ sung chuẩn bị masking — 12/11/2026, P

Baseline API ở trên **chưa che** email/phone và detail birth/address. Phương án A đã duyệt 13/11/2026 theo [ma trận thông tin Customer](../../../../configuration-and-data.md#customer-sensitive-data): email/phone Customer phải được che ở cả list và detail, kể cả Staff có active assignment; bổ sung Hiện/Ẩn ngày 14/11 để Staff liên hệ qua API reauthorize riêng. Source chưa đổi response. Định dạng A đã duyệt ngày 13/11 giữ 1 ký tự đầu email rồi nối `***`, che cả domain. Phone dùng `***` cùng 2 số cuối. Giá trị thiếu giữ null, chuỗi quá ngắn để che phần còn lại dùng `***` theo ma trận chung.

- Core dựng projection Staff riêng sau kiểm assignment, không gửi raw kèm masked value; `GET /customers/me` cần projection self-read riêng, không bị mask nhầm vì cùng dùng `customerView`.
- Họ tên/mã Customer đã chốt A ngày 13/11. Staff có active assignment hợp lệ nhận đầy đủ fullName/accountCode tại list/detail theo quyền hiện hành. Source đã khớp phần này. Giữ hai trường khi bổ sung masking email/phone và DTO năm sinh/tỉnh-thành, kiểm scope/revoke theo CU01-T01/T03.
- Ngày sinh/địa chỉ đã chốt A: Staff detail chỉ năm sinh và tỉnh/thành từ nguồn đã xác minh; thiếu căn cứ thì null từng trường. DTO đích đề xuất birthYear/provinceCity nullable, không raw birth/address hoặc trường phụ. Không bổ sung hai trường này vào list. Source hiện chỉ có birth/address tự do và chưa có metadata xác minh riêng: đặc tả nguồn tin cậy, mapping/validation và nhu cầu persistence trước code; không tự đoán tỉnh/thành hay thêm migration từ việc có đề xuất DTO.
- **API reveal — đề xuất kỹ thuật P theo quyết định 14/11.** Dùng `POST /api/v1/staff/customers/:customerId/contact-reveal`, body `{field: "email" | "phone"}`, response `{customerId, field, value: string | null}`. Session/Origin/JSON/CSRF, quota và lỗi an toàn theo foundation. Service kiểm quyền Staff, assignment hiện hành cùng transaction đọc và audit metadata, recheck sau lock. Response no-store, chỉ chứa trường đã yêu cầu. Swagger/client wrapper/caller cập nhật cùng CU02. Endpoint/DTO còn P. [Quyết định chuẩn](../../../../configuration-and-data.md#staff-contact-reveal).
- Triển khai định dạng mask email/phone A đã duyệt trong projection Core và đồng bộ DTO/caller. Policy các trường khác tiếp tục theo ma trận chung. Projection mặc định che, API reveal riêng trả một trường liên hệ sau reauthorize và audit metadata. Cập nhật `customer-api.ts`, Swagger/types và toàn bộ caller cùng thay đổi. Masking không tự cần migration hoặc đổi dữ liệu `users`/`customer_profiles`.
- Search đã chốt A: chỉ fullName/accountCode; bỏ email/phone khỏi OR filter trong customer.service.ts và cập nhật Swagger customer-query.dto.ts. Không thêm API hoặc đổi query param. Scope vẫn trước search/count/page; không lọc lại trang kết quả ở Web. Query chỉ khớp email/phone phải không match, trừ khi cùng chuỗi khớp tên/mã hợp lệ. Đồng bộ placeholder/URL/history/log theo CU02.
- Mở rộng test Core/API/DB: cả list/detail không chứa raw email/phone, kể cả Staff có assignment; reveal chỉ trả trường được yêu cầu sau kiểm quyền/phân công hiện hành, audit không có giá trị liên hệ. Kiểm null/Unicode/chuỗi ngắn, khác role/out-of-scope/assignment revoke, Customer self-read không bị mask nhầm và search inference. Dùng synthetic canary, chưa đánh dấu test masking pass.

## 4. Luồng và trạng thái

Cookie Staff → auth/assignment cùng snapshot → filter/count/page hoặc detail → safe DTO. Assignment đổi commit thì request mới recheck; UI không là authority và không đổi phân công.

```mermaid
flowchart LR
  U[Staff thao tác] --> C[Core kiểm phiên và scope]
  C --> D[Dữ liệu hoặc commit đúng quyền]
  D --> W[Web cập nhật đúng vùng]
  C --> E[Lỗi an toàn và retry có kiểm soát]
```

## 5. Test cases

Các ca dưới đây là **đặc tả kiểm thử**, không phải báo cáo kết quả. Kiểm từng lớp API/service/DB/browser đúng nhãn; mock UI không thay kiểm quyền Core hoặc E2E thật.

**Quy ước dữ liệu:** S-A/S-B là hai Staff synthetic; C-A/C-B là hai Customer synthetic khác nhau. Thay alias bằng UUID/token của fixture cô lập; các path HTTP dùng prefix /api/v1 nếu chưa ghi đầy đủ. Chỉ thay assignment, khóa account, inject lỗi hoặc migration trong harness/môi trường test, không trên tài khoản/dữ liệu đang sử dụng.

### CU01-T01 — Scope trước search và phân trang

**Lớp kiểm thử:** API + DB.
**Điều kiện và dữ liệu:** S-A được gán C-A1…C-A12; S-B được gán C-B; tên đều synthetic.

**Các bước:**

1. GET /staff/customers?page=1&pageSize=10 bằng S-A.
2. Lấy page 2 rồi search tên một khách chỉ có ở page 2.
3. GET lại bằng S-B.

**Kết quả mong đợi:** S-A có tổng12, trang10/2; search tìm trên toàn bộ scope; không có khách S-B trong items hoặc total.

### CU01-T02 — Search chỉ theo tên/mã Customer

**Kỳ vọng phương án A ngày 13/11, chưa kiểm thử sau thay đổi:** baseline cũ tìm cả email/phone không chứng minh policy mới đã hoàn tất.

**Lớp kiểm thử:** API.
**Điều kiện và dữ liệu:** fixture synthetic cô lập có token chỉ xuất hiện trong email/phone, không có trong bất kỳ tên/mã nào; thêm ca token trùng tên/mã hợp lệ, tên chứa % hoặc _, khách khác assignment và hơn một trang.

**Các bước:**

1. Search tên/mã, gồm khách không ở trang đầu; kiểm trim/case/literal và ký tự %/_.
2. Search toàn bộ và một phần token chỉ có trong email/phone, cả query từ URL cũ.
3. Search token đồng thời khớp tên/mã hợp lệ, token ngoài assignment và từ không tồn tại.

**Kết quả mong đợi:** Chỉ tên/mã trong scope quyết định items/total; email/phone không match riêng hoặc góp vào count. Token hợp lệ trong tên/mã vẫn tìm được; wildcard không mở rộng tập. Giữ page/total đúng trên toàn tập assignment, query validation hiện có; không log search raw.

### CU01-T03 — Detail và thu hồi phân công

**Lớp kiểm thử:** API + DB.
**Điều kiện và dữ liệu:** S-A được gán C-A, không được gán C-B; harness có thao tác revoke riêng.

**Các bước:**

1. GET detail C-A và C-B bằng S-A.
2. Thu hồi assignment C-A trong fixture.
3. GET lại detail C-A và list.

**Kết quả mong đợi:** C-A ban đầu có allowlist profile, không KYC/citizenId; C-B404; sau revoke C-A404 và không còn trong list.

### CU01-T04 — Input, role và khóa tài khoản

**Lớp kiểm thử:** API.
**Điều kiện và dữ liệu:** Fixture S-A, C-A; kiểm từng request độc lập.

**Các bước:**

1. Gửi page=0, pageSize=51, search quá 100 ký tự và query lạ.
2. Gọi list bằng Customer và không session.
3. Khóa Customer fixture rồi đọc bằng Staff còn assignment.

**Kết quả mong đợi:** Input400, Customer 403, thiếu session 401; khóa Customer không tự xóa scope Staff. Staff bị khóa không giữ quyền đọc.

**Dọn sau kiểm thử:** xóa đúng fixture/session/object/schema theo runId; phục hồi fault injection và đóng context/socket test. Không reset DB/credential, sửa bootstrap hoặc xóa volumes. Với PDF kiểm metadata/bytes/hash; với UI kiểm DOM/focus/network, không cần screenshot.

### CU01-T05 — Năm sinh/tỉnh-thành trong projection Staff

**P — chưa chạy.** Fixture synthetic gồm dữ liệu đã xác minh, null, chưa xác minh, address tự do/mơ hồ và chỉ một trường có căn cứ. Kiểm Staff có/ngoài assignment, revoke và Customer self-read; network JSON và DTO callers Policy/Inbox/Ticket.

**Kết quả mong đợi:** Staff detail chỉ nhận birthYear/provinceCity đúng nguồn; thiếu căn cứ thì null riêng trường đó. Không raw ngày sinh/địa chỉ hoặc metadata nguồn chứa raw trong response, list không được thêm các trường này; không đoán tỉnh/thành hoặc lệch năm do timezone. Customer self-read giữ contract riêng, dữ liệu DB/PDF không đổi.

### CU01-T06 — Định dạng che email/phone đã duyệt

**P — chưa chạy.** Fixture synthetic có email `minh@example.test`, phone `0900000012`, null, chuỗi ngắn, Unicode và phone có dấu phân cách. Gọi Staff list/detail, caller hồ sơ và Customer self-read với actor đúng/sai scope.

**Kết quả mong đợi.** Staff nhận `m***` và `***12` từ Core. Null giữ trạng thái thiếu dữ liệu. Chuỗi quá ngắn để che phần còn lại hiển thị `***`, gồm phone tối đa 2 chữ số. Kiểm đúng 1 ký tự email/2 số cuối phone, ba dấu sao cố định và cùng giá trị giữa list/detail. Kiểm canary ở JSON/DOM/copy/tooltip và contract self-read theo ma trận chung.

### CU01-T07 — Reveal liên hệ theo quyền hiện hành

**P — chưa chạy.** Fixture synthetic có email/phone và Staff đang phân công, actor ngoài scope, session hết hạn, assignment đổi giữa load và click, response bị giữ đến sau revoke. Kiểm API mặc định và API reveal, null, fields sai, duplicate request và audit/log.

**Kết quả mong đợi.** GET list/detail chỉ có bản che. Reveal kiểm lại quyền dưới lock, chỉ trả trường yêu cầu khi hợp lệ, no-store. Ngoài scope bị chặn theo lỗi an toàn hiện hành, audit thành công có actor/Customer/trường/requestId nhưng không có giá trị raw. Search vẫn chỉ tên/mã Customer. Quyền contact không cấp transcript, PDF hoặc model context.

## 6. Checklist và giới hạn

- [x] Họ tên/mã Customer đầy đủ cho Staff có active assignment đã duyệt, khớp source hiện tại.
- [x] Định dạng che A đã duyệt cho email/phone tại Staff list/detail.
- [ ] Triển khai Core projection, đồng bộ DTO/caller và chạy CU01-T06.
- [x] Đã chốt chỉ tìm theo tên/mã Customer; bỏ search email/phone trong MVP.
- [ ] Sửa OR filter/Swagger và chạy CU01-T02 theo contract mới; source hiện còn email/phone.
- [x] Staff detail chỉ hiện năm sinh/tỉnh-thành đã xác minh, thiếu thì ẩn đã duyệt.
- [ ] Đặc tả nguồn xác minh, DTO Staff riêng và chạy CU01-T05; source còn raw birth/address.

- [x] Có code runtime trong phạm vi được ghi ở tiêu đề; phase này bổ sung tài liệu cho phần đã làm.
- [x] Có các lớp kiểm thử/bằng chứng được dẫn ở contract; không coi việc dọn docs là chạy lại test.

**Quy tắc khi bảo trì:** Khi thay đổi code, chạy các suite bị ảnh hưởng theo test case của phase và dọn fixture/artifact do lượt kiểm thử tạo ra. Báo kết quả ngắn trong trao đổi, không ghi nhật ký kiểm thử vào phase. Đây là quy tắc áp dụng mỗi lần sửa, không phải hạng mục chức năng còn thiếu.

API E; không mở thêm status/cursor/CCCD chỉ vì có placeholder. Không thêm write Customer hoặc Ticket/Claim vào phase đọc.

## Tự động hóa test case

| Suite/vị trí | Phạm vi và giới hạn |
| --- | --- |
| [staff-foundation.integration.spec.mjs](../../../../../apps/web/tests/browser/staff-foundation.integration.spec.mjs) | API read/assignment được đối chứng từ browser directory, search/page và foreign/revoked assignment qua Core thật. |
| [browser-staff-fixture.cjs](../../../../../apps/core/test/support/browser-staff-fixture.cjs) | Dữ liệu synthetic UUID qua test Docker, session/password trong memory; finally dọn đúng fixture/object, không reset seed |
| [test-staff.mjs](../../../../../apps/web/scripts/test-staff.mjs) | Chạy Chromium/Firefox/WebKit, gom JSON tạm rồi tự dọn artifact; Web/Core chỉ chạy Docker |

Ca lỗi mạng dùng fault injection rõ ràng; native PDF toolbar/zoom không được xác minh bằng iframe DOM. Các bảng/test case là đặc tả duy trì, không ghi nhật ký từng lần chạy tại đây.

## Sequence diagram

Luồng chính và nhánh quyền/lỗi; test case ở trên chỉ rõ dữ liệu và điểm kiểm tương ứng.

```mermaid
sequenceDiagram
    actor U as Staff
    participant W as Web
    participant C as Core
    participant D as PostgreSQL
    U->>W: Mở danh sách hoặc chi tiết
    W->>C: GET /staff/customers hoặc detail
    C->>D: Kiểm session, role và active assignment
    D-->>C: Scope hiện hành và dữ liệu trong snapshot
    alt Không đủ quyền hoặc phiên không hợp lệ
        C-->>W: Lỗi an toàn, không entity riêng tư
        W-->>U: Clear vùng mất quyền hoặc yêu cầu login
    else Hợp lệ
        C-->>W: DTO allowlist và pagination nếu có
        W-->>U: Hiển thị đúng resource, không F5
    end
```
