# C05 — Policy PDF: exact version và ownership

04/11/2026 · **Chưa triển khai Customer** · C05 · [Chung](00-customer-contract.md).

## 1. Căn cứ và baseline

FR-008/UC-007/NFR-007. MinIO private, reader credential, SDK, signed link và Staff catalog/view/download đã E; không dựng storage hoặc sinh PDF lại trong feature này. Customer dùng cùng object/version với Staff khi có quyền, nhưng API owner riêng. Không upload/ingestion hoặc Document vault ngoài binding policy. Schema AccessScope chỉ PUBLIC/PRIVATE_POLICY.

| Phase | Kết quả | Phụ thuộc |
| --- | --- | --- |
| [D01](documents/01-owner-document-access.md) | Owner policy catalog + cấp link exact applied version | PO01/access helper, storage E |
| [D02](documents/02-pdf-viewer-ui.md) | PDF chính, supporting docs, download/lifecycle | H01+PO02+D01 |

## 2. Nguồn và phân loại

Document không có cột kind. Loại POLICY/POLICY_DRAFT/TERMS/PRODUCT_GUIDE/ENDORSEMENT do binding trong `InsurancePolicy.benefitsSnapshot.documents`, gắn documentId/versionNumber chính xác và validate trong policy service. Không suy từ title/file extension hoặc thay binding bằng Document.currentVersion. Một hợp đồng có một bản chính được binding hợp lệ cùng các tài liệu liên quan/phụ lục; mỗi Document có nhiều version lịch sử. Nếu không có binding chính thì hiển thị chưa có PDF chính, không tự chọn file đầu tiên.

## 3. Gate

- [ ] D01 scope/binding/version/HEAD/storage/error/audit tests pass.
- [ ] D02 same-version refresh, expiry/revoke/download/keyboard/mobile và E2E thật pass.
- [ ] Không log/persist signed URL/PDF; TTL residual giải thích đúng, không hứa thu hồi file đã tải.
- [ ] Catalog PUBLIC độc lập vẫn do P02/PR02, không mở rộng D01 thành toàn bộ kho tài liệu.

## UX và baseline của chức năng

## 1. Mục đích và phạm vi

FR-008, UC-007, NFR-007: đọc chính PDF đã phát hành và tải đúng version. Không upload/ingestion, không sinh lại file khi bấm xem, không chép toàn bộ PDF vào DB hoặc giả HTML là bản hợp đồng gốc. Customer theo ownership; Staff theo active assignment; Core kiểm quyền từng request. Tài liệu PUBLIC không thay hợp đồng cá nhân.

<a id="hướng-triển-khai-policypdf-đã-thống-nhất--31102026"></a>
## Hướng triển khai Policy/PDF đã thống nhất — cập nhật 04/11/2026

Giữ anchor cũ cho liên kết tài liệu chung. Contract runtime Staff ở [policies.md](../../staff/plans/05-policies-contract.md); phần Customer đề xuất do D01/D02 sở hữu.

### Ba lớp dữ liệu

| Lớp | Trách nhiệm |
| --- | --- |
| PostgreSQL/Core | InsurancePolicy lưu thông tin nghiệp vụ; Document/DocumentVersion lưu metadata, scope/owner/product/policy, version và tham chiếu object/checksum |
| Object storage private | PDF nội dung ổn định theo version; MinIO local Docker, runtime reader và job writer tách quyền; không đưa PDF/credential vào Git hoặc Next public |
| Web | Thông tin cấu trúc gọn từ Core, PDF chính, related documents, xem/tải; không credential hoặc raw storage key |

### Quan hệ và bản áp dụng

Một Customer có nhiều InsurancePolicy; mỗi policy thuộc một InsuranceProduct. Một Document có nhiều DocumentVersion. Bản chính và phụ lục riêng thuộc policy; điều khoản/guide PUBLIC thuộc product có thể dùng cho nhiều policy.

Schema **không có Document.kind**. Policy service phân loại POLICY/POLICY_DRAFT/TERMS/PRODUCT_GUIDE/ENDORSEMENT qua binding documentId + versionNumber trong `InsurancePolicy.benefitsSnapshot.documents`, kiểm scope/owner/product và exact active version. Không phân loại bằng title hoặc lấy currentVersion thay bản hợp đồng áp dụng. Catalog sản phẩm độc lập dùng currentVersion đã công bố theo P02; đó là mục đích khác.

Thông tin trên web từ InsurancePolicy và snapshot allowlist, không OCR/trích PDF. Khi DB cập nhật sau phát hành, không âm thầm ghi đè PDF lịch sử. Thiếu bản chính phải báo chưa có/không khả dụng, không chọn file điều khoản đầu tiên làm hợp đồng. UI giữ PDF chính nổi bật và thông tin thu gọn; supporting terms/endorsements riêng, product guide ở trang sản phẩm.

### Quyền và signed URL

Core lấy actor từ session, Customer phải owner policy; Staff phải active assignment. Catalog không trả URL; POST view/download kiểm lại document/version thuộc exact applied bindings, version active và scope consistency. Không nhận bucket/key/URL/filename tùy ý từ browser. Ngoài quyền/không tồn tại cùng lỗi an toàn; không mở mọi version chỉ vì một document thuộc Customer.

Local đã chốt SDK S3 v3/MinIO private. Core kiểm quyền và HEAD object PDF rồi cấp `{url,expiresAt}`: view inline, download attachment, tên file server kiểm soát. Browser GET/Range trực tiếp storage qua endpoint truy cập được từ host; TTL mặc định900 giây có cấu hình. Không public bucket hoặc stream qua Core mặc định để chữa lỗi viewer. Storage configuration/credentials/vận hành xem [Getting Started](../../../getting-started.md#35-storage-minio-local).

URL đã cấp có thể dùng tới hết hạn dù logout/đổi assignment; không hứa thu hồi ngay hoặc thu hồi file đã tải. UI xóa private memory/iframe khi mất quyền, không lưu URL/PDF vào browser storage/history/log/chat. Audit cấp link ghi actor/action/document/version/outcome, không URL/credential/nội dung file. DB và storage không chung transaction; phải recheck quyền trước trả link, xử lý race và giới hạn TTL rõ.

### Viewer và tương tác

Tái dùng native browser PDF iframe/lifecycle Staff hiện có; chưa chọn thêm PDF library. Không cần tab Policy information dài hoặc dropdown trộn bản chính với tất cả tài liệu phụ. Chọn file/policy/query/retry/download dùng client state/router, không F5; same actor/file/version còn link hợp lệ giữ iframe/src/scroll/focus khi refresh metadata. Đổi actor/quyền/file mới clear đúng lúc; stale response không được dựng lại PDF cũ.

Lỗi storage chỉ ở vùng file, không mất thông tin policy; phân biệt chưa policy, chưa PDF, metadata binding lỗi, object thiếu, storage503, link expired và session401. Download xin intent riêng, không điều hướng cả app sang object URL. Browser không nhúng PDF được thì có mở/tải bằng link đã cấp quyền; không dựa iframe load để khẳng định file đã tải thành công.

### Dữ liệu và chuyển storage sau này

Bootstrap chung đã có policy/product/document/version/PDF synthetic theo cơ chế create-only/checksum, không đưa seed cá nhân hoặc nội dung thật vào tài liệu chung. Mỗi version trỏ object nội dung ổn định; không ghi đè phiên bản đã phát hành. Job chuẩn bị DB/object cần retry/reconcile vì không chung transaction. Không reset DB/volumes/password để thêm mẫu.

Chuyển S3 sau này là công việc riêng: giữ nghiệp vụ/DTO owner và applied version, đổi cấu hình/IAM phù hợp, copy object kiểm checksum rồi kiểm lại signed URL/Range/CORS/expiry/download. Không chỉ đổi endpoint và bỏ dữ liệu MinIO, không coi lựa chọn local là quyết định production.

## 2. Checklist theo vai trò

- [x] MinIO private local, dữ liệu bền vững và credential đọc/ghi tách quyền.
- [x] Bootstrap chung có synthetic policy/PDF/metadata/version/checksum, chạy lại bảo toàn dữ liệu.
- [x] Staff A18/A20 và viewer/download đã nối; metadata refresh giữ iframe cùng file/version, clear khi mất quyền.
- [ ] Customer D01: own catalog/access exact version, safe404, CSRF/audit/storage/error tests.
- [ ] Customer D02: viewer/download, keyboard/mobile, expiry/revoke/rapid-switch/network và no-F5.
- [ ] E2E browser gateway/Core/DB/MinIO đúng version/file; mock regression hoặc HTTP test riêng lẻ không thay E2E.
- [ ] Kiểm PDF bằng text extraction/metadata/hash/headers; không screenshot hoặc render ảnh; không log signed URL.
