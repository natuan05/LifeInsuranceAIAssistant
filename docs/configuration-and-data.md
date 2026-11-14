# Cấu hình, secrets và dữ liệu

## Cấu hình

- Cấu hình local tập trung trong `.env` root theo `.env.example`; Compose chỉ truyền biến cần thiết cho từng service. Credential runtime vẫn tách volume và role, không gộp quyền giữa các thành phần.
- Không tạo lại env riêng cho Web/Core. `.env.example` ghi biến bắt buộc, bên sử dụng và giá trị synthetic local đã được cho phép; secrets thật vẫn ngoài Git.
- `.env` và các biến thể thật không được commit. `.gitignore` đã loại chúng, chỉ cho phép mẫu có hậu tố `.example` theo quy ước trên.
- Baseline local đã chốt Node/npm và npm workspaces Web/Core, dùng một package-lock.json root. Phiên bản/lệnh chuẩn ở [getting-started](getting-started.md); không tạo lockfile riêng từng app. Không áp dụng các lựa chọn AI/cloud đề xuất thành mặc định.
- Tách cấu hình local/PoC và production. Không đưa ngưỡng timeout, số chiều embedding hoặc sizing đang đề xuất thành mặc định.

## Secrets

- Không ghi API key, password, token, private key, connection string có mật khẩu hoặc URL đã ký vào Git, prompt, fixture, ảnh chụp hay log. Ngoại lệ được người dùng duyệt cho đúng 5 tài khoản synthetic dev ở [dev accounts](getting-started.md#dev-accounts) và bộ DB/MinIO synthetic local cố định trong [.env.example](../.env.example)/[tài khoản hạ tầng local](getting-started.md#local-infrastructure-accounts). Không áp dụng với credential ngẫu nhiên hiện có, operator, cloud hoặc dữ liệu thật.
- FE/BE local chỉ chạy Docker Compose. `.env` root cấu hình cổng, Core/CORS/Swagger, build args công khai của Web, MinIO và credential khởi tạo tùy chọn; `.env.example` có cấu hình mặc định, biến tùy chọn trống và đúng bộ credential DB/MinIO synthetic local đã được cho phép. `.env` thật bị Git/build ignore; không chia sẻ đầu ra `docker compose config` có secret. Runtime vẫn mount credential từ named volumes tách role; prepare từ chối khi env không khớp volume cũ, không rotate ngầm. File riêng tư của tool host ở thư mục dữ liệu người dùng ngoài repo: `%LOCALAPPDATA%/LifeInsuranceAIAssistant` trên Windows, Application Support trên macOS, XDG state trên Linux. Không tạo `.local` trong repo cho runtime. Cloud dùng cấu hình dịch vụ và quản lý secrets khi triển khai.
- Frontend chỉ nhận cấu hình công khai cần thiết. Biến `NEXT_PUBLIC_*` phải được coi là công khai; model key và DB credential chỉ ở phía server có thẩm quyền.
- Tách quyền Core business, retrieval chỉ đọc, chuẩn bị dữ liệu và checkpoint. Không tái dùng credential quản trị cho ứng dụng.
- Compose local sinh credential vào named volumes riêng theo role; chỉ job prepare/bootstrap được truy cập bộ credential để khởi tạo. Runtime chỉ mount volume cần dùng. DB đã có dữ liệu nhưng thiếu credential volume thì khôi phục volume gốc; không sinh/rotate ngầm. Không đưa credential volumes vào image hoặc bản chia sẻ repo.
- `.gitignore` chỉ giảm lỗi đưa nhầm file, không phát hiện hết secrets. Rà soát diff trước mỗi commit; nếu lộ bí mật phải thu hồi/đổi bí mật và xử lý lịch sử liên quan.

## Dữ liệu

| Loại | Nơi quản lý | Có đưa vào Git? |
| --- | --- | --- |
| Nguồn/manifest tài liệu công khai | `data/public/` | Manifest nhỏ đã rà soát |
| Bản trích Markdown công khai của bộ Manulife | `data/public/manulife/text/` | Được người dùng cho phép ngày 27/10/2026; kèm nguồn, trang, checksum và trạng thái kiểm tra |
| Fixture sinh hoàn toàn giả lập | `data/synthetic/` | Chỉ mẫu nhỏ đã rà soát, có nhãn synthetic |
| PDF, chunks, embeddings, bộ dữ liệu lớn | Docker volumes hoặc kho dữ liệu ngoài Git | Không |
| DB volume/dump, checkpoint, log, bản xuất hội thoại | Docker volumes hoặc kho vận hành ngoài repo | Không |
| Tài liệu trao đổi gốc | Thư mục trao đổi bên ngoài repo | Không tự sao chép vào repo |

- Không dùng khách hàng/hợp đồng thật, kể cả bản che tên. Gửi LLM phần dữ liệu tối thiểu cần thiết.
- Ngoại lệ chuyển đổi được người dùng xác nhận ngày 28/10/2026: được tạo Markdown đã loại danh tính/số liệu từ một hợp đồng thật để tham khảo cấu trúc, chỉ lưu `.local/private/manulife/`. Bản này vẫn có nguồn gốc thật, không là fixture synthetic, không đưa vào Git/corpus MVP/embedding. Giá trị cá nhân dùng nhãn đã loại; không tự dựng số liệu nghiệp vụ mới. Chỉ chuyển phần ảnh đã khử định danh hoặc nội dung chung cần thiết cho lượt đọc ảnh; không phát định danh vào log/báo cáo.
- Manifest phải truy vết nguồn, phiên bản và checksum. Chunks phải khớp PDF, hợp đồng và phiên bản được Core cấp.
- Lưu định danh model, phiên bản và số chiều cho mỗi index khi chọn embedding. Đổi model cần đánh giá và dựng lại index; cùng số chiều chưa đủ bảo đảm tương thích.
- Checkpoint, vector và log có thể mang nội dung Private; bảo vệ như dữ liệu nguồn. Không chia sẻ cache Private giữa khách hàng.
- Audit dùng metadata allowlist để truy vết actor, hành động, tài liệu và kết quả. Dữ liệu khôi phục/checkpoint Agent trong MVP giữ theo A ngày 14/11 tại [chính sách lưu](#mvp-agent-recovery-retention). Thời hạn log/audit/cache và chính sách production tiếp tục theo review riêng.

- Ngoại lệ người dùng xác nhận ngày 02/11/2026: được dùng trực tiếp bản hợp đồng đã khử định danh 65 trang, bổ sung dữ liệu demo để chuẩn bị corpus Private local. Nguồn này vẫn `synthetic=false`, không gọi là sinh hoàn toàn giả lập; lưu trong `.local/private/manulife/`, chưa tự đưa Git, seed, chunk hoặc embedding. Không khôi phục định danh thật; ô bị loại chưa điền phải được coi là thiếu dữ liệu. Việc chuẩn bị bản demo không tự đồng nghĩa đã duyệt chất lượng nguồn.

- Ngoại lệ bổ sung ngày 03/11/2026: người dùng yêu cầu commit cả bản Private demo đầy đủ. Chỉ cho phép `data/private/manulife-demo-full-v1/{contract.md,README.md,manifest.json}` và README thư mục cha vào Git. Bản nguồn thật đã khử định danh vẫn `synthetic=false`, chưa human/RAG approval; không kèm PDF, ảnh, bản thô hoặc định danh thật. Ngoại lệ này thay hạn chế Git của bản demo ngày 02/11, không tự cho phép seed/chunk/embedding.

Xem [bộ Private được phép lưu Git](../data/private/manulife-demo-full-v1/README.md); các dữ liệu Private khác vẫn theo quy tắc mặc định.

<a id="mvp-chat-history-retention"></a>
**Lịch sử chat MVP — A đã chốt ngày 14/11/2026.** Core lưu Conversation/Message để người dùng xem lại, chưa tự động xóa theo thời gian trong giai đoạn MVP. Mở New AI chat vẫn giữ lịch sử cuộc cũ, quyền đọc/gửi theo owner, session và grant/phân công hiện hành.

Phạm vi là lịch sử hội thoại do Core quản lý. Notification tiếp tục có retention 30 ngày theo N01/N02. Dữ liệu khôi phục Agent giữ trong MVP theo quyết định A bên dưới. Cache/log/audit và chính sách production còn cần chốt thời hạn riêng. Fixture kiểm thử cô lập được dọn theo quy trình từng suite. Chính sách MVP này chưa xác định thời hạn lưu/xóa khi triển khai production.

<a id="mvp-agent-recovery-retention"></a>
**Dữ liệu khôi phục Agent trong MVP — A đã chốt 14/11/2026.** Giữ checkpoint, biên nhận xử lý và kết quả/sự kiện do Agent lưu để khôi phục, chống trùng và đối soát, gồm dữ liệu đã giao/ACK. MVP chưa đặt TTL hoặc lịch tự xóa các bản ghi này theo thời gian. Quyền đọc/ghi, trạng thái run/attempt, writer fence và điều kiện giao lại tiếp tục theo protocol.

ACK và dữ liệu được giữ cho đối soát. Pending delivery tiếp tục lọc trạng thái ACK, lượt FAILED không tự chạy lại từ dữ liệu còn lưu. Ledger/budget và metadata cần để khôi phục/replay theo cùng vòng đời dữ liệu hỗ trợ. Notification theo retention 30 ngày, nonce HMAC theo cửa sổ đã chốt, lease/deadline theo vòng đời hiện hành. Log/audit/cache và chính sách production còn cần chốt thời hạn riêng. Fixture kiểm thử cô lập tiếp tục được dọn theo quy trình từng suite.

<a id="customer-sensitive-data"></a>
## Bảo vệ thông tin cá nhân Customer — chuẩn bị triển khai

**Code hiện tại:** API giữ owner/active assignment, tách Staff DTO và che email/phone mặc định; Hiện/Ẩn từng trường qua API riêng. Staff search chỉ tên/mã; birthYear/provinceCity trả null khi chưa có nguồn xác minh. Customer self-read giữ nguyên.

### Phạm vi và ma trận dữ liệu: đã chốt và còn đề xuất

Core dựng DTO theo người nhận; Web render DTO đó. Mask bằng CSS không bảo vệ dữ liệu còn nguyên trong response. Customer self-read giữ contract riêng; masking không thay quyền tài nguyên hoặc sửa DB/PDF gốc.

| Dữ liệu | Staff list/search | Staff detail | Customer self-read |
| --- | --- | --- | --- |
| Họ tên/mã Customer | Hiển thị đầy đủ trong active assignment; search chỉ fullName/accountCode | Hiển thị đầy đủ theo quyền | Contract hiện có |
| Email/phone | Che mặc định; Hiện/Ẩn khi cần liên hệ | Cùng policy mặc định/reveal | Contract hiện có |
| Ngày sinh/địa chỉ | Không thêm vào list | Chỉ năm sinh và tỉnh/thành đã xác minh; thiếu căn cứ trả null/ẩn từng trường | Contract hiện có |
| CCCD/hộ chiếu, tài khoản ngân hàng, sức khỏe | Không mở rộng DTO | Trường đặc biệt cần mục đích/quyền riêng | Không tự mở API mới |
| Số hợp đồng | Hiển thị đầy đủ theo gate Policy/Inbox/Ticket | Cùng phạm vi được cấp quyền | Ownership/exact version |
| Người được bảo hiểm/thụ hưởng | Rà caller Policy/Inbox/Ticket | Projection theo tác vụ còn cần chốt | Ownership/exact version |

**Định dạng che:** email giữ ký tự đầu + `***`, che cả domain; phone `***` + hai chữ số cuối. Ví dụ synthetic `minh@example.test` → `m***`, `0900000012` → `***12`. Thiếu giữ null; quá ngắn để vừa giữ vừa che thì `***`. Phần phone giữ lại lấy từ chữ số nguồn. Kiểm Unicode/null/chuỗi ngắn tại CU01-T06.

**Năm sinh/tỉnh-thành:** DTO Staff dùng `birthYear: number|null`, `provinceCity: string|null`, thay raw birth/address. Không suy từ tuổi/LLM, không cắt địa chỉ tự do hoặc coi non-null là đã xác minh. Schema chưa có tỉnh/thành và metadata xác minh; Hiện Core trả null từng trường; việc thêm nguồn xác minh/persistence cần đặc tả riêng.

<a id="staff-contact-reveal"></a>
**Hiện/Ẩn liên hệ — đã triển khai tại Customers:** áp dụng từng trường email/phone, cả contact card tại Customers/Policy/Inbox/Ticket. Core kiểm lại session/role/assignment/quyền Customer khi bấm, chỉ trả trường được yêu cầu qua response no-store. Audit chỉ metadata actor/Customer/trường/thời điểm/kết quả/requestId, không ghi giá trị liên hệ.

UI chỉ tạo copy/mailto/tel từ response reveal hợp lệ. Raw chỉ nằm trong state contact đang mở; xóa khi Ẩn, đổi Customer, logout hoặc revoke. Không lưu URL/browser storage/cache dùng chung. Response muộn phải khớp Customer/request và quyền hiện hành. CU01-T07/CU02-T06 sở hữu kiểm thử.

<a id="staff-policy-number"></a>
**Số hợp đồng cho Staff — A đã chốt 14/11/2026:** hiển thị đầy đủ policyNumber trong scope, khớp source hiện tại. PL01/PL03/PL05 và TK02/TK04 giữ hồi quy khi thay projection liên hệ.

**Dữ liệu gửi model — B:** dùng sáu quy tắc system prompt và dữ liệu synthetic theo [chính sách Agent](specifications/Agent_Design.md#mvp-model-data-policy). Không bổ sung bộ lọc định danh bằng code. Prompt không phải cơ chế che dữ liệu; quyền reveal Staff phục vụ liên hệ trên UI.

### Luồng xử lý

1. Core kiểm session/role/ownership/assignment hoặc transcript grant, dựng projection đúng người nhận. Không trả raw Prisma relation.
2. Search chỉ fullName/accountCode; bỏ email/phone khỏi predicate, Swagger và gợi ý Web. Giữ scope trước count/page, trim/literal/case-insensitive/quota. Token chỉ khớp email/phone không trả Customer hoặc tăng total; URL query cũ cũng chỉ so tên/mã. Không log raw search.
3. Web/types và caller dùng projection đã duyệt; bổ sung reveal/cleanup. Log/audit/error/outbox/WS chỉ metadata allowlist cần thiết, không nguyên khối prompt/request/response.

**PDF và transcript:** che profile không che PDF, signed URL, snapshot hoặc văn bản khách nhập. Giữ phiên bản gốc và gate đọc hiện hành; không overwrite tài liệu/lịch sử. Quyền xem history không tự cho phép gửi toàn bộ history sang model.

### Data model, vị trí code và thứ tự triển khai

| Phần | Vị trí từ root repo | Phạm vi |
| --- | --- | --- |
| Core | `apps/core/src/customers/services/customer.service.ts`, `controllers/customer.controller.ts`, `dto/customer-query.dto.ts` | Projection Staff/self-read, search, reveal/audit; users/customer_profiles/staff_assignments |
| Web | `apps/web/src/lib/customer-api.ts`, `components/staff-customer-directory.tsx`, `components/customer-account.tsx` | DTO, Hiện/Ẩn và cleanup theo [CU01](ui/staff/plans/customers/01-assignment-read-api.md#customer-privacy-api)/[CU02](ui/staff/plans/customers/02-directory-profile-ui.md#customer-privacy-ui) |
| Caller | `apps/core/src/policies/services/policy-snapshot.ts`, `conversations/services/conversation-message.service.ts`, `tickets/services/ticket.service.ts`, `realtime/realtime.service.ts` | Cùng projection/gate, không phá binding/version/transcript grant |
| Agent | `apps/agent/src/life_agent/prompts.py`, `context.py`, `graph.py`, `model.py` | System prompt/quyền/scope/Finalize theo phạm vi B |

Thứ tự kỹ thuật: đặc tả nguồn xác minh → Core projection/search/reveal → Web và caller → hồi quy synthetic. Che response không tự cần DDL; nguồn xác minh nếu cần persistence phải review migration trong CU01. Không thêm cột masked song song, reset volume hoặc sửa dữ liệu gốc. Phase 1 đã triển khai projection/search/reveal và UI Customers; Policy/Inbox/Ticket hiện chỉ dùng tên/mã ở DTO Customer, không có contact card nhận raw hồ sơ.

### Tiêu chí kiểm thử và điều kiện hoàn tất

- [x] Đã chốt phạm vi hiển thị, định dạng che, Hiện/Ẩn liên hệ, search và năm sinh/tỉnh-thành như trên.
- [x] CU01-T05/T06/T07 và CU02-T06: projection, nguồn xác minh, Unicode/null/chuỗi ngắn, search/count/scope, reveal/audit/no-store, lỗi và response muộn.
- [ ] PL01-T05 cùng caller Policy/Inbox/Ticket: số hợp đồng đầy đủ đúng scope, contact mặc định che.
- [x] Browser/API: raw không có trong DTO/DOM/tooltip/copy trước reveal; hide/revoke/logout/đổi Customer xóa state.
- [x] Phase 0–2 hồi quy gateway/Core/browser Customers, policy PDF và Ticket bằng fixture synthetic cô lập theo [Getting Started](getting-started.md#phase-0-tests).
- [ ] Nghiệm thu Agent tích hợp về sáu quy tắc prompt/quyền/contract; ngoài Phase 0–2. Không coi test DTO hoặc prompt là nghiệm thu che PDF hay bộ lọc model.

## Đồng bộ UI và dữ liệu local — 04/11/2026

[Checklist UI/gap](ui/implementation-status.md) theo dõi phần đã nối API và placeholder. UI không giữ fixture policy/Ticket/Claim như kết quả thật; dữ liệu thiếu không biến thành 0 hoặc xác nhận chi trả. Customer/Staff dev fixtures ở `apps/core/src/cli/dev-accounts.ts`; bootstrap đã có policy/PDF synthetic và corpus Markdown đã chuẩn bị riêng. Chat hai đầu I01–I06, handoff notification và Staff Ticket TK01–TK05 đã có; Customer Ticket đã có source API/UI cho tạo thủ công và draft/edit/confirm; I07 theo dõi lỗi review và tích hợp nguồn Agent. Dữ liệu/RAG do nhánh riêng phụ trách, không coi fixture app là bằng chứng retrieval.

Policy dùng model InsurancePolicy/bảng insurance_policies; không sửa tên trong migration lịch sử. WebSocket local gửi invalidation account/profile/assignment và I06 chat/scope/notification, không payload Private; Web đọc lại REST theo quyền. Không ghi cookie/CSRF/URL xem tài liệu vào log sự kiện hay browser storage. Các artifact kiểm tra local không thay test suite được quản lý trong repo.

## Chuẩn bị policy và PDF local — 31/10/2026, đã có storage Docker

- Policy/product và metadata Document/DocumentVersion nằm trong DB; PDF gốc theo version nằm trong object storage private S3-compatible. Trang Web đọc thông tin cấu trúc từ Core và xem/tải PDF gốc; không đặt PDF riêng trong Next public hoặc Git.
- Chỉ seed dữ liệu sinh hoàn toàn giả lập có nhãn mô phỏng trong cả UI/file. Mẫu cần khách không có/một/nhiều policy, nhiều tài liệu/phiên bản và trạng thái null/thiếu PDF. Không lấy hợp đồng thật che tên hoặc kết hợp thông tin thật để làm fixture.
- Docker đã có MinIO Community AGPL-3.0 build source pin commit/checksum/base digest, bucket `life-insurance-documents` private, data volume và root/reader/writer credential volumes riêng. Prepare không rotate credential; dữ liệu đã có nhưng thiếu credential thì dừng để khôi phục. Init chạy lại giữ object. Reader chỉ GetObject; writer đọc/ghi/multipart trong bucket, không xóa/quản trị. Core runtime đã mount reader cho Staff PDF API; job seed giữ writer riêng. Agent/Web không nhận storage writer credential. `storage:credentials` xuất console root credential vào thư mục dữ liệu người dùng ngoài repo (`storage/console.json`), không log giá trị. Chỉ local, chưa tạo AWS S3/cloud.
- Metadata chỉ công bố khi file đã nạp/kiểm checksum thành công. DB và storage không atomic cùng nhau; cần manifest/định danh ổn định và retry/reconcile không tạo trùng hoặc ghi đè version cũ. Không tự sửa dữ liệu người dùng đã đổi khi seed lại.
- Không lưu URL ký trong DB như địa chỉ tài liệu bền vững; lưu bucket/key/version/checksum theo contract, chỉ cấp quyền truy cập sau auth. Không log nội dung PDF, credential hoặc URL ký. PDF/volume/cache/bản xuất vẫn ở local/kho dữ liệu bị ignore.
- Mapping policy–phiên bản điều khoản, loại tài liệu và dữ liệu snapshot phát hành cần rà schema/DTO; không tự lấy tài liệu mới nhất hoặc coi app version là S3 versionId. Chi tiết tại [Policy/PDF dùng chung](ui/customer/plans/05-documents-contract.md#hướng-triển-khai-policypdf-đã-thống-nhất--31102026).
