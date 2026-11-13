# H02 — Home từ nguồn dữ liệu có thật

05/11/2026 · **Đã triển khai** · [C02](../02-home-contract.md) · Cần [H01](01-shell-navigation.md).

## Data model và phạm vi ảnh hưởng

Bảng bên dưới mô tả tác động của phase, gồm cả ghi gián tiếp qua Core. Tên bảng thuộc schema `business` trừ nơi ghi rõ; cột còn đề xuất được đánh dấu **P**. Web không truy cập DB trực tiếp.

| Bảng/model | Cột hoặc dữ liệu liên quan | Thao tác của phase | Quan hệ/ràng buộc cần giữ | Mức ảnh hưởng và nơi bị tác động |
| --- | --- | --- | --- | --- |
| users + auth_sessions | users.id/role/status, auth_sessions.user_id/token_hash/expires_at/revoked_at | Đọc | AuthSession.user_id → User.id; session phải còn hạn, không bị thu hồi | Cao — mọi API dùng session; không trả token/hash trong DTO |
| insurance_policies + insurance_products | customer_id/product_id/policy_number/status, premium_amount/payment_frequency/next_due_date, effective_date/expiry_date/sum_assured/benefits_snapshot, product_code/name | Đọc | Policy.customer_id → CustomerProfile.user_id; product_id → InsuranceProduct.id; unique policy_number | Cao — DTO tiền/ngày/snapshot dùng chung Staff/Customer; không OCR PDF để cập nhật DB |
| users + customer_profiles | users.id/account_code/email/phone/status/updated_at; customer_profiles.user_id/full_name/birth/address/assignment_version | Đọc own profile | CustomerProfile.user_id/role → User.id/role; owner actor từ session, không nhận customerId tự chọn | Cao — Customer header/Home/profile và Staff customer projection dùng chung dữ liệu |
| staff_assignments + customer_profiles + staff_profiles | staff_id/customer_id/is_active/ended_at, assignment_version, user_id/full_name | Đọc | Assignment gắn đúng Customer/Staff; Inbox còn ràng buộc assignment id cụ thể | Cao — Customers, Policy Lookup, Ticket và Inbox cùng phụ thuộc phân công |

**Schema/migration:** Không migration trong UI; Web chỉ gọi API Core, không có DB credentials hoặc quyền ghi trực tiếp bảng.

**Nhất quán và hồi quy:** Home chỉ tổng hợp policy owner đã tải đầy đủ theo API; không suy null=0 hoặc tính từ một trang rồi gọi là toàn tập. Không thêm bảng tổng hợp/số dư/thanh toán. Kiểm owner 0/nhiều policies, loading/error/available contact.

## Vị trí code và mức ảnh hưởng


| Vị trí từ root repo | Hiện trạng | Trách nhiệm trong phase | Mức ảnh hưởng | Phạm vi cần kiểm lại |
| --- | --- | --- | --- | --- |
| [apps/web/src/components/customer-home.tsx](<../../../../../apps/web/src/components/customer-home.tsx>) | Hiện có | Home composition/shortcut và số liệu từ API | Trung bình | Không đổi model tiền/ngày |
| [apps/web/src/components/customer-workspace.tsx](<../../../../../apps/web/src/components/customer-workspace.tsx>) | Hiện có | Cung cấp own profile và điều hướng | Trung bình | Profile dirty state và tab hiện hành |
| [apps/web/src/lib/policy-api.ts](<../../../../../apps/web/src/lib/policy-api.ts>) | Hiện có | Own policy paging/projection | Cao | Customer policy list và Home summary |
| [apps/core/src/customers/services/customer.service.ts](<../../../../../apps/core/src/customers/services/customer.service.ts>) | Hiện có | Own profile/contact projection hiện có | Cao | Không thêm Home endpoint nếu chưa cần |

## 1. UI và API

Triển khai tại `apps/web/src/components/customer-home.tsx` trong shell H01. Sử dụng dữ liệu thực từ `GET /customers/me`:
- Lời chào kèm `fullName` khách hàng, mã tài khoản `accountCode`.
- Lối tắt nhanh: *View My Policies* và *Contact Staff*.
- Số liệu danh mục bảo vệ: Tổng quyền lợi bảo vệ (*Total Protection Value* tính tổng từ các hợp đồng ACTIVE), số lượng hợp đồng hiệu lực (*In-force Policies*), và ngày đến hạn phí gần nhất (*Next Due Date*).
- Thẻ dịch vụ nhanh (*Policyholder Quick Services*).
- Danh sách giải pháp bảo hiểm nổi bật (*Featured Insurance Solutions*) kèm nút *Explore Details & Terms*.
- Thẻ thông tin chuyên viên phụ trách (*Assigned Support Staff*): hiển thị tiêu đề chữ đen tiêu chuẩn (`ASSIGNED SUPPORT STAFF`), đã gỡ bỏ nhãn trạng thái dư thừa (`Assigned & Active`), kèm email, số điện thoại và nút nhắn tin trực tiếp (`Message Staff`).
- Đã lược bỏ thẻ tĩnh *Paperless Electronic Policy* theo yêu cầu tối ưu không gian hiển thị.

## 2. Quy tắc dữ liệu

- ASSIGNED mới dùng staff contact Core trả; UNASSIGNED/STAFF_UNAVAILABLE có giải thích rõ ràng.
- Quyền lợi và số liệu tài chính tính toán từ hợp đồng thật, không bịa đặt số liệu giả định.
- Toàn bộ giao diện 100% tiếng Anh, không lẫn tiếng Việt.

```mermaid
flowchart LR
  A[Home] --> B[GET own profile]
  B --> C[Tên và contact đúng availability]
  A --> D[Shortcut tới route đã có]
  A --> E[PO01 policies thật]
  E --> F[Policy summary & financial metrics]
```

## 3. Test cases

Các ca dưới đây là **đặc tả kiểm thử**, không phải báo cáo kết quả. Kiểm từng lớp API/service/DB/browser đúng nhãn; mock UI không thay kiểm quyền Core hoặc E2E thật.

**Quy ước dữ liệu:** S-A/S-B là hai Staff synthetic; C-A/C-B là hai Customer synthetic khác nhau. Thay alias bằng UUID/token của fixture cô lập; các path HTTP dùng prefix /api/v1 nếu chưa ghi đầy đủ. Chỉ thay assignment, khóa account, inject lỗi hoặc migration trong harness/môi trường test, không trên tài khoản/dữ liệu đang sử dụng.

### H02-T01 — Home chỉ dùng dữ liệu của chính Customer

**Lớp kiểm thử:** Browser + API.
**Điều kiện và dữ liệu:** C-A/C-B có hồ sơ và portfolio synthetic khác nhau.

**Các bước:**

1. Đăng nhập C-A, mở Home.
2. Đối chiếu tên/mã, portfolio với API owner.
3. Mở View My Policies và một Featured solution.

**Kết quả mong đợi:** Không lộ C-B, không số liệu tĩnh giả; links mở đúng tính năng và không document reload.

### H02-T02 — Số liệu policy và null/date

**Lớp kiểm thử:** Browser + API mock.
**Điều kiện và dữ liệu:** C-A có 2 ACTIVE và 1 LAPSED; các biến thể premium/nextDueDate null.

**Các bước:**

1. Tính tổng quyền lợi ACTIVE từ fixture, đối chiếu Home.
2. Đổi một policy thành LAPSED trong response cập nhật.
3. Cho ngày phí đã qua và một field tài chính null.

**Kết quả mong đợi:** Không cộng policy ngoài tập ACTIVE; null không thành0 tùy tiện; ngày quá hạn không tự suy đã thanh toán hoặc quyết định nghiệp vụ.

### H02-T03 — Assigned Staff và unavailable

**Lớp kiểm thử:** Browser + API mock.
**Điều kiện và dữ liệu:** Ba biến thể: C-A có S-A khả dụng, không assignment, Staff unavailable.

**Các bước:**

1. Mở Home từng biến thể.
2. Kiểm contact/Message Staff.
3. Đổi availability qua cập nhật nền.

**Kết quả mong đợi:** Contact/action đúng contract và xóa contact cũ khi không còn; không tự tạo Direct tới Staff khác.

### H02-T04 — Refresh lỗi không làm mất Home

**Lớp kiểm thử:** Browser + API mock.
**Điều kiện và dữ liệu:** C-A đã tải Home; profile request tiếp theo503.

**Các bước:**

1. Phát update nền.
2. Retry vùng lỗi sau khi API phục hồi.
3. Dùng keyboard và viewport 375px.

**Kết quả mong đợi:** Không biến lỗi mạng thành logout, giữ dữ liệu cùng actor có nhãn lỗi phù hợp; retry không F5, links/focus dùng được.

**Checklist chức năng liên quan** (giữ trạng thái triển khai, không phải kết quả của lần sửa tài liệu):

- [x] H02 không tạo model/API/metrics thừa; liên kết dữ liệu thật hoàn tất.
- [x] Đã cập nhật theo các phản hồi UX của người dùng (tiêu đề đen ASSIGNED SUPPORT STAFF, gỡ nhãn dư, gỡ card Paperless Policy).

**Dọn sau kiểm thử:** xóa đúng fixture/session/object/schema theo runId; phục hồi fault injection và đóng context/socket test. Không reset DB/credential, sửa bootstrap hoặc xóa volumes. Với PDF kiểm metadata/bytes/hash; với UI kiểm DOM/focus/network, không cần screenshot.

## Sequence diagram

Luồng chính và nhánh quyền/lỗi; test case ở trên chỉ rõ dữ liệu và điểm kiểm tương ứng.

```mermaid
sequenceDiagram
    actor U as Customer
    participant W as Web
    participant C as Core
    participant D as PostgreSQL
    U->>W: Mở danh sách hoặc chi tiết
    W->>C: GET /customers/me và owner policy data
    C->>D: Kiểm session, role và self và policy owner
    D-->>C: Scope hiện hành và dữ liệu trong snapshot
    alt Không đủ quyền hoặc phiên không hợp lệ
        C-->>W: Lỗi an toàn, không entity riêng tư
        W-->>U: Clear vùng mất quyền hoặc yêu cầu login
    else Hợp lệ
        C-->>W: DTO allowlist và pagination nếu có
        W-->>U: Hiển thị đúng resource, không F5
    end
```
