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
- Audit phải đủ truy vết actor, hành động, tài liệu và kết quả nhưng giảm/che dữ liệu nhạy cảm. Nội dung và thời hạn lưu/xóa cần chốt trước khi ghi log/checkpoint.

- Ngoại lệ người dùng xác nhận ngày 02/11/2026: được dùng trực tiếp bản hợp đồng đã khử định danh 65 trang, bổ sung dữ liệu demo để chuẩn bị corpus Private local. Nguồn này vẫn `synthetic=false`, không gọi là sinh hoàn toàn giả lập; lưu trong `.local/private/manulife/`, chưa tự đưa Git, seed, chunk hoặc embedding. Không khôi phục định danh thật; ô bị loại chưa điền phải được coi là thiếu dữ liệu. Việc chuẩn bị bản demo không tự đồng nghĩa đã duyệt chất lượng nguồn.

- Ngoại lệ bổ sung ngày 03/11/2026: người dùng yêu cầu commit cả bản Private demo đầy đủ. Chỉ cho phép `data/private/manulife-demo-full-v1/{contract.md,README.md,manifest.json}` và README thư mục cha vào Git. Bản nguồn thật đã khử định danh vẫn `synthetic=false`, chưa human/RAG approval; không kèm PDF, ảnh, bản thô hoặc định danh thật. Ngoại lệ này thay hạn chế Git của bản demo ngày 02/11, không tự cho phép seed/chunk/embedding.

Xem [bộ Private được phép lưu Git](../data/private/manulife-demo-full-v1/README.md); các dữ liệu Private khác vẫn theo quy tắc mặc định.

<a id="customer-sensitive-data"></a>
## Bảo vệ thông tin cá nhân Customer — chuẩn bị triển khai 12/11/2026

**Trạng thái: P — đặc tả chuẩn bị, chưa triển khai masking/redaction.** API hồ sơ hiện dùng allowlist và kiểm owner/active assignment nhưng trả nguyên tên/email/phone; detail có thêm ngày sinh/địa chỉ. UI hiển thị các giá trị này trực tiếp. Không trả `citizenId`/password hash/token trong DTO hồ sơ là loại bỏ trường, khác với che một phần giá trị. Seed chung hoàn toàn synthetic; việc che dữ liệu không cho phép đưa hồ sơ thật vào seed, Git hoặc phép thử.

### Phạm vi và ma trận dữ liệu đề xuất

Core sở hữu projection theo người nhận và mục đích; Web chỉ render DTO đã được phép. Che bằng CSS, cắt chuỗi ở React hoặc giấu trong DOM không bảo vệ giá trị còn nguyên trong response. Masking không thay auth/assignment/chat grant, không phải ẩn danh không thể khôi phục và không sửa dữ liệu gốc trong DB/PDF.

| Dữ liệu | Staff list/search — P | Staff detail — P | Customer xem hồ sơ bản thân — P | Context gửi model/embedding — P |
| --- | --- | --- | --- | --- |
| Tên và mã Customer | Giữ nhãn tối thiểu để phân biệt khách trong scope; chốt mức che tên trước code | Chỉ thông tin cần cho tác vụ đã được cấp quyền | Giữ thông tin của chính chủ theo contract self-read | Dùng alias cục bộ theo lượt/hội thoại; không gửi tên/mã định danh nếu không cần cho câu hỏi |
| Email/phone | Trả giá trị đã che từ Core, không kèm bản đầy đủ | Mặc định che; quyền/mục đích xem đầy đủ phải được chốt riêng | Đề xuất giữ đầy đủ để chính chủ kiểm tra; không áp projection Staff lên self-read | Loại bỏ hoặc thay nhãn; không dùng làm khóa xác thực/tra quyền từ LLM |
| Ngày sinh/địa chỉ | Không bổ sung vào list | Đề xuất chỉ năm sinh/khu vực hoặc ẩn; không mặc định trả ngày/địa chỉ đầy đủ | Đề xuất giữ đầy đủ của chính chủ | Nếu cần tính quyền lợi, Core trả tuổi tại mốc/ngữ cảnh cần thiết thay ngày sinh hoặc địa chỉ đầy đủ; không để model suy đoán số liệu |
| CCCD/hộ chiếu, tài khoản ngân hàng, thông tin sức khỏe | Không thêm vào list | Không mở rộng DTO hiện có; trường đặc biệt cần mục đích/quyền riêng | Không tự mở API mới từ kế hoạch này | Loại định danh không cần thiết; chỉ giữ tình tiết sức khỏe cần giải đáp trong scope, không coi toàn bộ bệnh sử là dữ liệu mặc định được gửi |
| Số hợp đồng, người được bảo hiểm/người thụ hưởng trong snapshot | Rà các màn Policy/Inbox/Ticket liên quan, không chỉ Customers | Chốt projection theo tác vụ; không sửa binding/version hoặc biến null thành dữ liệu mới | Giữ kiểm ownership/exact document version | Dùng alias và giữ liên kết nguồn do code quản lý; không sửa chứng cứ gốc hoặc metadata trích dẫn |

Chưa chốt số ký tự giữ lại của email/phone/tên, độ chi tiết ngày sinh/địa chỉ, quyền xem bản đầy đủ, thời hạn hiển thị, cơ chế audit hoặc contract lỗi. Ví dụ mask nếu có chỉ dùng chuỗi synthetic; không coi định dạng minh họa là cấu hình runtime. Không tự thêm endpoint reveal, permission mới, dịch vụ DLP hoặc migration trước khi contract được review.

### Luồng xử lý cần triển khai

1. Core kiểm phiên/role/ownership/assignment hoặc transcript grant hiện hành, sau đó dựng DTO theo đích nhận. Phân biệt Customer self-read, Staff list/detail và dữ liệu nội bộ Agent; không tái sử dụng raw Prisma relation làm response.
2. Staff search vẫn phải lọc scope trước search/count/page. Search email/phone trên dữ liệu gốc có thể làm lộ giá trị qua dò tìm/count dù response đã che; cần chốt giữ, thu hẹp hay bỏ tiêu chí này và giới hạn truy vấn. Không log query string chứa email/phone hoặc đưa các giá trị đó vào analytics; rà URL/history đang giữ search trước khi chọn contract mới.
3. Trước model hoặc embedding API, code giảm/che dữ liệu trong câu hỏi tự do, lịch sử, tool output, evidence và yêu cầu tóm tắt/repair. Áp cùng quy tắc cho Customer/Staff Copilot, retry/resume; không chỉ thêm system prompt. Scope/actor/run/attempt tin cậy vẫn do code/Core giữ ngoài context model.
4. Giữ bản gốc ở nơi có quyền nghiệp vụ, tách bản dùng cho model và metadata nguồn. Nếu cần ánh xạ alias, giới hạn theo conversation/run, không log hoặc gửi bảng ánh xạ ra provider; storage/retention/quyền xem cần review cùng checkpoint. Không tự khôi phục dữ liệu đã che vào output. Không thay `documentId/version/anchor` hoặc tuyên bố đoạn đã che là trích nguyên văn; chốt cách biểu diễn phần lược bỏ trong evidence trước khi đổi schema.
5. Kiểm output trước lưu/phát: câu trả lời, summary, đề xuất Ticket, progress/error và callback không phát lại định danh bị loại không cần thiết. Nội dung Customer xác nhận tạo Ticket phải đúng bản Core sẽ lưu; không che/sửa âm thầm sau xác nhận rồi giữ nguyên hash/xác nhận cũ.
6. Rà log/audit/error trace, outbox/notification, checkpoint/cache và browser storage. Không ghi request/response/prompt nguyên khối; chỉ metadata allowlist cần thiết. Lỗi xử lý dữ liệu trước external call thì không gửi bản gốc để fallback; lỗi kiểm output thì không công bố bản chưa kiểm. Chốt mã lỗi an toàn trong contract.

**PDF và transcript:** masking profile không che nội dung PDF/signed URL, snapshot hợp đồng hoặc văn bản khách tự nhập. PDF gốc đúng phiên bản và lịch sử Customer-facing theo gate vẫn giữ cơ chế hiện có. Nếu cần bản PDF/transcript đã che cho Staff, phải đặc tả artifact/projection riêng, quyền và provenance trước triển khai; không overwrite file/version hay sửa lịch sử nguồn. Quyền xem toàn bộ lịch sử không tự đồng nghĩa được gửi toàn bộ lịch sử sang provider.

### Data model, vị trí code và thứ tự triển khai

| Phần | Vị trí hiện có cần rà từ root repo | Tác động và phần cần bổ sung |
| --- | --- | --- |
| Core profile/Staff search | `apps/core/src/customers/services/customer.service.ts`, `controllers/customer.controller.ts`, `dto/customer-query.dto.ts` | `users`/`customer_profiles`/`staff_assignments` đọc; projection và search contract thay đổi ảnh hưởng self-read lẫn Staff. Không đổi dữ liệu gốc hoặc assignment |
| Web profile/labels | `apps/web/src/lib/customer-api.ts`, `components/staff-customer-directory.tsx`, `components/customer-account.tsx` | Types/render, empty state, search/URL/history, không giữ raw ở hidden field/title/copy payload. Đồng bộ [CU01](ui/staff/plans/customers/01-assignment-read-api.md#customer-privacy-api) và [CU02](ui/staff/plans/customers/02-directory-profile-ui.md#customer-privacy-ui) |
| Policy/chat/Ticket và realtime | `apps/core/src/policies/services/policy-snapshot.ts`, `conversations/services/conversation-message.service.ts`, `tickets/services/ticket.service.ts`, `realtime/realtime.service.ts` | Rà tên/người liên quan trong DTO/snapshot/transcript; không phá owner/exact version/chat grant hoặc đưa PII vào WS event. Internal fingerprint không là payload browser |
| Agent/model boundary | `apps/agent/src/life_agent/context.py`, `core_client.py`, `graph.py`, `model.py`, `store.py` | Có graph với doubles; bộ xử lý dữ liệu, provider adapter và durable store còn P. Áp trước mọi model/embedding call và khi kiểm output; rà parent/ref expansion và indexing khi retrieval được triển khai |
| Kiểm thử | `apps/core/test/customers.test.cjs`, `apps/web/tests/browser/staff-customers.spec.mjs`, `staff-foundation.integration.spec.mjs`, `apps/agent/tests/test_context.py`, `test_graph.py`, `test_handoff_summary.py` | Mở rộng suite đúng owner; dùng synthetic canary để chứng minh raw không vượt ranh giới. Chưa có kết quả test masking |

Mức ảnh hưởng **cao**: đổi API projection/client types, tìm kiếm, bằng chứng và content xác nhận. Thứ tự: chốt ma trận + search/quyền xem đầy đủ → Core projection và DTO → Web và các caller → Agent outbound/output → hồi quy xuyên module. Các phần độc lập có thể thiết kế bằng fake; không tự cấp quyền chạy provider trả phí/corpus Private từ tài liệu này.

**Migration:** che response/context không tự cần DDL. Chỉ đánh giá migration mới nếu đã chọn lưu mapping alias/audit xem đầy đủ/policy version; ghi rõ owner, retention và transaction trước code. Không thêm cột masked song song chứa dữ liệu có thể lệch bản gốc, không sửa migration đã apply/reset volume hoặc rewrite checkpoint cũ tự động.

### Tiêu chí kiểm thử và điều kiện hoàn tất — chưa chạy

- [ ] Core: raw email/phone/ngày sinh/địa chỉ không tồn tại trong JSON Staff ngoài trường đã duyệt; list/detail đúng role/scope, null/chuỗi ngắn/Unicode xử lý an toàn, Customer self-read không đổi ngoài contract đã chốt.
- [ ] Search: kiểm dò tìm qua substring/count, ngoài assignment, quota và query log; không coi masking response đã giải quyết rò rỉ search. Không đưa synthetic canary vào URL/log ngoài kỳ vọng kiểm thử.
- [ ] Web: kiểm DOM/accessibility tree, network response và state/copy/tooltip; không thể khôi phục raw bằng bỏ CSS. Revoke/logout/đổi Customer xóa state, response đến muộn không lộ dữ liệu cũ; không screenshot.
- [ ] Agent: canary trong user message/history/tool/evidence/table/summary/repair không xuất hiện ở fake model/embedding request, output/callback/log không phát lại. Alias ổn định trong scope, khác Customer không dùng chung mapping; lỗi processor không gửi raw, retry/resume không bypass.
- [ ] Bằng chứng/Ticket: vẫn truy được document/version/anchor; giữ tình tiết nghiệp vụ cần thiết và phân biệt phần đã che. Nội dung/hash xác nhận khớp bản commit; test nhận diện bỏ sót/che nhầm, không tuyên bố bảo vệ ngữ nghĩa tuyệt đối từ regex hoặc prompt.
- [ ] E2E gateway/Core/browser dùng fixture cô lập: Staff/Customer, search/detail, Policy/Inbox/Ticket callers và revoke. Chỉ nghiệm thu sau assertions API/network và Agent boundary; có file code hoặc test mock không chứng minh đã bảo vệ dữ liệu thật/cloud.

## Đồng bộ UI và dữ liệu local — 04/11/2026

[Checklist UI/gap](ui/implementation-status.md) theo dõi phần đã nối API và placeholder. UI không giữ fixture policy/Ticket/Claim như kết quả thật; dữ liệu thiếu không biến thành 0 hoặc xác nhận chi trả. Customer/Staff dev fixtures ở `apps/core/src/cli/dev-accounts.ts`; bootstrap đã có policy/PDF synthetic và corpus Markdown đã chuẩn bị riêng. Chat hai đầu I01–I06, handoff notification và Staff Ticket TK01–TK05 đã có; producer/xác nhận Ticket từ Agent I07 còn kế hoạch. Dữ liệu/RAG do nhánh riêng phụ trách, không coi fixture app là bằng chứng retrieval.

Policy dùng model InsurancePolicy/bảng insurance_policies; không sửa tên trong migration lịch sử. WebSocket local gửi invalidation account/profile/assignment và I06 chat/scope/notification, không payload Private; Web đọc lại REST theo quyền. Không ghi cookie/CSRF/URL xem tài liệu vào log sự kiện hay browser storage. Các artifact kiểm tra local không thay test suite được quản lý trong repo.

## Chuẩn bị policy và PDF local — 31/10/2026, đã có storage Docker

- Policy/product và metadata Document/DocumentVersion nằm trong DB; PDF gốc theo version nằm trong object storage private S3-compatible. Trang Web đọc thông tin cấu trúc từ Core và xem/tải PDF gốc; không đặt PDF riêng trong Next public hoặc Git.
- Chỉ seed dữ liệu sinh hoàn toàn giả lập có nhãn mô phỏng trong cả UI/file. Mẫu cần khách không có/một/nhiều policy, nhiều tài liệu/phiên bản và trạng thái null/thiếu PDF. Không lấy hợp đồng thật che tên hoặc kết hợp thông tin thật để làm fixture.
- Docker đã có MinIO Community AGPL-3.0 build source pin commit/checksum/base digest, bucket `life-insurance-documents` private, data volume và root/reader/writer credential volumes riêng. Prepare không rotate credential; dữ liệu đã có nhưng thiếu credential thì dừng để khôi phục. Init chạy lại giữ object. Reader chỉ GetObject; writer đọc/ghi/multipart trong bucket, không xóa/quản trị. Core runtime đã mount reader cho Staff PDF API; job seed giữ writer riêng. Agent/Web không nhận storage writer credential. `storage:credentials` xuất console root credential vào thư mục dữ liệu người dùng ngoài repo (`storage/console.json`), không log giá trị. Chỉ local, chưa tạo AWS S3/cloud.
- Metadata chỉ công bố khi file đã nạp/kiểm checksum thành công. DB và storage không atomic cùng nhau; cần manifest/định danh ổn định và retry/reconcile không tạo trùng hoặc ghi đè version cũ. Không tự sửa dữ liệu người dùng đã đổi khi seed lại.
- Không lưu URL ký trong DB như địa chỉ tài liệu bền vững; lưu bucket/key/version/checksum theo contract, chỉ cấp quyền truy cập sau auth. Không log nội dung PDF, credential hoặc URL ký. PDF/volume/cache/bản xuất vẫn ở local/kho dữ liệu bị ignore.
- Mapping policy–phiên bản điều khoản, loại tài liệu và dữ liệu snapshot phát hành cần rà schema/DTO; không tự lấy tài liệu mới nhất hoặc coi app version là S3 versionId. Chi tiết tại [Policy/PDF dùng chung](ui/customer/plans/05-documents-contract.md#hướng-triển-khai-policypdf-đã-thống-nhất--31102026).
