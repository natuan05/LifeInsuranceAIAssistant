# Dữ liệu hợp đồng tối thiểu

**Đã chốt — 30/10/2026.** Giữ dữ liệu hợp đồng tối thiểu trong Core; chi tiết hợp đồng còn lại tra qua RAG. Bản này là nguồn chuẩn cho quyết định, thay đề xuất ba bảng người/phần tham gia/liên kết tài liệu trước đó. Core đã có API đọc/PDF và seed synthetic; validation thương mại và tools Agent được theo dõi riêng. Không bổ sung bảng/cột cho portfolio dev.

## Phạm vi lưu có cấu trúc

| Thông tin | Cách lưu đã chốt |
| --- | --- |
| Mã hợp đồng, Customer sở hữu | Giữ `policyNumber`, `customerId` hiện có |
| Sản phẩm chính | Giữ `InsurancePolicy.productId` |
| Các sản phẩm bổ trợ đã tham gia | Bổ sung danh sách mã sản phẩm trong `benefitsSnapshot` JSONB hiện có |
| Danh sách bổ trợ đã được kiểm tra đầy đủ chưa | Một cờ `ridersComplete` trong cùng JSON; mặc định chưa xác nhận |

**Không thêm bảng hoặc cột mới trong phạm vi này.** Dùng `benefitsSnapshot` với `schemaVersion`, `riders` là danh sách mã `InsuranceProduct.productCode` không trùng và `ridersComplete` là cờ xác nhận danh sách đầy đủ. Core kiểm tra mã theo danh mục khi nhập; chỉ đặt cờ đầy đủ khi đã xác minh và ánh xạ hết các bổ trợ.

JSON cũ, thiếu trường hoặc chưa kiểm tra không được coi là danh sách đầy đủ. Quy tắc validation/API cụ thể sẽ được viết khi triển khai.

Danh sách này chỉ trả lời sản phẩm nào có trong hợp đồng, không mô tả từng người hay từng quyền lợi. Cùng sản phẩm cho nhiều người chỉ cần xuất hiện một lần; hỏi “cho ai, gói nào, hạn mức bao nhiêu” thì đọc tài liệu Private.

- Có mã bổ trợ đã xác minh trong danh sách: xác nhận có tham gia theo dữ liệu đã nhập.
- Không có mã và danh sách đã xác nhận đầy đủ: có thể trả lời không tham gia theo bộ dữ liệu đó.
- Danh sách chưa đầy đủ hoặc còn sản phẩm chưa ánh xạ: dùng RAG tìm thêm; thiếu bằng chứng thì trả chưa xác định. Không mặc định JSON cũ hoặc rỗng là không tham gia.

## Phần để RAG tra cứu

Người được bảo hiểm, người thụ hưởng, chương trình, số tiền/hạn mức từng quyền lợi, thời hạn riêng, điều kiện, loại trừ và phụ lục được tra trong tài liệu hợp đồng. Chưa tạo bảng `ContractParty`, `ContractCoverage`, `ContractDocumentBinding` hoặc mô hình hạn mức.

Luồng tra cứu: Core xác minh quyền và hợp đồng → cấp đúng tài liệu/phiên bản → Private RAG tìm trong phạm vi đó. Được [tra toàn bộ hồ sơ thuộc hợp đồng đã cấp quyền](Agent_Design.md#whole-contract-retrieval), gồm phụ lục/tài liệu kèm theo, không chỉ các trường metadata ở trên. Mã hợp đồng là bộ lọc đối tượng, không tự cấp quyền. Giữ các bảng `Document`/`DocumentVersion` hiện có; cách liên kết bộ tài liệu/phiên bản là đặc tả kỹ thuật, không cần mở thêm bảng trong đợt này.

Thông tin trên PDF phản ánh tài liệu tại thời điểm của nó. RAG không xác nhận được trạng thái hiện tại, phí thực thu hoặc số dư hiện tại nếu không có nguồn cập nhật; bảng minh họa vẫn là dự phóng.

## Bảng dữ liệu, quan hệ và phạm vi ảnh hưởng

Tên bảng thuộc schema `business`. Customer ở đây là **chủ hợp đồng** (`CustomerProfile`), không đồng nghĩa mọi người được bảo hiểm/người thụ hưởng đều có tài khoản User riêng.

| Bảng/model | Cột được sử dụng | Quan hệ và cardinality | Đọc/ghi và mức ảnh hưởng |
| --- | --- | --- | --- |
| customer_profiles / CustomerProfile | user_id, full_name; users cung cấp account_code/contact | User 1:0..1 CustomerProfile theo role; CustomerProfile 1:N InsurancePolicy | Core đọc owner; sửa hồ sơ không sửa tên/nội dung PDF đã phát hành. Cao: quyền owner và Staff assignment |
| insurance_products / InsuranceProduct | id, product_code, name, summary, is_active | Product 1:N Policy và 1:N Document PUBLIC | Catalog runtime đọc; seed/import tạo. Trung bình: inactive catalog không làm đổi sản phẩm/version đã áp dụng trong policy |
| insurance_policies / InsurancePolicy | policy_number/customer_id/product_id/status, phí/ngày/số tiền, benefits_snapshot | Owner và sản phẩm chính bắt buộc; unique (id,customer_id) dùng cho FK cùng owner | API runtime chỉ đọc; seed/import ghi. Cao: summary/financial DTO hai role và applied document catalog |
| documents / Document | access_scope/product_id/policy_id/owner_customer_id/current_version | Policy 1:N tài liệu riêng; PUBLIC có product_id và không owner/policy. FK (policy_id,owner_customer_id) giữ đúng owner | Seed/import ghi metadata; runtime đọc. Cao: không cấp tài liệu Private chéo khách; không có cột kind |
| document_versions / DocumentVersion | document_id/version_number/is_active/checksum_sha256/storage_bucket/storage_object_key | Document 1:N version; unique (document_id,version_number), current FK exact document/version | Seed/import ghi version mới; runtime HEAD/sign PDF. Cao: bucket/key chỉ ở Core, không overwrite version đã tham chiếu |
| staff_assignments | staff_id/customer_id/is_active/id | Staff được đọc policy của Customer đang phân công; quyền chat còn có gate riêng | Operator ghi; Staff policy API đọc. Cao: policy URL biết trước không thay kiểm assignment |
| audit_logs | actor/action/target/outcome/request_id/metadata | Ghi cấp view/download theo version, không lưu signed URL hoặc PDF text | POST access ghi, GET catalog không tự cấp link. Cao: audit/grant lỗi không trả URL |
| conversations / support_tickets | linked_policy_id/customer_id; policy_id/customer_id | Composite FK tới Policy cùng Customer; nullable khi không gắn policy | Xem Lookup/PDF không ghi liên kết này. Cao khi maintenance thay fixture: không gán lại lịch sử sang sản phẩm khác để né FK |

`benefits_snapshot` có hai vai trò kỹ thuật cần phân biệt: dữ liệu quyền lợi đã whitelist và binding tài liệu áp dụng. Mỗi binding lưu exact `documentId + version + kind` theo parser Core; `POLICY`, `TERMS`, `ENDORSEMENT` là loại trong binding, không phải cột Document. Public `current_version` có thể đổi để công bố bản mới nhưng policy vẫn đọc bản đã áp dụng. Các trường người/phí đã trả trong snapshot là bản ghi tại thời điểm dữ liệu đó, không tự đồng bộ hai chiều với CustomerProfile hoặc dùng làm chứng cứ thanh toán thật.

Một policy có một tài liệu chính trong bộ hiện tại và có thể có điều khoản/phụ lục liên quan. Nhiều PDF không tạo nhiều InsurancePolicy; nhiều policy của một Customer phải phân biệt số hợp đồng, sản phẩm và đối tượng bảo hiểm. Nội dung PDF không được OCR rồi ghi đè dữ liệu Core khi mở viewer. Số tiền không biết giữ null, không thay bằng 0; hồ sơ seed là synthetic, không là phê duyệt thương mại/pháp lý.

## Vị trí code và đánh giá ảnh hưởng

| Vị trí từ root repo | Trách nhiệm | Mức ảnh hưởng | Phạm vi cần kiểm lại |
| --- | --- | --- | --- |
| [apps/core/prisma/schema.prisma](../../apps/core/prisma/schema.prisma) và migrations | FK owner/product, Decimal/date, Document current/exact version | Cao | Không sửa migration đã apply; kiểm legacy FK, unique và null |
| [policy.service.ts](../../apps/core/src/policies/services/policy.service.ts) | Staff scope/Customer owner, projection, applied catalog và access | Cao | Hai role, Customers/Lookup/Inbox panel, 404 parity |
| [policy-snapshot.ts](../../apps/core/src/policies/services/policy-snapshot.ts) | Validation/whitelist JSON và applied binding | Cao | Seed, legacy snapshot, financial null, kind/version sai |
| [product-document.service.ts](../../apps/core/src/products/services/product-document.service.ts) | PUBLIC/current publication riêng với applied policy | Cao | Staff/Customer Products và current đổi giữa cấp link |
| [policy-storage.service.ts](../../apps/core/src/policies/services/policy-storage.service.ts) | HEAD/sign exact object, inline/download, TTL | Cao | Tất cả viewer; DB và S3 không chung transaction |
| [dev-policy-portfolio.ts](../../apps/core/src/cli/dev-policy-portfolio.ts) và [dev-policies.ts](../../apps/core/src/cli/dev-policies.ts) | Kiểm nguồn/checksum, tạo cùng dữ liệu DB/PDF và seed idempotent | Cao | Bootstrap chung, version/checksum, phân bố owner, không reset hồ sơ |
| [dev-policy-reseed.ts](../../apps/core/src/cli/dev-policy-reseed.ts) | Maintenance thay fixture cũ với guard/reference cleanup riêng | Cao | Giữ User/profile/assignment/chat/Ticket, bỏ liên kết tùy chọn tới policy cũ có kiểm soát, dọn object sau commit |
| [signed-pdf-preview.tsx](../../apps/web/src/components/signed-pdf-preview.tsx) và [policy-api.ts](../../apps/web/src/lib/policy-api.ts) | Viewer/API client dùng chung actor/document/version | Trung bình | Không đổi src vì refetch; phiên/quyền/version đổi phải recheck; không F5 |

**Migration:** phần dữ liệu hợp đồng này dùng các bảng/cột hiện có, không thêm bảng Party/Coverage/Binding hoặc DDL cho bốn scenario seed. Chỉ tạo migration mới nếu có thay đổi schema được chốt riêng. Thêm JSON key không được mặc nhiên cấp quyền hoặc làm legacy trở thành dữ liệu đầy đủ.

## Dữ liệu thử và bước tiếp theo

[Portfolio dev](../../data/synthetic/manulife-demo-v1/policies.json) gồm bốn hồ sơ sinh hoàn toàn giả lập. Core ánh xạ owner/entity/binding theo tài khoản dev; mỗi hồ sơ có người được bảo hiểm, sản phẩm, lựa chọn điều khoản, thời hạn/phí và người thụ hưởng riêng. Không nhân bản cùng owner/sản phẩm/người được bảo hiểm để đủ số trang. Bộ này khai báo không tham gia bổ trợ (`schemaVersion=1`, `riders=[]`, `ridersComplete=true`); không áp cờ đầy đủ cho dữ liệu legacy. Bản `contract.json` cũ có DEMO-TITAN và bản Private đã khử định danh không được dùng cho bootstrap runtime.

API đọc hợp đồng và PDF cho Staff/Customer đã có; seed dùng đúng nguồn điều khoản Public được fixture chỉ định bằng checksum. Hai Business Tools đã chốt là [`list_contracts` và `get_contract_overview`](Agent_Design.md#contract-read-tools); contract và triển khai Agent được theo dõi riêng, không suy từ việc đã seed dữ liệu.
