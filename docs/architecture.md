# Kiến trúc nền

Ranh giới ban đầu ngày 24/10/2026; đối chiếu implementation local **30/10/2026**. Đây là nền để phát triển tiếp, chưa phải hệ thống nghiệp vụ/AI hoàn chỉnh. Xem [nguồn và trạng thái quyết định](source-review.md).

## Phân chia trách nhiệm

| Phần | Sở hữu | Không được vượt ranh giới |
| --- | --- | --- |
| Web | Customer Portal, Staff Workspace và tương tác người dùng | Không tự cấp quyền, truy cập DB hoặc gọi Agent trực tiếp |
| Core | Danh tính ứng dụng, authorization, business, hội thoại, Ticket và quyền tài liệu | Không ủy thác quyết định quyền hoặc giao dịch cho LLM |
| Agent | Điều phối LangGraph, retrieval, gọi tool và tổng hợp bằng chứng | Không truy cập business DB; không tự mở rộng quyền |
| Retrieval trong Agent | Tìm Public/Private trong phạm vi được cấp | Không tự xác định ownership hoặc trả chunk ngoài quyền |

Frontend → Core → Agent là đường điều phối dự kiến. Agent → Business API của Core là đường truy cập nghiệp vụ. Giao thức cụ thể chưa chốt.

## Quyền và bằng chứng

- Danh tính lấy từ phiên đã xác thực. Core kiểm tra quyền ở từng API/tool call; Customer theo ownership, Staff theo phân công hiện hành.
- Core cấp phạm vi tài liệu và phiên bản. Retrieval áp dụng phạm vi trước khi trả bằng chứng, kể cả khi mở rộng ngữ cảnh hoặc thử lại.
- Thiếu quyền hoặc không xác minh được thì không truy xuất Private. Cách phân biệt lỗi quyền, scope rỗng và không đủ bằng chứng cần chuẩn hóa trong contract.
- Khi mở PDF, Core kiểm tra lại quyền và cấp quyền xem có hạn cho đúng phiên bản. Không lưu URL đã ký vào tin nhắn.
- Bằng chứng sản phẩm công khai giải thích quy tắc chung. Thông tin cá nhân phải dựa trên hợp đồng đúng phiên bản và dữ liệu Core đã xác thực.
- Thiếu căn cứ thì hỏi lại hoặc chuyển Staff. AI không phê duyệt Claim, cam kết chi trả hoặc tự tính số liệu nghiệp vụ.

## Trạng thái và thao tác ghi

- Core giữ lịch sử hội thoại và trạng thái tiếp quản. Agent giữ trạng thái graph bền vững để có thể tiếp tục sau gián đoạn.
- Quyền đọc RAG và quyền ghi checkpoint phải tách khỏi quyền business. Backend lưu checkpoint, schema, role và quy tắc lưu/xóa chưa chốt.
- Phiên Runtime không thay thế checkpoint bền vững. Cần chốt ánh xạ actor/hội thoại/thread và hành vi resume khi quyền hoặc người tiếp quản thay đổi.
- Agent chỉ đề xuất Ticket. Core phải xác minh xác nhận hợp lệ gắn với nội dung được duyệt, kiểm tra quyền và chống trùng trước khi ghi.
- Theo SRS UC-005, Ticket và outbox được ghi cùng giao dịch; chỉ báo thành công sau commit. Thông báo lỗi không làm mất Ticket đã lưu. Queue và cách phát lại còn cần thiết kế.
- Staff tiếp quản phải ngăn thao tác ghi từ Agent đang chạy dở. Cơ chế xử lý đồng thời còn mở; không dựa riêng vào việc hủy giao diện chat.

## Lưu trữ và triển khai

PostgreSQL + pgvector dùng local trước. Cập nhật 25/10/2026: đã có Compose Core/Web/Nginx/PostgreSQL/DbGate và migration cho business/rag theo yêu cầu tạo toàn bộ model nguồn; Core runtime không có quyền rag. Đã có API đọc hồ sơ Customer và danh sách/chi tiết theo assignment cho Staff; xem [phạm vi quyền đọc](architecture.md#local-api). Các bảng còn lại không đồng nghĩa đã có API nghiệp vụ hoặc retrieval. Xem [data models](architecture.md#local-data-model) và [ADR local stack](architecture.md#local-data-model). PDF/index vẫn chuẩn bị ngoài ứng dụng với dữ liệu riêng giả lập; chưa chọn chiều embedding.

AWS đã chọn. RDS, ECS + EC2 và AgentCore Runtime là hướng triển khai, chưa phải tài nguyên đã dựng. Redis/BullMQ đang được cân nhắc. Model, embedding và tự host chưa chốt.

Roadmap mở rộng là kịch bản thiết kế, không phải kết quả benchmark hoặc cam kết SLO. Đợt này không dựng topology production.

### Hướng Policy/PDF được xác nhận ngày 31/10/2026 — đã có nền storage local

Người dùng xác nhận triển khai thông tin hợp đồng và bản PDF cho cả Customer/Staff theo ba lớp: PostgreSQL lưu nghiệp vụ cùng metadata/ownership/version/checksum; object storage private lưu PDF gốc; Web hiển thị trang thông tin từ DB, viewer trong app và hai thao tác Xem PDF/Tải PDF. Không bắt buộc sao chép toàn bộ văn bản PDF vào DB hoặc một trang HTML khác. PDF hợp đồng cá nhân, điều khoản chung và phụ lục phải được phân biệt, gắn đúng phiên bản áp dụng.

Core kiểm quyền Customer theo ownership, Staff theo active assignment khi list/detail/catalog và cấp quyền xem/tải; browser không nhận storage credentials, Agent không tự cấp quyền. Đã dựng MinIO local bằng Compose: volume bền vững, bucket private, root/reader/writer tách credential và quyền. Community AGPL-3.0 build source release 2025-10-15 tại commit `9e49d5e7a648f00e26f2246f4dc28e6b07f8c84a`, mc release 2025-08-13 tại commit `7394ce0dd2a80935aded936b09fa12cbb3cb8096`; pin source checksum/base digest. Service chạy non-root, cổng 9000/9001 chỉ publish loopback. Job prepare/init chạy lại giữ credential/object. `storage:check` đã pass quyền/private/signed Range/CORS và restart persistence. Chưa nối SDK S3 vào Core, chưa policy/PDF API, fixture hay viewer; chỉ local, chưa tạo cloud. Xem [hướng dẫn storage](getting-started.md#35-storage-minio-local).

Luồng local đã chọn: Core kiểm quyền rồi cấp signed URL, browser đọc trực tiếp từ MinIO; inline để xem, attachment để tải, TTL local mặc định 15 phút có cấu hình. Range/headers/CORS/CSP và audit phải kiểm chứng. Signed URL đã cấp không tự mất hiệu lực ngay khi logout/đổi assignment; không hứa thu hồi file đã tải. DocumentVersion gắn nội dung ổn định, không ghi đè object/version cũ hoặc tự lấy currentVersion thay phiên bản hợp đồng. Mapping loại tài liệu và policy–terms/version cần rà schema/migration trước triển khai. Khi chuyển sang AWS S3 giữ contract/nghiệp vụ, thay cấu hình/IAM, copy object và kiểm checksum, chạy lại compatibility tests; không triển khai AWS ở đợt local.

Seed phải sinh hoàn toàn synthetic cả policy lẫn PDF; job chuẩn bị file tách luồng người dùng và quyền runtime, kiểm checksum/mapping, retry/reconcile an toàn giữa DB và object storage. Không thêm upload/ingestion UI, Agent/RAG hay workflow chat trong đợt policy read/PDF. Đặc tả và checklist dùng chung tại [Customer/Staff Policy/PDF](ui/customer/documents.md#hướng-triển-khai-policypdf-đã-thống-nhất--31102026); UI dùng Tailwind và không reload document khi xem/chọn/tải tài liệu.

Nguồn kỹ thuật đã đọc: [LangGraph persistence](https://docs.langchain.com/oss/python/langgraph/persistence) phân biệt checkpoint theo thread với bộ nhớ dùng qua nhiều thread; [AgentCore sessions](https://docs.aws.amazon.com/bedrock-agentcore/latest/devguide/runtime-sessions.html) mô tả vòng đời môi trường phiên. Các nguồn này không tự quyết định backend checkpoint cho dự án.

## Baseline local đang áp dụng

Cập nhật 25/10/2026. Các ADR local 0002–0007 đã được hợp nhất vào phần này và hướng dẫn docs/getting-started.md theo yêu cầu dọn tài liệu. Đây là quyết định cho phần đã triển khai local, không phê duyệt các ADR-AI/cloud đề xuất trong tài liệu nguồn.

<a id="local-runtime"></a>
### Runtime và đóng gói

- npm workspaces Web/Core, một lockfile root; Node 24.18.0/npm 11.16.0, Next 16.4.3/React 19.3.1, Nest 12.2.0, TypeScript 6.0.2. Không thêm shared package/build runner.
- `.env` root là đầu mối cấu hình: Compose nội suy cổng, runtime Core, build args Web và MinIO; `.env.example` có cấu hình mặc định và bộ credential DB/MinIO synthetic local cố định được phép chia sẻ. Máy mới copy mẫu dùng bộ này; có thể thay trong `.env` riêng hoặc để trống để sinh một lần. Prepare kiểm khớp volume cũ, từ chối xung đột và không rotate ngầm. Chỉ job chuẩn bị nhận credential tương ứng; Web không nhận secret. Không `env_file` toàn bộ secret vào mọi service.
- Region S3-compatible local mặc định là `ap-southeast-1` để thống nhất Singapore; MinIO vẫn lưu dữ liệu trên máy. Việc này không tạo tài nguyên AWS hoặc quyết định topology cloud. SDK ký URL khi triển khai phải dùng cùng region với storage.
- Root Compose có Web/Core/Nginx/PostgreSQL/DbGate/MinIO. FE/BE local chỉ chạy trong Docker, đi qua gateway 8080; Web/Core không publish host port. Nginx có thêm listener 81, publish loopback 8081 cho Swagger và API Try it out cùng origin; SWAGGER_PORT đổi cổng host và allowlist tương ứng. Đã bỏ helper/command chạy Web/Core trên host và dependency concurrently; npm còn dùng cho build/check/tool quản trị. Cấu hình và lệnh dùng trong [hướng dẫn sử dụng](getting-started.md).
- DbGate thay pgAdmin, kết nối tự động bằng role chỉ đọc. Prepare/bootstrap/migrate/seed tách job; credential volumes tách role, consumer mount readonly. Prepare không bind mount hoặc tạo .local trong repo; DB đã có nhưng mất credential thì dừng để khôi phục, không tự sinh password mới.
- Docker seed image riêng; Core public runtime không có seed CLI, admin entrypoint hoặc UI tool. Tool admin chạy host, không được gateway proxy.
- File operator và bản xuất tài khoản MinIO của tool host nằm ngoài repo theo thư mục dữ liệu người dùng (`%LOCALAPPDATA%/LifeInsuranceAIAssistant` trên Windows). Helper nâng cấp sao chép operator cũ khi cần, giữ credential hiện có và không tự xóa `.local` cũ. Core chờ seed DB và storage-init thành công để `compose up --wait` chờ đủ các bước khởi tạo.
- Core chia theo tính năng: auth/customers/accounts/admin có controllers/dto/services theo nhu cầu và module riêng. AppModule import DatabaseModule, AuthModule, CustomersModule và PoliciesModule, đăng ký RealtimeService; AuthModule export AuthService để CustomersModule kiểm quyền. AdminModule.register ghép AccountsModule.register với client admin_runtime chỉ tại entrypoint local; không import hai module này vào public AppModule. Fixtures ở cli/dev-accounts.ts; Prisma schema là nguồn model, không thêm model TypeScript trùng lặp.

<a id="local-data-model"></a>
### Data model và bất biến

ORM Prisma 7.10.1 + adapter-pg, schema source ở apps/core/prisma/schema.prisma, SQL migrations trong apps/core/prisma/migrations. Client sinh vào src/generated/prisma, bị ignore; không sửa generated code hoặc migration đã apply. Có 17 bảng ứng dụng (16 nguồn + AuthSession). AdminRequest đã bị loại bằng migration thứ ba, không xóa/sửa hai migration cũ; chống trùng quản trị dùng advisory lock + audit SUCCESS và unique constraints.

| Schema/bảng | Prisma model | Mục đích |
| --- | --- | --- |
| business.users | User | Email/mã tài khoản, role, hash mật khẩu, trạng thái và lời nhắc |
| business.customer_profiles | CustomerProfile | Hồ sơ Customer |
| business.staff_profiles | StaffProfile | Hồ sơ Staff |
| business.staff_assignments | StaffAssignment | Lịch sử phân công; chỉ một phân công active/Customer |
| business.auth_sessions | AuthSession | Hash session/CSRF, hết hạn và thu hồi |
| business.rate_limit_buckets | RateLimitBucket | Bộ đếm theo actor/nhóm endpoint |
| business.audit_logs | AuditLog | Actor user/operator/system, hành động và kết quả |
| business.insurance_products | InsuranceProduct | Danh mục sản phẩm |
| business.insurance_policies | InsurancePolicy | Hợp đồng và số liệu nghiệp vụ |
| business.documents | Document | Metadata và ownership tài liệu |
| business.document_versions | DocumentVersion | Phiên bản PDF, object key và checksum |
| business.conversations | Conversation | Hội thoại Customer/Staff Copilot theo Customer |
| business.messages | Message | Nội dung và metadata bằng chứng/tool |
| business.support_tickets | SupportTicket | Ticket đã xác nhận, idempotency key |
| business.outbox_events | OutboxEvent | Sự kiện bền vững chờ xử lý |
| business.notifications | Notification | Thông báo in-app, trạng thái đọc/phát |
| rag.rag_knowledge_chunks | RagKnowledgeChunk | Chunks và vector không cố định số chiều |


Metadata business._prisma_migrations không tính trong 17 bảng; viewer có thể thấy tên qua catalog nhưng không đọc/sửa nội dung.

Các khác biệt/ràng buộc quan trọng so với nguồn:

1. Email chuẩn hóa lowercase/trim và unique; account_code STF-/CUS- phục vụ định danh, login chỉ email. Mật khẩu chỉ lưu hash; hồ sơ tối thiểu có thể thiếu birth/citizenId để không ép KYC khi cấp account.
2. CHECK và composite FK user_id/role giữ đúng loại profile. Cấp user/profile/assignment/audit atomic.
3. StaffAssignment có ended_at/operator_id và partial unique index một active/Customer; giữ lịch sử, Customer có thể chưa phân công. Service dùng locks/expectedVersion; user không tự đổi role/phân công.
4. Audit phân biệt USER/OPERATOR/SYSTEM; operator không giả làm business user. Metadata allowlist, không credential hoặc payload Private không cần thiết; retention vẫn cần thiết kế riêng.
5. AuthSession chỉ có token/CSRF verifier SHA-256, expiry sau created_at. Danh tính và quyền không được lấy từ LLM hoặc payload client.
6. Document version unique trong document; current_version phải thuộc đúng document. Private document ownership phải khớp Customer hợp đồng; không mặc định phiên bản hoặc suy ra scope retrieval chỉ từ bảng tồn tại.
7. Conversation bắt buộc Customer kể cả Staff Copilot theo nguồn hiện có; chưa triển khai Copilot chung không chọn Customer hoặc takeover concurrency.
8. Ticket.confirmed_at bắt buộc, không default NOW(); unique idempotency không thay kiểm tra xác nhận hợp lệ, quyền và transaction Ticket + outbox trong Core.
9. Outbox/Notification không tự đánh dấu delivered hoặc chọn Redis/SQS; chưa có worker/pipeline.
10. pgvector dùng vector không cố định số chiều, chưa ANN index/model/embedding/checkpoint. Chunk gắn đúng document/version; metadata không là nguồn cấp quyền.
11. FK RESTRICT/NO ACTION giữ dữ liệu/lịch sử; chưa có public hard-delete hoặc chính sách retention hoàn chỉnh. Không dùng hồ sơ thật đã che tên làm fixture.

| Role | Quyền |
| --- | --- |
| local_owner | Bootstrap local, tạo role/extension; không cấp cho Core/GUI |
| app_migrator | Chủ schema business/rag, chạy migration; không phải superuser/CREATEROLE |
| core_runtime | DML business, đọc trạng thái migration; không DDL, không ghi migration history, không truy cập rag |
| admin_runtime | DML business cho tool local, SELECT metadata migration để kiểm compatibility; không DDL/superuser/rag hoặc ghi migration history |
| db_viewer | SELECT 17 bảng ứng dụng, không sửa/xóa dữ liệu |


Credential ở volumes riêng; không tự rotate role password đã tồn tại hoặc dùng local_owner cho Core/tool. Không DDL/superuser cho runtime. Migration runner cập nhật quyền metadata để Core/tool kiểm compatibility.

<a id="local-api"></a>
### Auth và Business API local

- Bổ sung 31/10/2026: GET/PATCH /staff/me cho Staff tự đọc/sửa fullName và phone; trường định danh/quyền/phòng ban không được sửa. PATCH kiểm Origin/JSON/custom header/CSRF, giới hạn 30/15 phút/user, khóa user và kiểm lại phiên sau khóa; expectedUpdatedAt chống ghi đè, hồ sơ + audit atomic, phone trùng trả 409. Contract tại docs/ui/staff/account.md; Web đã nối form sửa.

- Prefix /api/v1, health/live + health/ready; Swagger dev có thể tắt, production không cho bật. Strict DTO/class-validator, không tự tin role/ID từ body/header. Lỗi chỉ mã/thông báo công khai + request ID/timestamp, không SQL/exception input; log allowlist metadata. Không cache auth/business hoặc lưu credential vào browser storage.
- Customer POST /auth/login; Staff POST /auth/staff/login; GET /auth/me; POST /auth/logout và /auth/change-password. Không public register/provision/reset/assignment.
- Password mới bcrypt cost 12, salt tự sinh, tối thiểu 6 ký tự/tối đa 72 byte UTF-8, không trim/cắt ngầm. Verifier scrypt cũ chỉ để tương thích/nâng hash khi biết đúng password, không reset password đã đổi; legacy trên 72 byte giữ tới khi chủ động đổi.
- Session và CSRF token độc lập 32 byte random, DB chỉ hash. Cookie host-only HttpOnly/SameSite=Lax/Path=/api/v1, Secure khi production, TTL tuyệt đối 8 giờ. Login xoay phiên, logout thu hồi; self-change kiểm password cũ, khóa user và recheck session/hash, thu hồi mọi phiên rồi cấp phiên mới/tắt lời nhắc trong cùng transaction.
- Request ghi có Origin allowlist/JSON/X-Auth-Request, logout/change thêm X-CSRF-Token. CORS không thay auth/CSRF. Login limit DB 60/phút/socket IP + 10/15 phút/email, 5 password sai tạm khóa 15 phút; change limit 10/15 phút/user. Không trust X-Forwarded-For cho actor/IP.
- Customer GET /customers/me đọc own profile và Staff contact; Staff GET /staff/customers (page/pageSize) và /staff/customers/:id chỉ lọc active assignment. Role sai 403, ngoài quyền/không tồn tại detail cùng 404, query lạ/UUID sai 400. Response allowlist không có citizenId/hash/token/audit metadata.
- Read dùng RepeatableRead snapshot cho actor/status/assignment/data và list/count. Quyền đã commit có hiệu lực ở request kế tiếp; request đang mở có thể hoàn tất theo snapshot cũ. Customer chưa gán có UNASSIGNED; Staff bị khóa/tạm khóa thì STAFF_UNAVAILABLE và contact=null. Staff active vẫn xem Customer khóa nếu còn assignment; Customer khóa không tự đọc được.

<a id="local-admin"></a>
### Operator và quản trị local

- Entry riêng apps/core/src/admin/main.ts; UI HTML/CSS/JS ở apps/core/admin-ui, cùng origin 127.0.0.1:4100. Thay đề xuất React để không thêm workspace/dependencies hoặc đưa admin vào bundle Next. Chạy theo [hướng dẫn mục 5](getting-started.md#admin-tool).
- Operator local-operator là danh tính riêng, password bootstrap random/hash ở file private, không nằm trong business.users. Cookie li_ops_session HttpOnly/SameSite=Strict/Path=/ops/v1, TTL 30 phút memory; restart mất phiên. Host/Origin loopback, CSRF/JSON/custom header cho POST, CSP và không CORS bên ngoài. Login limit DB 10/15 phút/operator+socket, mutation 60/phút/session.
- Auto-code STF-/CUS- từ MAX số hiện có dưới advisory lock. User/profile/assignment/audit atomic. UUID requestId theo operator dùng advisory lock và audit SUCCESS chống trùng; retry trả 409, không replay password. Create/reset password chỉ trả một lần.
- Khóa/mở khóa/reset dùng expectedUpdatedAt + user row lock; stale 409. Khóa/mở khóa đều revoke sessions; reset đổi bcrypt, bật nhắc, giữ ACTIVE/LOCKED và không ép đổi lần đầu.
- Gán/chuyển/gỡ khóa user liên quan theo thứ tự ID; expectedVersion và partial index giữ một active. Staff/Customer phải active khi gán mới, Staff không tạm khóa; gỡ vẫn được khi Customer khóa. History + version + audit cùng transaction; Staff cũ mất quyền sau commit.
- Tool chỉ target local, credential admin_runtime qua stdin, kiểm schema compatibility; không tự mở RDS hoặc thêm public admin API. RDS/cloud cần yêu cầu riêng sau.

### Chuẩn hóa Policy ngày 30/10/2026

Theo yêu cầu người dùng, model InsurancePolicy và enum PolicyStatus thay tên Contract; bảng business.insurance_policies được đổi tên bằng migration 202610300001_rename_insurance_policies. Quan hệ Prisma ở CustomerProfile/InsuranceProduct là policies. Giữ policy_number/policy_id/linked_policy_id và các FK hiện hữu; rename giữ dữ liệu và quyền trên bảng. Ba migration trước giữ nguyên, kiểm compatibility Core/operator yêu cầu migration thứ tư. API Policy vẫn chưa triển khai; đường dẫn đề xuất trong docs/ui dùng /policies.

### Realtime dữ liệu local

Đã có native WebSocket `/api/v1/realtime` cho invalidation account/profile/active assignment. Web dùng cookie phiên hiện tại, Origin allowlist; Core kiểm lại phiên và đọc snapshot RepeatableRead đúng scope. So sánh hash snapshot mỗi 2 giây, chỉ phát ready/invalidate/session-expired, không gửi payload Private; Web tải lại REST theo quyền. Có heartbeat, reconnect/backoff và giới hạn kết nối local. Nginx proxy Upgrade tại cùng path để cookie Path=/api/v1 được gửi đúng.

Đây là cơ chế đối chiếu định kỳ local qua WebSocket, chưa phải pipeline push theo commit/outbox, chưa benchmark production hoặc đồng bộ chat/Ticket/notification. Không quyết định queue/transport Core–Agent hay backend checkpoint. Không dùng channel này để ghi nghiệp vụ. Kiểm tra `node --test apps/core/test/realtime.test.cjs apps/core/test/http-foundation.test.cjs` sau build: 6 test pass; E2E qua gateway xác nhận profile synthetic tự cập nhật và không có payload hồ sơ trong frame.


### Baseline Web và tiến độ UI — 30/10/2026

Web dùng Next App Router/React/Tailwind 4 prefix `tw:`. Ngày 31/10/2026 đã chuyển toàn bộ style Web sang Tailwind theo yêu cầu người dùng, bỏ staff-workspace.css và các UI rules legacy trong globals.css; globals chỉ giữ import/font/theme. Quy ước duy trì ở apps/web/AGENTS.md. Login hai role và Staff workspace theo UI người dùng cung cấp, font Lexend tự host. Staff fullscreen, UI tiếng Anh; Customers list/detail riêng với policy làm vùng chính, account menu hai hành động và Personal information/Security cùng style. Customer profile/account vẫn giữ bố cục hiện có (style đã chuyển Tailwind); chưa có menu Customer MVP.

`/staff` redirect `/staff/customers`; group `/staff/(workspace)` giữ layout cho customers/inbox/policies/tickets và detail IDs. Page markers đăng ký route, nội dung lấy pathname/params/query trong workspace. Shared layout giữ socket khi chuyển route trong group; `/account` là entry riêng cho cả role. URL không cấp quyền, Core xác minh mỗi request. [Routes](ui/staff/routes.md) và [checklist tiến độ/gap](ui/implementation-status.md) là tham chiếu trạng thái.

API đã nối: auth/session/password/logout, `GET /customers/me`, `GET /staff/customers` với page/pageSize/search và detail theo assignment. Bổ sung 31/10: search literal fullName/accountCode/email/phone, trim/tối đa 100 ký tự, không phân biệt hoa thường; lọc/count cùng snapshot trước phân trang, Web giữ bộ lọc trong URL và có Try again tại lỗi list/detail. Chưa có policy/product/document/chat/Ticket/Copilot/notification APIs. Khung UI cho các phần đó không được coi là hoàn thành nghiệp vụ. Không còn preview hoặc fixture thành công Ticket/Claim; thao tác chưa có Core giữ disabled.

WebSocket invalidation local đã nêu ở trên chỉ phục vụ dữ liệu hiện có. Profile/list không refetch theo focus, dùng ready/invalidate và refresh nền để giữ nội dung; AuthScreen vẫn kiểm phiên khi focus/visible. Quyền bị thu hồi được kiểm lại qua REST và xóa dữ liệu trên 401/403/404. Không coi snapshot 2 giây là cam kết độ trễ hay kiến trúc production đã duyệt.

Bổ sung 31/10/2026: Staff có API list/detail hợp đồng và catalog tài liệu theo active assignment; catalog dùng phiên bản ghim trong benefitsSnapshot.documents. Không trả storage key hoặc URL. Xem [contract](ui/staff/policies.md).

31/10: Core PoliciesModule đã nối AWS SDK S3 với MinIO local để kiểm metadata và cấp signed GET URL view/download, readonly reader volume; ownership/assignment/phiên bản áp dụng và CSRF do Core kiểm. Staff Web nhúng PDF gốc, thông tin DB ở phần riêng; không trích xuất/OCR. Chưa triển khai Customer access hoặc cloud.

31/10: seed-dev đã tích hợp seed sản phẩm/policy/document/version/PDF synthetic sau migration và storage-init. Seed giữ advisory transaction lock, dùng admin_runtime + storage-writer; PDF ổn định có checksum và upload create-only, metadata DB atomic. Object đã upload khi DB rollback được tái sử dụng ở lần chạy lại; không xóa/ghi đè object khác. Public runtime không có CLI/font seed hoặc writer credential. Xem Getting Started 7.4.
