# Cấu hình, secrets và dữ liệu

## Cấu hình

- Quy tắc chung nằm ở root; cấu hình chạy của ứng dụng nào đặt cạnh ứng dụng đó. Không dùng một file env chứa toàn bộ quyền cho cả hệ thống.
- Chỉ tạo `.env.example` hoặc `.env.<môi trường>.example` khi biến cấu hình đã có nhu cầu. Mẫu chỉ chứa placeholder; ghi rõ biến bắt buộc và bên sở hữu.
- `.env` và các biến thể thật không được commit. `.gitignore` đã loại chúng, chỉ cho phép mẫu có hậu tố `.example` theo quy ước trên.
- Baseline local đã chốt Node/npm và npm workspaces Web/Core, dùng một package-lock.json root. Phiên bản/lệnh chuẩn ở [getting-started](getting-started.md); không tạo lockfile riêng từng app. Không áp dụng các lựa chọn AI/cloud đề xuất thành mặc định.
- Tách cấu hình local/PoC và production. Không đưa ngưỡng timeout, số chiều embedding hoặc sizing đang đề xuất thành mặc định.

## Secrets

- Không ghi API key, password, token, private key, connection string có mật khẩu hoặc URL đã ký vào Git, prompt, fixture, ảnh chụp hay log. Ngoại lệ được người dùng duyệt cho đúng 5 tài khoản synthetic dev ở [dev accounts](getting-started.md#dev-accounts) và bộ DB/MinIO synthetic local cố định trong [.env.example](../.env.example)/[tài khoản hạ tầng local](getting-started.md#local-infrastructure-accounts). Không áp dụng với credential ngẫu nhiên hiện có, operator, cloud hoặc dữ liệu thật.
- FE/BE local chỉ chạy Docker Compose. `.env` root cấu hình cổng, Core/CORS/Swagger, build args công khai của Web, MinIO và credential khởi tạo tùy chọn; `.env.example` chỉ có default/ô trống. `.env` thật bị Git/build ignore; không chia sẻ đầu ra `docker compose config` có secret. Runtime vẫn mount credential từ named volumes tách role; prepare từ chối khi env không khớp volume cũ, không rotate ngầm. File riêng tư của tool host ở thư mục dữ liệu người dùng ngoài repo: `%LOCALAPPDATA%/LifeInsuranceAIAssistant` trên Windows, Application Support trên macOS, XDG state trên Linux. Không tạo `.local` trong repo cho runtime. Cloud dùng cấu hình dịch vụ và quản lý secrets khi triển khai.
- Frontend chỉ nhận cấu hình công khai cần thiết. Biến `NEXT_PUBLIC_*` phải được coi là công khai; model key và DB credential chỉ ở phía server có thẩm quyền.
- Tách quyền Core business, retrieval chỉ đọc, chuẩn bị dữ liệu và checkpoint. Không tái dùng credential quản trị cho ứng dụng.
- Compose local sinh credential vào named volumes riêng theo role; chỉ job prepare/bootstrap được truy cập bộ credential để khởi tạo. Runtime chỉ mount volume cần dùng. DB đã có dữ liệu nhưng thiếu credential volume thì khôi phục volume gốc; không sinh/rotate ngầm. Không đưa credential volumes vào image hoặc bản chia sẻ repo.
- `.gitignore` chỉ giảm lỗi đưa nhầm file, không phát hiện hết secrets. Rà soát diff trước mỗi commit; nếu lộ bí mật phải thu hồi/đổi bí mật và xử lý lịch sử liên quan.

## Dữ liệu

| Loại | Nơi quản lý | Có đưa vào Git? |
| --- | --- | --- |
| Nguồn/manifest tài liệu công khai | `data/public/` | Manifest nhỏ đã rà soát |
| Fixture sinh hoàn toàn giả lập | `data/synthetic/` | Chỉ mẫu nhỏ đã rà soát, có nhãn synthetic |
| PDF, chunks, embeddings, bộ dữ liệu lớn | Docker volumes hoặc kho dữ liệu ngoài Git | Không |
| DB volume/dump, checkpoint, log, bản xuất hội thoại | Docker volumes hoặc kho vận hành ngoài repo | Không |
| Tài liệu trao đổi gốc | Thư mục trao đổi bên ngoài repo | Không tự sao chép vào repo |

- Không dùng khách hàng/hợp đồng thật, kể cả bản che tên. Gửi LLM phần dữ liệu tối thiểu cần thiết.
- Manifest phải truy vết nguồn, phiên bản và checksum. Chunks phải khớp PDF, hợp đồng và phiên bản được Core cấp.
- Lưu định danh model, phiên bản và số chiều cho mỗi index khi chọn embedding. Đổi model cần đánh giá và dựng lại index; cùng số chiều chưa đủ bảo đảm tương thích.
- Checkpoint, vector và log có thể mang nội dung Private; bảo vệ như dữ liệu nguồn. Không chia sẻ cache Private giữa khách hàng.
- Audit phải đủ truy vết actor, hành động, tài liệu và kết quả nhưng giảm/che dữ liệu nhạy cảm. Nội dung và thời hạn lưu/xóa cần chốt trước khi ghi log/checkpoint.


## Đồng bộ UI và dữ liệu local — 30/10/2026

[Checklist UI/gap](ui/implementation-status.md) theo dõi phần đã nối API và placeholder. UI không giữ fixture policy/Ticket/Claim như kết quả thật; dữ liệu thiếu không biến thành 0 hoặc xác nhận chi trả. Customer/Staff dev fixtures nằm trong `apps/core/src/cli/dev-accounts.ts`; chưa có corpus/index/PDF hoặc bộ nghiệp vụ policy/chat/Ticket đầy đủ.

Policy dùng model InsurancePolicy/bảng insurance_policies; không sửa tên trong migration lịch sử. WebSocket local chỉ gửi invalidation account/profile/assignment, không payload Private; Web đọc lại REST theo quyền. Không ghi cookie/CSRF/URL xem tài liệu vào log sự kiện hay browser storage. Các artifact kiểm tra local không thay test suite được quản lý trong repo.

## Chuẩn bị policy và PDF local — 31/10/2026, đã có storage Docker

- Policy/product và metadata Document/DocumentVersion nằm trong DB; PDF gốc theo version nằm trong object storage private S3-compatible. Trang Web đọc thông tin cấu trúc từ Core và xem/tải PDF gốc; không đặt PDF riêng trong Next public hoặc Git.
- Chỉ seed dữ liệu sinh hoàn toàn giả lập có nhãn mô phỏng trong cả UI/file. Mẫu cần khách không có/một/nhiều policy, nhiều tài liệu/phiên bản và trạng thái null/thiếu PDF. Không lấy hợp đồng thật che tên hoặc kết hợp thông tin thật để làm fixture.
- Docker đã có MinIO Community AGPL-3.0 build source pin commit/checksum/base digest, bucket `life-insurance-documents` private, data volume và root/reader/writer credential volumes riêng. Prepare không rotate credential; dữ liệu đã có nhưng thiếu credential thì dừng để khôi phục. Init chạy lại giữ object. Reader chỉ GetObject; writer đọc/ghi/multipart trong bucket, không xóa/quản trị. Chưa cấp credential cho Core/Agent/Web; bước API sẽ chỉ mount reader cho Core, job seed giữ writer riêng. `storage:credentials` xuất console root credential vào thư mục dữ liệu người dùng ngoài repo (`storage/console.json`), không log giá trị. Chỉ local, chưa tạo AWS S3/cloud.
- Metadata chỉ công bố khi file đã nạp/kiểm checksum thành công. DB và storage không atomic cùng nhau; cần manifest/định danh ổn định và retry/reconcile không tạo trùng hoặc ghi đè version cũ. Không tự sửa dữ liệu người dùng đã đổi khi seed lại.
- Không lưu URL ký trong DB như địa chỉ tài liệu bền vững; lưu bucket/key/version/checksum theo contract, chỉ cấp quyền truy cập sau auth. Không log nội dung PDF, credential hoặc URL ký. PDF/volume/cache/bản xuất vẫn ở local/kho dữ liệu bị ignore.
- Mapping policy–phiên bản điều khoản, loại tài liệu và dữ liệu snapshot phát hành cần rà schema/DTO; không tự lấy tài liệu mới nhất hoặc coi app version là S3 versionId. Chi tiết tại [Policy/PDF dùng chung](ui/customer/documents.md#hướng-triển-khai-policypdf-đã-thống-nhất--31102026).
