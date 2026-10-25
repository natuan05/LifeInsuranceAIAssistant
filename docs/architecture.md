# Kiến trúc nền

Đối chiếu ngày 24/10/2026. Đây là ranh giới để phát triển tiếp, chưa phải thiết kế API hoặc triển khai hoàn chỉnh. Xem [nguồn và trạng thái quyết định](source-review.md).

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

Nguồn kỹ thuật đã đọc: [LangGraph persistence](https://docs.langchain.com/oss/python/langgraph/persistence) phân biệt checkpoint theo thread với bộ nhớ dùng qua nhiều thread; [AgentCore sessions](https://docs.aws.amazon.com/bedrock-agentcore/latest/devguide/runtime-sessions.html) mô tả vòng đời môi trường phiên. Các nguồn này không tự quyết định backend checkpoint cho dự án.

## Baseline local đang áp dụng

Cập nhật 25/10/2026. Các ADR local 0002–0007 đã được hợp nhất vào phần này và hướng dẫn docs/getting-started.md theo yêu cầu dọn tài liệu. Đây là quyết định cho phần đã triển khai local, không phê duyệt các ADR-AI/cloud đề xuất trong tài liệu nguồn.

<a id="local-runtime"></a>
### Runtime và đóng gói

- npm workspaces Web/Core, một lockfile root; Node 24.18.0/npm 11.16.0, Next 16.4.3/React 19.3.1, Nest 12.2.0, TypeScript 6.0.2. Không thêm shared package/build runner.
- Root Compose có Web/Core/Nginx/PostgreSQL/DbGate. Full Docker đi qua gateway 8080; Web/Core không publish host port. Nginx có thêm listener 81, publish loopback 8081 cho Swagger và API Try it out cùng origin; SWAGGER_PORT đổi cổng host và allowlist tương ứng. Npm dev gọi Core và Swagger trực tiếp ở 4000. Cấu hình và lệnh dùng trong [hướng dẫn sử dụng](getting-started.md).
- DbGate thay pgAdmin, kết nối tự động bằng role chỉ đọc. Prepare/bootstrap/migrate/seed tách job; credential volumes tách role, consumer mount readonly. Bootstrap/migrate chạy node; prepare chỉ mount legacy PostgreSQL và các volumes cần khởi tạo.
- Docker seed image riêng; Core public runtime không có seed CLI, admin entrypoint hoặc UI tool. Tool admin chạy host, không được gateway proxy.
- Core chia theo tính năng: auth/customers/accounts/admin có controllers/dto/services theo nhu cầu và module riêng. AppModule import DatabaseModule, AuthModule và CustomersModule; AuthModule export AuthService để CustomersModule kiểm quyền. AdminModule.register ghép AccountsModule.register với client admin_runtime chỉ tại entrypoint local; không import hai module này vào public AppModule. Fixtures ở cli/dev-accounts.ts; Prisma schema là nguồn model, không thêm model TypeScript trùng lặp.

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
| business.insurance_contracts | InsuranceContract | Hợp đồng và số liệu nghiệp vụ |
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
