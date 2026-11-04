# S04 — Policy Lookup, hợp đồng và PDF

Điều chỉnh 04/11/2026: Policy Lookup tìm bằng Enter, không có nút Search/Clear search. Xóa nội dung rồi Enter để bỏ từ khóa, giữ bộ lọc trạng thái và PDF đang chọn; không tải lại document.

[Chỉ mục Staff](../README.md) · [API](00-staff-contract.md#api-theo-chức-năng) · [Customers](02-customers-contract.md) · [Khoảng trống](README.md#phần-còn-lại-theo-chức-năng)

Đối chiếu **03/11/2026**. Căn cứ: FR-008, UC-007, NFR-001/003/007/008 và Data Model bảng 7–10. **Staff A14/A15/A16/A18/A20 và FE đã triển khai.** Product A17/A19, Customer ownership API và quick lookup/context chat chưa có. Yêu cầu hai vai trò tại [Customer documents](../../customer/plans/05-documents-contract.md#hướng-triển-khai-policypdf-đã-thống-nhất--31102026) là phạm vi đích, không phủ định phần Staff đã chạy.

## Hiện trạng

- [x] Customers → danh sách nhiều hợp đồng, phân trang/phí/kỳ đóng tiếp theo; mở chi tiết hợp đồng.
- [x] Policy Lookup toàn tập active assignment: search/status/count/phân trang, URL/deep link/Back–Forward.
- [x] PDF gốc là nội dung chính; thông tin từ DB thu gọn mặc định; điều khoản/phụ lục riêng; Download PDF.
- [x] Icon thu gọn trong đầu cột tìm kiếm, icon mở lại ở mép; giữ bản nhập/bộ lọc/trang/lựa chọn khi đóng cột.
- [x] Lookup độc lập bỏ Back to Inbox/Customer profile, CCCD/phone và filter mẫu.
- [x] Core kiểm session/role/assignment/ownership/phiên bản, cấp signed URL có hạn và audit ý định xem/tải.
- [ ] Product API A17/A19; quick lookup Inbox và đổi linkedPolicy chat; citation theo trang.
- [ ] Customer list/detail/catalog/view/download theo ownership.
- [x] Realtime refetch giữ iframe/src cùng file/version, disclosure/focus/parent scroll; có 26 regression browser Policy/PDF.
- [ ] E2E tích hợp Core/DB/MinIO và hai vai trò đầy đủ.

## Quan hệ dữ liệu và phiên bản

| Đối tượng | Vai trò |
| --- | --- |
| CustomerProfile | Chủ sở hữu nhiều InsurancePolicy; Staff đọc qua active assignment |
| InsuranceProduct | Sản phẩm có nhiều policy và tài liệu chung |
| InsurancePolicy | Mã/trạng thái/phí/ngày hiệu lực và benefitsSnapshot của hợp đồng cá nhân |
| Document | Metadata/phạm vi PUBLIC hoặc PRIVATE_POLICY, product/policy/owner và currentVersion |
| DocumentVersion | Version cụ thể, object bucket/key, checksum SHA-256 và isActive |

Một hợp đồng có thể có Document hợp đồng chính và các Document phụ lục; điều khoản chung có thể thuộc sản phẩm. Một Document có nhiều version. Số Document khác số phiên bản, không có quy tắc bắt buộc một policy chỉ có một file. UI ưu tiên một PDF chính, không trộn toàn bộ tài liệu vào dropdown mặc định.

Schema chưa có cột Document.kind hoặc quan hệ riêng ghim version áp dụng. **Mở rộng local hiện tại** nằm trong JSON `InsurancePolicy.benefitsSnapshot.documents`: slot main/terms/guide/endorsements, mỗi binding `{documentId,version,kind}`. main nhận POLICY/POLICY_DRAFT; terms là TERMS, guide là PRODUCT_GUIDE, endorsements là ENDORSEMENT. Data Dictionary nguồn chưa mô tả cấu trúc này; không coi kind là enum/cột DB đã có. Core kiểm binding lúc đọc; khóa ngoại DB chưa bảo vệ riêng cấu trúc JSON.

Catalog chỉ lấy exact version còn isActive:

- POLICY/POLICY_DRAFT/ENDORSEMENT: PRIVATE_POLICY, đúng policy và ownerCustomerId, product null hoặc khớp sản phẩm policy.
- TERMS/PRODUCT_GUIDE: PUBLIC, đúng product, không gắn owner/policy.
- Không tự dùng currentVersion thay phiên bản ghim. Liên kết sai/trùng/thiếu/inactive không làm mở rộng quyền; tối đa 50 phụ lục.

Cấu trúc trên được giữ cho implementation hiện tại; chuẩn hóa sang quan hệ/cột có migration là quyết định cần review riêng, chưa được triển khai trong đợt tài liệu.

## API đọc đã triển khai

Prefix `/api/v1`, cookie phiên; Core không nhận actor/role do client cấp. Session/trạng thái Staff/assignment/dữ liệu trong cùng transaction RepeatableRead. Request kế tiếp thấy thay đổi quyền đã commit; request đang chạy có thể hoàn tất theo snapshot cũ.

| ID / API | Contract |
| --- | --- |
| A14 GET /staff/customers/:customerId/policies | page/pageSize; `{items,total,page,pageSize}`. Khách hợp lệ không có policy: list rỗng; khách ngoài quyền/không tồn tại: 404 |
| A15 GET /staff/policies | search/status/page/pageSize; `{items,total,page,pageSize}`. Mỗi item thêm customer `{id,fullName,accountCode}` |
| A16 GET /staff/policies/:policyId | `{policy}` gồm summary, product.summary, customer summary, benefitsSnapshot và benefitsSnapshotStatus |
| A18 GET /staff/policies/:policyId/documents | `{policyId,items,total,availability,mainDocumentStatus,issues}`; metadata đúng version, không bucket/key/checksum/URL |

Summary: id/policyNumber/customerId, product `{id,productCode,name,isActive}`, status, premiumAmount/paymentFrequency/nextDueDate/effectiveDate/expiryDate/sumAssured/currency. Ngày `YYYY-MM-DD`; tiền decimal string hai chữ số thập phân; thiếu giữ null. Premium là phí mỗi kỳ, không tự gọi là phí năm. Sản phẩm ngừng bán vẫn xuất hiện trong hợp đồng đã có; không suy ra số dư/hạn mức đã dùng/lịch sử thanh toán.

A14/A15: page default 1, 1–100000; pageSize default 10, 1–50; sort createdAt DESC/id ASC; vượt trang trả list rỗng và giữ total. **Chỉ A15** nhận search/status; A14 không nhận hai filter này. Detail/catalog không nhận query. Query lạ/lặp/sai kiểu hoặc UUID sai: 400.

A15 search trim/tối đa 100 ký tự/không control chars, literal substring không phân biệt hoa thường: policyNumber, Customer fullName/accountCode, Product name/productCode. Không tìm CCCD/phone; %, _ và backslash là ký tự thường. status chỉ ACTIVE/LAPSED/MATURED/PENDING; vắng là All. Scope/search/status áp trước count/phân trang.

A16 chỉ allowlist snapshot tài chính: currency/snapshotAsOf/insuranceTermYears/premiumTermYears/annualPremium và benefits `[{code,name,amount,unit,maxDays}]`. Không trả raw JSON, bindings hoặc KYC/metadata nội bộ. benefitsSnapshotStatus AVAILABLE/NOT_PROVIDED/INVALID; dữ liệu không hợp lệ không được diễn giải thành quyền lợi chắc chắn.

A18 item: documentId/title/kind/accessScope/versionId/versionNumber/versionCreatedAt. issues chỉ kind và BINDINGS_NOT_PROVIDED/INVALID_BINDING/DOCUMENT_UNAVAILABLE/DUPLICATE_BINDING, không lộ tên/ID tài liệu ngoài quyền.

| Trạng thái catalog | Ý nghĩa |
| --- | --- |
| availability=AVAILABLE | Các binding cung cấp đều hợp lệ và có item |
| PARTIAL | Có item nhưng có binding lỗi/không khả dụng |
| EMPTY | Bộ binding khai báo rỗng |
| UNAVAILABLE | Thiếu binding hoặc không có item khả dụng khi có lỗi |
| mainDocumentStatus | AVAILABLE/NOT_PROVIDED/UNAVAILABLE, độc lập việc có terms/guide |

Catalog chỉ kiểm metadata DB, không truy vấn MinIO. AVAILABLE không chứng minh object đọc được; bước cấp access bên dưới mới kiểm storage.

## API xem và tải PDF đã triển khai

A20 gồm hai path:

- `POST /api/v1/staff/documents/:documentId/versions/:versionId/view`
- `POST /api/v1/staff/documents/:documentId/versions/:versionId/download`

Body chỉ `{policyId}` UUID; không nhận query/trường lạ/bucket/key/URL tùy ý. Cần Origin hợp lệ, JSON, X-Auth-Request: 1, X-CSRF-Token hiện hành và cookie phiên/CSRF. Core kiểm lại catalog/quyền/exact version; HEAD object xác nhận tồn tại, MIME application/pdf, size > 0 rồi ký GET. Trả 200 `{url,expiresAt}`, Cache-Control no-store; mặc định TTL 900 giây, view inline/download attachment. MinIO private local, Core dùng reader, không cấp credential cho browser.

401 phiên không hợp lệ; 403 role/CSRF/Origin; 404 ngoài quyền/không có tài liệu hoặc object không phù hợp; 400 input; 503 storage/SDK lỗi an toàn. Storage lỗi không có nghĩa policy DB không tồn tại. Tất cả response lỗi không chứa storage key/credential/SDK trace.

Audit POLICY_PDF_VIEW_ISSUED/POLICY_PDF_DOWNLOAD_ISSUED ghi cấp link thành công, không ghi URL/key/credential và không chứng minh browser đã đọc/tải. Signed URL đã cấp có thể còn hiệu lực tới expiry sau logout/đổi assignment; lần cấp mới luôn kiểm lại quyền. Không hứa thu hồi file đã tải.

Checksum được lưu theo version; pipeline seed kiểm SHA-256 và upload create-only. Luồng cấp access runtime hiện kiểm MIME/size, **không tải lại/hash nội dung mỗi lần**. Chưa có ingestion/upload nghiệp vụ trong app; phải chốt kiểm toàn vẹn/bất biến cho luồng ghi mới trước khi bổ sung.

## Giao diện hiện tại

### Hợp đồng từ Customers

PDF chính ngay dưới header mã/sản phẩm/status, Download PDF; thông tin DB trong Policy information đóng mặc định. Nội dung này từ API/DB/snapshot, không OCR/trích xuất PDF. Viewer là trình đọc PDF của browser trong iframe, có mở tab riêng và Reload preview khi link hết hạn.

Supporting documents chỉ hiển thị TERMS/ENDORSEMENT. View PDF mở trong cùng viewer, có Back to main policy. PRODUCT_GUIDE không hiện trên trang hợp đồng; Products P03 riêng đã có. Thiếu PDF chính phải báo thiếu/không khả dụng, không dùng điều khoản làm hợp đồng thay thế.

URL không mang returnTo; ngữ cảnh search/page/policyPage quay về lưu theo tab trong sessionStorage, chỉ dùng nếu đường dẫn khớp customerId từ Core. Deep link/storage tắt dùng đích Customer mặc định; returnTo legacy được chuẩn hóa URL không reload.

### Policy Lookup

Trái: search Enter, xóa rồi Enter bỏ lọc, không Search/Clear buttons; status, list số policy/khách/sản phẩm/status và phân trang. Phải: tái sử dụng detail/PDF. Search/filter về trang 1; chọn policy giữ query/deep link. Có thể tiếp tục đọc policy còn quyền dù nó không nằm trong kết quả lọc hiện tại. Mobile list → detail/Back to results giữ bộ lọc.

Icon thu gọn trong đầu cột kết quả; khi đóng còn icon mở lại, không nhãn Hide results. Ẩn bằng CSS, không unmount form/viewer do thao tác thu gọn. Không có Customer profile/Back to Inbox trong Lookup. Xem policy không đổi linkedPolicy chat.

Search/Clear/filter/page/retry/chọn tài liệu/tải không reload document app. Realtime refetch cùng logical key giữ data và iframe/src, metadata detail/catalog vẫn kiểm quyền/binding. Network/5xx có cảnh báo dữ liệu có thể cũ và retry; 401/403/404 bỏ nội dung liên quan. Đổi actor reset state private, đổi binding/version thay viewer; không dùng currentVersion để phục hồi tài liệu cũ. Preview chỉ xin lại URL khi mở/đổi file hoặc Reload preview; expiry gắn grant thực đang hiển thị. Download xin grant mới và denial loại preview ngay, không chờ metadata. Bằng chứng tự động là DOM/src/parent scroll, không đo page/zoom bên trong native viewer.

## Kiểm thử và giới hạn

Các đợt triển khai trước ghi nhận 10 Policy integration và 6 HTTP/realtime tests, lint/typecheck/build; smoke gateway cho signed view/download, file trùng byte, inline/attachment, Range/CORS và anonymous/tampered-signature bị từ chối. Browser smoke trước đó kiểm lookup/search/status/page/Enter/Back–Forward, mobile và thu gọn cột. Đây là bằng chứng từng lớp, không phải bộ E2E tự động đầy đủ.

`npm run test:policies` chạy fixture synthetic tự dọn, kiểm scope/role/query/search/count/pagination, decimal/null, exact version, malformed/cross-scope/inactive binding, CSRF/access audit và thay đổi quyền. **PolicyStorageService được mock trong integration suite**, không kiểm file MinIO thật bằng suite này. Regression Customers cũng không tự động xác minh nội dung PDF. Việc 02 ngày 03/11 đã chạy lại browser suites liên quan; các test Core/storage nêu trên là bằng chứng đợt trước.

Bộ browser `apps/web/tests/browser/staff-policies.spec.mjs` có 26 ca mock API/WebSocket/PDF trong bộ nhớ: identity/src/burst/slow refetch, mạng/5xx/retry, 401/403/404 detail/catalog/view/download, version/removal, missing main, expiry/reload, Lookup/query/collapse, stale response, policyPage, bytes download và đổi actor. Chạy `npm run test:browser:policies` với Web Docker qua gateway. Screenshot/video/trace tắt; kết quả tổng hợp `apps/web/test-results/results.json` cần dọn sau đọc. Việc 02 đã có 69 ca browser liên quan pass và 3 ca tăng tải kiểm lại pass; [bằng chứng/giới hạn](policies/04-viewer-lifecycle.md#9-kết-quả-triển-khai-03112026). Chưa phải kiểm Core/DB/MinIO thật hoặc native PDF page/zoom.

Dữ liệu/bootstrap synthetic và cách chuẩn bị môi trường theo [Getting Started](../../../getting-started.md#74-sản-phẩm-hợp-đồng-và-pdf-mô-phỏng).

## Phần còn lại

- [x] Refresh nền giữ iframe/src cùng file/version, loại nội dung khi mất quyền; [việc 02 đã triển khai](policies/04-viewer-lifecycle.md#9-kết-quả-triển-khai-03112026).
- [ ] Browser E2E tự động gateway/Core/DB/MinIO: đúng file/version, tải, expiry/retry, storage/network lỗi, assignment/phiên thay đổi và keyboard/mobile.
- [x] Product A17/P01 Core catalog đã có, không phụ thuộc Agent; Staff UI đã nối.
- [x] Product A19/access P02 Core/MinIO/gateway đã có, vẫn tách product current version với policy applied version.
- [x] UI Products P03 đã có theo [contract](04-products-contract.md); citation/context Agent thuộc nhánh riêng.
- [ ] Customer ownership APIs/UI; không dùng Staff API thay quyền Customer.
- [ ] Quick lookup Inbox và contract thay linkedPolicy/context; mở xem hiện tại không cập nhật chat.
- [ ] Khi thay schema/luồng ghi tài liệu: review mapping kind/applied version, bất biến/checksum và migration an toàn.

## Phase triển khai

| Phase | Scope | Trạng thái |
| --- | --- | --- |
| [PL01](policies/01-read-lookup-api.md) | A14/A15/A16 read và lookup | E |
| [PL02](policies/02-applied-documents-access.md) | A18/A20 applied catalog/access | E |
| [PL03](policies/03-lookup-dossier-ui.md) | Customers policies + Lookup/dossier/PDF | E |
| [PL04](policies/04-viewer-lifecycle.md) | Giữ iframe/src qua refresh, expiry/revoke | E |

Product PUBLIC current version theo P01–P03, không gộp policy applied binding. PL02/PL03 còn cần bổ sung browser E2E policy thật; tests mock/storage riêng không thay thế.

## API và routes của chức năng

Bảng truy vết Axx được chuyển từ tài liệu tổng hợp; E/P giữ theo runtime, DTO/quyền/luồng/test chi tiết do các phase của chức năng sở hữu. Không thêm endpoint từ việc gom tài liệu.

| ID | Method/path | Phạm vi |
| --- | --- | --- |
| A14 E | GET /staff/customers/:customerId/policies | List/page/pageSize theo một khách; FE đã nối |
| A15 E | GET /staff/policies | Lookup toàn tập assignment: search số policy/tên-mã khách/tên-mã sản phẩm, status/page/pageSize; FE đã nối |
| A16 E | GET /staff/policies/:policyId | Summary/customer/product và snapshot tài chính allowlist; không đổi context chat |
| A18 E | GET /staff/policies/:policyId/documents | Catalog exact applied version, availability/issues; không signed URL/storage key |
| A20 E | POST /staff/documents/:documentId/versions/:versionId/view; POST /staff/documents/:documentId/versions/:versionId/download | Body `{policyId}`, session/CSRF/assignment/exact version; signed URL/expiresAt, audit cấp link; FE đã nối |

| Route | Trạng thái |
| --- | --- |
| /staff/policies | Policy Lookup search/status/page — PL01/PL03 |
| /staff/policies/:policyId | Dossier/main PDF/related docs — PL02/PL03 |

## Phần còn lại theo chức năng

| ID | Phần còn lại | Phase sở hữu |
| --- | --- | --- |
| G01 | Staff policy read E; Customer ownership P | Customer PO01/PO02 trong [C04](../../customer/plans/04-policies-contract.md); bổ sung Staff real E2E trong PL03 |
