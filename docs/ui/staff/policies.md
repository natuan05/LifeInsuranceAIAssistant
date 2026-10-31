# S04 — Tra cứu hợp đồng, sản phẩm và tài liệu

[Chỉ mục Staff](README.md) · [Tiến độ](../implementation-status.md) · [Bản đồ API](api-map.md) · [Khoảng trống](gap-review.md)

Đối chiếu 31/10/2026. Căn cứ: FR-008, UC-007, NFR-003/007; Data Model bảng 7–10. Đã có API A14/A16/A18 đọc theo assignment; FE đã nối A14/A16/A18; A20 xem/tải PDF đã nối; A15/A17/A19 vẫn là phần tiếp theo.

Bổ sung hướng triển khai được xác nhận 31/10: DB lưu thông tin nghiệp vụ/metadata, object storage private lưu PDF theo version; Web có trang chi tiết từ DB và Xem PDF/Tải PDF cho cả Customer/Staff. Đặc tả dùng chung, storage local, quyền, seed và checklist ở [Policy/PDF hai vai trò](../customer/documents.md#hướng-triển-khai-policypdf-đã-thống-nhất--31102026). Đây là yêu cầu triển khai tiếp, chưa phải chức năng đã có.


## Hiện trạng 31/10/2026 — API và FE A14/A16/A18 đã nối

- [x] Policy Lookup/detail route, quick lookup panel và vùng policy trong hồ sơ.
- [x] Model InsurancePolicy/PolicyStatus/insurance_policies, quan hệ nhiều policy/Customer.
- [x] API danh sách hợp đồng trong Customer và chi tiết hợp đồng A14/A16, số tiền chính xác và kiểm assignment.
- [x] API danh mục tài liệu A18 đọc đúng phiên bản áp dụng, không tự lấy currentVersion.
- [x] FE Insurance policies trong Customer: phân trang, trạng thái/phí/kỳ tiếp theo; mở chi tiết hợp đồng/quyền lợi/catalog, retry/empty/error và quay lại giữ URL, không reload document.
- [ ] Search/filter Policy Lookup toàn tập A15.
- [ ] Policy đang xem khác linkedPolicy của chat; UI chọn và contract đổi context chưa có.
- [x] A20 cấp URL xem/tải PDF theo policy/document/version, CSRF và assignment; Web mở PDF gốc bằng viewer trình duyệt, chọn tài liệu và tải không reload.
- [ ] Product API A17/A19 và mở citation theo trang.
- [ ] Chỉnh placeholder CCCD/phone và filter trạng thái từ mẫu sau khi chốt contract; hiện disabled.

Các phần yêu cầu bên dưới mô tả đích triển khai; chỉ các dòng `[x]` là đã làm.

## Contract ba API Staff đã triển khai — 31/10/2026

Các path dưới có prefix `/api/v1`, dùng cookie `li_session`/`li_csrf`, không nhận actor/role từ client. Cả session, trạng thái Staff, assignment và dữ liệu được đọc trong cùng transaction RepeatableRead. Request kế tiếp thấy việc khóa/thu hồi phiên/chuyển hoặc gỡ phân công đã commit.

| API | Response |
| --- | --- |
| `GET /staff/customers/:customerId/policies?page=1&pageSize=10` | `{items,total,page,pageSize}`; chỉ khách thuộc active assignment. Có quyền nhưng chưa có hợp đồng trả items rỗng/total 0; khách ngoài quyền hoặc không tồn tại cùng trả 404 |
| `GET /staff/policies/:policyId` | `{policy}` gồm summary, customer `{id,fullName,accountCode}`, mô tả sản phẩm và snapshot quyền lợi đã allowlist |
| `GET /staff/policies/:policyId/documents` | `{policyId,items,total,availability,mainDocumentStatus,issues}`; chỉ metadata của phiên bản được gắn chính xác, không có URL/bucket/object key |

Summary: `id`, `policyNumber`, `customerId`, `product {id,productCode,name,isActive}`, `status`, `premiumAmount`, `paymentFrequency`, `nextDueDate`, `effectiveDate`, `expiryDate`, `sumAssured`, `currency`. Ngày là `YYYY-MM-DD`; số tiền là chuỗi decimal 2 chữ số sau dấu chấm để không mất độ chính xác. Giá trị chưa có giữ `null`, không đổi thành 0. `premiumAmount` là phí mỗi kỳ, không tự gọi là phí năm. Sản phẩm ngừng bán vẫn được hiển thị trong hợp đồng hiện hữu.

Phân trang: page mặc định 1, giới hạn 1–100000; pageSize mặc định 10, giới hạn 1–50. Thứ tự `createdAt DESC, id ASC`, ổn định khi trùng thời gian tạo. Trang vượt phạm vi trả items rỗng nhưng giữ total. Chưa nhận search/status/filter hoặc page trên detail/catalog; query lạ, lặp, sai kiểu và UUID sai trả 400.

Detail chỉ công bố snapshot tài chính: `currency`, `snapshotAsOf`, `insuranceTermYears`, `premiumTermYears`, `annualPremium`, `benefits [{code,name,amount,unit,maxDays}]`. Không trả raw snapshot, chủ thể/CCCD/contact trong JSON, fixture metadata hoặc document bindings. `benefitsSnapshotStatus` là `AVAILABLE`, `NOT_PROVIDED` hoặc `INVALID`; dữ liệu không phù hợp contract trả snapshot null, không tự bịa quyền lợi. Những trường schema không có như số dư/hạn mức còn lại/lịch sử thanh toán không được suy ra.

### Liên kết phiên bản trong dữ liệu Core

Hiện dùng vùng `documents` trong JSON `benefitsSnapshot` lưu ở DB, với các slot `main`, `terms`, `guide`, `endorsements`. Mỗi liên kết là `{documentId,version,kind}`; kind của main là POLICY/POLICY_DRAFT, terms là TERMS, guide là PRODUCT_GUIDE, endorsements là ENDORSEMENT. Đây là metadata nghiệp vụ được Core kiểm lại, không phải tham số mà client có thể gửi vào API đọc. Seed local hiện có đã tạo cấu trúc này; không thêm migration hoặc reset dữ liệu trong đợt API.

Catalog kiểm cặp document/version, `DocumentVersion.isActive` và scope ngay trong truy vấn: main/phụ lục phải là PRIVATE_POLICY đúng policy/owner, product null hoặc khớp sản phẩm hợp đồng; terms/guide phải PUBLIC đúng product và không có owner/policy. Không fallback sang `currentVersion`, kể cả bản được gắn cũ hơn currentVersion. Tối đa 50 liên kết phụ lục; liên kết sai/trùng/quá giới hạn được báo lỗi dữ liệu, không mở rộng quyền hoặc âm thầm cắt thành bộ hồ sơ đầy đủ.

Mỗi item: `documentId,title,kind,accessScope,versionId,versionNumber,versionCreatedAt`. Metadata storage, checksum và URL không xuất hiện trong response. Liên kết sai phạm vi không trả tên/ID của tài liệu ngoài quyền; `issues` chỉ gồm kind và lý do `BINDINGS_NOT_PROVIDED`, `INVALID_BINDING`, `DOCUMENT_UNAVAILABLE`, `DUPLICATE_BINDING`.

`availability`: AVAILABLE khi toàn bộ liên kết cung cấp đều hợp lệ, PARTIAL nếu có item nhưng một số liên kết không khả dụng, EMPTY nếu bộ liên kết được khai báo rỗng, UNAVAILABLE nếu thiếu binding hoặc không lấy được item nào trong trường hợp có lỗi. `mainDocumentStatus`: AVAILABLE/NOT_PROVIDED/UNAVAILABLE để phân biệt hợp đồng chưa có PDF với PDF được gắn nhưng không khả dụng. Có thể có terms/guide dù main chưa được cung cấp.

Availability ở đây chỉ nói về metadata DB; API chưa truy vấn MinIO để xác minh file thực, chưa cấp quyền xem/tải. Không mặc định catalog AVAILABLE là đã kiểm tra PDF hoặc có signed URL.

### Quyền và kiểm thử

Không có phiên hợp lệ trả 401; Customer gọi Staff API trả 403; tài nguyên ngoài assignment và không tồn tại cùng trả 404. Staff bị khóa/tạm khóa/phiên hết hạn hoặc thu hồi không đọc được. Customer bị khóa vẫn có thể được Staff đang phân công phục vụ, theo baseline Customers. Tất cả response/lỗi `Cache-Control: no-store`.

Chạy `npm run test:policies`: fixtures synthetic riêng kiểm session/role, UUID/query, phân trang/decimal/null, version cũ, scope tài liệu, malformed/missing/inactive bindings và thay đổi quyền ở request tiếp theo. Tests nhận credential qua stdin, dọn dữ liệu của mình sau khi chạy; không tạo `.local`, không cần screenshot.

## Thành phần

Giữ **Policy Lookup** toàn màn hình (danh sách → dossier), lookup nhanh bên phải chat và liên kết từ hồ sơ. Thêm chọn hợp đồng khi khách có nhiều hợp đồng; tab sản phẩm/điều khoản công khai; danh mục PDF hiển thị tiêu đề, loại, phiên bản áp dụng.

Chi tiết hợp đồng: policyNumber, sản phẩm, status, effectiveDate/expiryDate, sumAssured, premiumAmount/paymentFrequency/nextDueDate và benefitsSnapshot khi có. Không gọi thông tin kỳ phí hiện có là lịch sử giao dịch thanh toán. Thiếu dữ liệu không mặc định 0 hoặc “đã đóng phí”.

## Thao tác và API

| Thao tác | API |
| --- | --- |
| Từ Customer chọn hợp đồng | A14 P |
| Tìm/lọc hợp đồng trong assignment | A15 P; tìm CCCD/phone chưa được duyệt |
| Mở dossier / đổi hợp đồng trong chat | A16 P; giữ rõ hợp đồng đang xem với linkedPolicy của hội thoại |
| Xem sản phẩm/điều khoản chung | A17/A19 P |
| Chọn tài liệu riêng | A18 P; cặp document/version phù hợp hợp đồng |
| Mở/tải PDF hoặc nguồn trích dẫn | A20 P; kiểm lại quyền, cấp quyền có hạn, trang nguồn |

Từ Insurance policies trong chi tiết Customer hoặc Policy Lookup, Staff mở trang chi tiết hợp đồng bằng dữ liệu Core rồi chọn Xem PDF trong app hoặc Tải PDF. Viewer dùng đúng file nguồn/phiên bản mà Customer có thể xem theo ownership; Staff kiểm quyền theo active assignment tại từng request. Không đưa PDF vào thư mục public của Web, không mặc định tạo một bản HTML đầy đủ sao chép PDF. Trang chi tiết vẫn dùng được nếu chưa có PDF; không reload toàn workspace khi chọn tài liệu/zoom/tải/thử lại.

Không dùng PDF sản phẩm thay hợp đồng cá nhân. Không suy ra hạn mức còn lại/đã dùng hoặc beneficiary/bank account từ mock; cần nguồn API riêng được duyệt trước. Không upload/ingestion tài liệu ở MVP.

## Trạng thái riêng / checklist

- [ ] Chưa có hợp đồng, tài liệu/field null, tìm không thấy, PDF hỏng/không khả dụng.
- [ ] URL xem hết hạn xin lại đúng version; client xử lý thu hồi quyền, và contract nêu rõ signed URL đã cấp có thể còn hiệu lực tới hạn, không hứa thu hồi tức thì/file đã tải.
- [ ] Phân biệt nguồn Public với Private, version áp dụng với currentVersion; không log/lưu signed URL trong chat.

## Yêu cầu trạng thái khi triển khai đầy đủ

Đang tải, danh sách rỗng/không có kết quả, lỗi có nút thử lại. Phiên hết hạn chuyển đăng nhập; mất phân công/không còn quyền xóa dữ liệu riêng đang mở và tải lại scope. Không lấy quyền từ state client. Mọi dữ liệu mẫu phải có nhãn mô phỏng; chỉ báo thao tác thật thành công sau phản hồi Core.

## Xem và tải PDF Staff — 31/10/2026

Trang `/staff/policies/:policyId` hiển thị PDF hợp đồng chính ngay dưới header mã/sản phẩm/trạng thái, có Download PDF. Không dùng tab hoặc dropdown trộn tài liệu. Policy information là mục thu gọn mặc định đóng dưới viewer, hiển thị dữ liệu DB/snapshot, không OCR hoặc trích xuất PDF. Viewer dùng trình đọc PDF của trình duyệt, có liên kết mở tab riêng khi trình duyệt không hỗ trợ nhúng. PDF chính được chọn theo version đã ghim, không lấy currentVersion. Supporting documents chỉ liệt kê TERMS/ENDORSEMENT riêng bên dưới; View PDF mở trong cùng viewer và có Back to main policy. PRODUCT_GUIDE không xuất hiện ở trang hợp đồng và chưa có màn hình sản phẩm riêng. Thiếu PDF chính phải báo đúng trạng thái, không dùng điều khoản hoặc tài liệu giới thiệu thay cho hợp đồng. Đổi tài liệu và tải không reload document của app.

- `POST /api/v1/staff/documents/:documentId/versions/:versionId/view`
- `POST /api/v1/staff/documents/:documentId/versions/:versionId/download`

Body bắt buộc `{policyId}` UUID, không nhận trường khác/query. Header JSON, X-Auth-Request: 1 và X-CSRF-Token từ phiên; cookie session/CSRF hiện tại. Cả hai trả 200 `{url, expiresAt}`, Cache-Control: no-store. Core kiểm Staff/assignment, policy binding, document/version/isActive và ownership/product bằng cùng catalog; kiểm object tồn tại, MIME application/pdf và size > 0 trước ký. URL GET có hạn mặc định 900 giây, view dùng inline, download dùng attachment; bucket private và reader chỉ có GetObject. SDK lỗi/storage lỗi trả 503 an toàn, file/vùng quyền không có trả 404, session 401, role/CSRF 403, input 400.

Core ghi audit POLICY_PDF_VIEW_ISSUED/POLICY_PDF_DOWNLOAD_ISSUED sau cấp quyền, không lưu URL/key/credential; audit xác nhận đã cấp link, không khẳng định file đã được đọc/tải thành công. URL đã cấp có thể dùng tới hết TTL sau logout/thu hồi assignment; các lần cấp mới đều kiểm lại quyền. Web chỉ giữ URL trong memory, bỏ preview khi invalidation/quyền thay đổi, hết hạn có Reload preview. Chưa có Customer access API.

URL policy không chứa returnTo. Ngữ cảnh quay về khách (search/page/policyPage) lưu trong sessionStorage của tab và chỉ dùng nếu khớp customerId từ API; deep link/storage bị tắt quay về Customer tương ứng. Link returnTo cũ được chuyển sang URL gọn bằng replaceState, không reload.

Bootstrap chung đã có policy/PDF synthetic, gồm phân trang 12 hợp đồng Customer A, 2 Customer B, Customer unassigned không hợp đồng; pending thiếu main PDF, version ghim và phụ lục. Xem [Getting Started 7.4](../../getting-started.md#74-sản-phẩm-hợp-đồng-và-pdf-mô-phỏng). Bộ dữ liệu riêng trước đó vẫn giữ nguyên.

## Kế hoạch tiếp theo: Policy Lookup A15

Đã chốt đưa vào đợt tiếp theo, **chưa triển khai**. Trang độc lập tra cứu hợp đồng trên toàn bộ active assignment của Staff; Customers vẫn là điểm xem hợp đồng theo một khách.

- [ ] `GET /api/v1/staff/policies`: search số hợp đồng, tên/mã khách, mã/tên sản phẩm; All/ACTIVE/LAPSED/MATURED/PENDING; phân trang sau khi lọc đúng quyền và toàn tập, không tìm CCCD/phone.
- [ ] Danh sách bên trái có số hợp đồng/khách/sản phẩm/trạng thái, chọn để xem lại dossier/PDF hiện có bên phải; responsive danh sách → chi tiết, không nhân bản viewer hoặc nghiệp vụ cấp access.
- [ ] Bỏ Back to Inbox, đổi tiêu đề Policy Lookup, thay filter/placeholder mẫu; Clear search có vị trí cố định.
- [ ] Giữ search/status/page và hợp đồng đang xem qua Back/Forward/deep link; không F5, không remount workspace, không đưa returnTo dài/signed URL vào URL app.
- [ ] Loading/empty/error/retry, session/quyền thay đổi, exact version/missing PDF và kiểm keyboard/mobile. Chọn xem không đổi linkedPolicy của hội thoại.

Thứ tự: chốt DTO/query A15 → Core/test phân quyền/search toàn tập/phân trang → FE/tái sử dụng dossier → kiểm qua gateway và cập nhật checklist. Quick lookup trong chat và đổi context là bước sau; chưa triển khai trong đợt ghi kế hoạch này. Xem [kế hoạch chung](../../next-steps.md).
