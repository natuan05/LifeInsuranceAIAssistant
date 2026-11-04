# C05 — Xem tài liệu

[Menu](../menu.md) · [Tiến độ và gap](../implementation-status.md)

Đối chiếu 30/10/2026. **Chưa có catalog/view API hoặc UI PDF; chỉ có schema Document/DocumentVersion.**

## Mục đích và thành phần dự kiến

Xem/tải PDF có sẵn đúng ownership và phiên bản áp dụng của policy; không có upload/ingestion trong app.

## Thao tác dự kiến

1. Từ policy chọn tài liệu bằng documentId/versionId; Core kiểm lại quyền.
2. Nhận signed URL có hạn sau kiểm quyền tại Core, mở đúng trang khi từ citation.
3. Hết hạn xin quyền lại; bị thu hồi/PDF lỗi báo rõ, không giữ URL ký trong chat/log.

## Checklist còn lại

- [ ] Chốt mapping policy–terms/version áp dụng, không tự dùng currentVersion.
- [ ] API catalog/access cho Customer và viewer/error/retry/expiry.
- [ ] Test ownership/thu hồi/quyền phiên bản/PDF hỏng; không đánh dấu NFR-007 đạt khi chỉ có bảng.

Các phần dự kiến không phải contract đã duyệt; Core kiểm quyền, Agent không truy cập business DB. Thuật ngữ UI tiếng Anh dùng Policy.

## Hướng triển khai Policy/PDF đã thống nhất — 31/10/2026

Phạm vi chức năng dưới đây được người dùng xác nhận để chuẩn bị triển khai, **chưa có implementation**. Trang này là đặc tả dùng chung cho xem/tải tài liệu của Customer và Staff; [Staff policies](../staff/policies.md) mô tả điểm vào phía Staff, [Customer policies](policies.md) mô tả điểm vào phía Customer.

### Ba lớp dữ liệu và hiển thị

| Lớp | Trách nhiệm |
| --- | --- |
| PostgreSQL / Core | InsurancePolicy lưu thông tin nghiệp vụ; Document/DocumentVersion lưu metadata, ownership, liên kết policy/product, phiên bản, bucket/object key và checksum. Quyền được tính từ phiên và phân công hiện hành |
| Object storage private | Lưu PDF hợp đồng chi tiết, điều khoản và phụ lục theo phiên bản. File không nằm trong Git hoặc public directory của Next; frontend không nhận storage credentials |
| Web | Hiển thị thông tin cấu trúc từ Core, danh mục tài liệu và hai thao tác Xem PDF / Tải PDF. Viewer đọc chính PDF đã lưu; không phải chép toàn bộ PDF vào DB hoặc viết lại toàn bộ nội dung thành HTML |

Một hợp đồng có thể có bản hợp đồng cá nhân và nhiều tài liệu liên quan; PDF điều khoản/sản phẩm công khai không thay thế bản hợp đồng riêng của khách. Không giả định một policy chỉ có một file hoặc luôn có PDF sẵn. Chưa có tài liệu là trạng thái riêng, không làm mất trang thông tin hợp đồng.

### Trải nghiệm Web cho cả hai vai trò

1. Chọn hợp đồng → xem trang chi tiết từ dữ liệu DB: mã, sản phẩm, trạng thái, ngày hiệu lực/hết hạn, quyền lợi/số tiền bảo hiểm, phí/tần suất đóng/ngày đến hạn; null có nhãn chưa cung cấp, không tự tính số liệu thiếu.
2. Danh mục tài liệu hiển thị tiêu đề, loại/phạm vi và phiên bản áp dụng. Chọn Xem PDF mở viewer trong trang/panel của app, có đóng/quay lại, chuyển trang, zoom và trạng thái đang tải/lỗi/thử lại. PDF.js là phương án ưu tiên để đánh giá; thư viện/phiên bản chưa được chốt hoặc thêm dependency. Xem [tài liệu PDF.js](https://mozilla.github.io/pdf.js/getting_started/).
3. Chọn Tải PDF tải đúng file/phiên bản đã chọn, tên file do server kiểm soát; không chuyển toàn bộ app sang đường dẫn PDF. Tách hành động xem và tải để cấp quyền/audit và Content-Disposition tương ứng `inline`/`attachment`.
4. Thao tác chọn tài liệu, phân trang/zoom viewer, retry và download không reload document như F5, không remount workspace. Giữ layout, policy đang xem, bộ lọc/back và focus phù hợp. File lớn có thể tải theo Range nếu phương án truy cập hỗ trợ; cần kiểm chứng viewer/worker, CSP và CORS khi triển khai.
5. UI phân biệt: chưa có policy, policy chưa có PDF, PDF lỗi/thiếu object, hết hạn truy cập, hết phiên và bị thu hồi quyền. Storage lỗi vẫn cho đọc thông tin policy từ Core; retry chỉ cập nhật vùng lỗi.

### Quyền xem và tải

| Actor | Điều kiện |
| --- | --- |
| Customer | Phiên hợp lệ và ownership của chính policy/document; không truyền customerId để tự mở rộng quyền |
| Staff | Phiên hợp lệ, role Staff và active assignment tới Customer sở hữu policy/document; không dùng quyền toàn công ty |
| Seed/chuẩn bị dữ liệu | Quyền ghi object và metadata theo job local riêng; không cấp quyền này cho browser hoặc Agent |

Core kiểm lại quyền khi list/detail/catalog và mỗi yêu cầu cấp quyền xem hoặc tải. Kiểm document thuộc policy, đúng document/version và object metadata; không nhận bucket/key/URL tùy ý từ browser. Ngoài quyền/không tồn tại trả lỗi an toàn tương đương theo contract. Cả hai vai trò dùng cùng PDF nguồn theo quyền, không sinh hai bản khác nhau cho Staff/Customer.

**Cơ chế local đã chốt:** MinIO chạy Docker, AWS S3 SDK v3 với endpoint cấu hình và forcePathStyle cho MinIO; Core kiểm session/ownership hoặc assignment/document/version rồi cấp signed URL. Browser đọc PDF trực tiếp từ storage bằng URL đó; mặc định local 15 phút, TTL có cấu hình và không vượt thời hạn credential ký. Xem dùng inline, tải dùng attachment với tên file do server kiểm soát. Không chọn stream qua Core làm luồng mặc định của đợt local này. URL phải truy cập được từ browser local (không dùng hostname chỉ tồn tại trong Docker), cấu hình GET/HEAD/Range/CORS phù hợp; không public bucket để giải quyết lỗi viewer.

Signed URL đã cấp có thể còn dùng được tới khi hết hạn; logout/đổi phân công không tự vô hiệu hóa ngay URL đó. Contract phải ghi rõ giới hạn thu hồi, thời hạn và hành vi xin quyền lại; không hứa thu hồi được file đã tải về. Client xóa nội dung riêng đang mở khi nhận lỗi quyền và không cache/persist URL hay nội dung PDF vào browser storage. Audit chỉ ghi actor/action/document/version/outcome cần thiết; không log URL ký, credential hoặc nội dung PDF.

### Local storage và phiên bản file

- Người dùng đã chọn **MinIO local**, volume bền vững, bucket private và job init bucket chạy lại an toàn. Chỉ triển khai local; chưa tạo tài nguyên AWS/S3.
- **Đã dựng Docker ngày 31/10:** `storage-prepare` → `minio` healthy → `storage-init`; bucket `life-insurance-documents`, credential root/reader/writer tách volume, publish loopback 9000/9001. Build Community AGPL-3.0 từ source MinIO `9e49d5e7a648f00e26f2246f4dc28e6b07f8c84a`, mc `7394ce0dd2a80935aded936b09fa12cbb3cb8096`, pin checksum source/digest base. `npm run storage:check` pass private access, quyền, signed Range/CORS và restart persistence. [Cách chạy/credential](../../getting-started.md#35-storage-minio-local). Chưa nối SDK/Core access API hay seed PDF.
- S3 client dùng endpoint cấu hình và forcePathStyle cho MinIO; credential riêng theo quyền đọc/ghi, runtime không dùng root credential. Chọn/pin edition/image/digest cụ thể và kiểm license/tính sẵn có khi triển khai. MinIO Community đã archive/ngừng duy trì; lựa chọn dùng local được ghi nhận, không suy rộng thành quyết định production. Nguồn: [MinIO repository](https://github.com/minio/minio).
- Core runtime dùng credential đọc tối thiểu, job seed dùng quyền ghi riêng; secret đặt trong cơ chế local bị ignore/volumes theo quy tắc repo. Không đưa vào `NEXT_PUBLIC_*`, Git hoặc log.
- Mỗi DocumentVersion trỏ tới file có nội dung ổn định và checksum. Không ghi đè cùng object key của phiên bản đã phát hành; không tự sinh lại PDF khi người dùng bấm Xem/Tải. Version trong app không tự đồng nhất với S3 object versionId; nếu dùng storage versioning thì phải định nghĩa mapping rõ.
- Bản hợp đồng cá nhân/phụ lục phải khớp policy và dữ liệu snapshot dùng để tạo bản đó. Điều khoản áp dụng gắn rõ policy với document/version; không tự lấy currentVersion mới nhất. Nếu DB nghiệp vụ cập nhật sau phát hành PDF, ghi rõ thời điểm/phiên bản, không âm thầm sửa file lịch sử để giống giá trị mới.
- Chốt cách nhận diện PDF hợp đồng chính, điều khoản và phụ lục trong schema/API; model hiện có không tự cung cấp đầy đủ phân loại hay mapping policy–terms theo version. Chỉ thêm migration/field khi contract yêu cầu, không sửa migration đã apply.

### Seed và thứ tự triển khai

1. Dựng MinIO local + signed URL theo quyết định trên; pin image/edition/license, tách credential và chốt mapping loại tài liệu/phiên bản, contract API hai role. Không triển khai Agent, embedding/RAG hoặc upload UI trong bước này.
2. Chuẩn bị fixture hoàn toàn synthetic: khách có 0/1/nhiều hợp đồng; nhiều trạng thái/kỳ phí và trường null. Seed policy/product và PDF hợp đồng có nhãn mô phỏng; thêm điều khoản/phụ lục/nhiều version để kiểm mapping. Không dùng hợp đồng thật đã che tên.
3. Job chuẩn bị sinh/đưa PDF vào object storage ngoài luồng thao tác người dùng, kiểm checksum rồi tạo metadata tương ứng; chạy lại không reset dữ liệu người dùng, tạo trùng hoặc ghi đè version đã có. Không để metadata trỏ file chưa nạp xong; DB và object storage không có cùng transaction, cần thiết kế retry/reconcile an toàn.
4. Làm API policy list/detail và catalog/access cho Customer/Staff, quyền ownership/assignment, DTO allowlist và kiểm thử lỗi/null/quyền/phiên bản trước khi nối UI.
5. Nối Insurance policies ở chi tiết khách bên Staff và My policies bên Customer; cùng kiểu trang chi tiết, viewer Xem PDF và Tải PDF. Tái sử dụng nghiệp vụ/service/viewer cho Policy Lookup, không dùng Staff endpoint để vượt quyền Customer. Luồng chat/context làm riêng sau khi có contract tương ứng.
6. Cập nhật Docker local và kiểm chứng cả hai vai trò qua gateway; ghi kết quả vào checklist hiện có/chat, không tạo file report mới.

### Checklist nghiệm thu Policy/PDF hai vai trò

- [x] Local storage private có dữ liệu bền vững và credential tách quyền; đã chốt provider/version/image/license (Docker và kiểm tra storage pass, 31/10).
- [ ] Seed synthetic policy + PDF + metadata/version/checksum nhất quán, chạy lại không nhân đôi/ghi đè.
- [ ] Customer xem list/detail/PDF của mình và bị chặn policy/document của người khác.
- [ ] Staff chỉ xem/tải theo assignment; sau chuyển/gỡ phân công request tiếp theo bị chặn theo contract.
- [ ] Trang chi tiết từ DB, Xem PDF trong app và Tải PDF đúng version hoạt động cho cả Customer/Staff.
- [ ] Catalog phân biệt hợp đồng cá nhân, điều khoản chung, phụ lục; không tự lấy bản mới nhất thay bản áp dụng.
- [ ] Kiểm checksum/object thiếu/PDF hỏng/null/không tài liệu/hết hạn/phiên/role và retry; range/download headers/CORS/CSP phù hợp.
- [ ] Không reload toàn trang trong thao tác; không lộ credentials, URL ký hoặc nội dung Private trong log/storage.
- [ ] Test giới hạn signed URL đã chọn; không ghi nhận đã đạt thu hồi tức thì khi URL còn hiệu lực.
- [ ] Có bằng chứng API/gateway và kiểm thử viewer/keyboard/mobile; không đánh dấu đã làm chỉ vì tồn tại schema hoặc khung UI.

### Chuyển sang AWS S3 sau này

Giữ nguyên contract Core cấp signed URL, quyền Customer/Staff, metadata/version/checksum và viewer. Hạ tầng/config cần thay: bucket, region/endpoint, cách addressing, credential provider (ưu tiên IAM role trên AWS), IAM/bucket policy, CORS/HTTPS và phương án mã hóa/giám sát. Không coi S3-compatible là bảo đảm tương thích mọi tùy chọn; phải chạy lại test view/download/Range/expiry/version. File phải được copy sang S3 và kiểm checksum trước khi chuyển tham chiếu bucket/key, không chỉ đổi endpoint rồi bỏ dữ liệu local. Tham khảo [AWS presigned URLs](https://docs.aws.amazon.com/AmazonS3/latest/userguide/using-presigned-url.html). Cloud deployment là công việc riêng chưa triển khai.
