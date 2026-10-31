# Tiến độ triển khai UI, checklist và gap

Đối chiếu **31/10/2026** với source hiện tại và kiểm tra qua gateway Docker local. Phạm vi là Web Customer/Staff và các API Core đang được Web sử dụng; operator local là công cụ riêng. Đây là snapshot implementation, không thay yêu cầu nguồn hoặc duyệt API mới.

[Thứ tự đọc](README.md) · [Menu](menu.md) · [Routes Staff](staff/routes.md) · [API](staff/api-map.md) · [Quyết định mở](staff/gap-review.md)

## Quy ước trạng thái

**Đã nối API**: luồng UI đọc/ghi qua Core hiện có. **Một phần**: còn thiếu chức năng trong phạm vi màn hình. **Khung UI**: có route/bố cục, chưa có dữ liệu nghiệp vụ. **Chưa làm**: chưa có luồng tương ứng. `[x]` chỉ xác nhận dòng cụ thể, không đánh dấu cả màn hình khi mới có khung.

## Ma trận màn hình

| Mã | Trạng thái | Đã có | Còn thiếu / phụ thuộc |
| --- | --- | --- | --- |
| C01 | Đã nối API local | `/login`, email/password, hiện/ẩn, lỗi, phiên và điều hướng Customer | Menu Customer MVP chưa dựng; không có public register/reset/SSO |
| C02 | Một phần | `/customer` đọc hồ sơ và Staff phụ trách | Chưa có dashboard hợp đồng/kỳ phí/lối tắt MVP |
| C03 | Chưa làm | Chưa có trang sản phẩm/API | Danh sách/chi tiết/sản phẩm công khai và tài liệu |
| C04 | Chưa làm | Schema InsurancePolicy, quan hệ nhiều policy/Customer | Danh sách/chi tiết, quyền lợi/kỳ phí và API ownership |
| C05 | Chưa làm | Schema Document/DocumentVersion | Catalog, phiên bản áp dụng và quyền xem PDF có hạn |
| C06 | Chưa làm | Schema Conversation/Message | Chat/lịch sử/nguồn, Ticket draft/xác nhận và handoff |
| C07 | Chưa làm | Schema SupportTicket/OutboxEvent | Form thủ công/AI, confirmation, chống trùng và list/detail |
| C08 | Đã nối API local | Hồ sơ read-only + Staff ở `/customer`; actor/đổi mật khẩu/đăng xuất ở `/account` | Chưa ghép menu MVP; Customer vẫn dùng layout account/profile cũ đang hoạt động; không có sửa hồ sơ |
| C09 | Chưa làm | Chưa có UI/API thông báo | Model Notification hiện chỉ có recipient Staff; cần thiết kế Customer recipient |
| S01 | Đã nối API local | `/staff/login`, `/account`, menu hai hành động, session/logout/password; sửa họ tên/phone qua GET/PATCH /staff/me, Edit/Save/Cancel và thông báo kết quả; đã bỏ footer Contact | API lưu/đọc lại, quyền và phiên bản đã kiểm chứng qua gateway; còn regression trình duyệt tự động/keyboard/mobile cho form mới |
| S02 | Khung UI | Sidebar Inbox và All/Requests/Active/New, URL filter | A07–10; badge/count/search/phân trang công việc và nghĩa của New |
| S03 | Một phần | Customers list/detail riêng, phân trang 10/trang, search toàn tập assignment theo tên/code/email/phone, URL giữ bộ lọc, Try again cho lỗi list/detail; hồ sơ read-only | Policy list/detail/catalog đã nối; lịch sử/Ticket chưa nối; browser regression search/retry/realtime còn thiếu |
| S04 | Một phần | Customer policy list/detail/benefits/catalog đã nối A14/A16/A18; phân trang, retry và giữ URL | A15/A17/A19/A20, sản phẩm/PDF và ngữ cảnh |
| S05 | Khung UI | Inbox/detail route, rail chọn panel có active state, Case Details/Copilot/lookup | A08–13/A24–26; transcript/gửi/takeover/AI đều chưa có, composer disabled |
| S06 | Khung UI | Route list/detail Ticket riêng, trạng thái chưa kết nối | A21–23, bảng/chi tiết thật, tiếp nhận và liên kết chat |
| S07 | Chưa làm | Chưa có chuông/list/read marker | A27–28 và pipeline outbox/recipient/reconnect |

## Checklist phần đã thực hiện

- [x] Login Customer/Staff theo UI nguồn bằng React/Tailwind; ảnh và Lexend tự host.
- [x] Staff fullscreen theo mẫu đính kèm; Customer management tách khỏi Inbox. Cột giữa sidebar/chat của Inbox dành cho **hội thoại**, không phải danh bạ khách.
- [x] Staff dùng Lexend cố định, bỏ Preferences/font picker; Web dùng tiếng Anh. Hồ sơ/account Customer giữ bố cục hiện có, chưa đồng nhất thiết kế với Staff; style đã chuyển Tailwind.
- [x] Sidebar account popover chỉ có Personal information và Sign out; trang Staff Personal information cùng style workspace, form password trong Security.
- [x] Staff tự sửa họ tên/số điện thoại qua `GET/PATCH /api/v1/staff/me`; email/code/role/department chỉ đọc. Form có tải/thử lại, Edit/Save/Cancel, validation, khóa khi lưu, thông báo thành công/lỗi và tải lại khi 409; cập nhật tên ở app shell sau lưu.
- [x] Core xác minh Staff trong phiên, Origin/CSRF, giới hạn ghi, expectedUpdatedAt; khóa user/kiểm lại phiên, cập nhật hồ sơ và audit cùng giao dịch. Qua gateway thật: GET/PATCH và đọc lại thành công, auth/me có tên mới, phiên bản cũ 409, Customer 403. Hồ sơ synthetic dùng kiểm tra đã được khôi phục.
- [x] Toàn bộ `apps/web` dùng Tailwind 4 prefix `tw:`; đã xóa `staff-workspace.css` và UI rules legacy. `globals.css` chỉ giữ import/font/theme; quy ước được ghi trong `apps/web/AGENTS.md`.
- [x] Bỏ dòng Contact your administrator, icon và dải footer khỏi thẻ Personal information theo yêu cầu. Bundle đang phục vụ qua gateway đã xác nhận không còn nội dung này.
- [x] Rebuild/cập nhật Web/Core Docker và restart gateway; bản tại `localhost:8080` đã chứa form mới, không chỉ có thay đổi source.
- [x] Lời nhắc đổi password có thể đóng trong phiên mount của UI; không lưu lựa chọn dismiss bền vững qua reload/đăng nhập.
- [x] Staff route list/detail, query phân trang, deep link, Back/Forward; shared layout giữ workspace/socket khi chuyển route trong group. `/account` nằm ngoài group.
- [x] Customers gọi A05/A06, hiển thị total/Previous/Next; breadcrumb giữ page. Không còn nút Refresh trên header Customers.
- [x] Chi tiết ưu tiên vùng Insurance policies, personal information nhỏ bên cạnh; đây vẫn là placeholder policy, chưa phải kết quả rỗng từ Core.
- [x] Auth guard/session, xử lý 401; API khách hàng kiểm active assignment; 404 an toàn cho ngoài scope/không tồn tại. UI xóa dữ liệu riêng khi đọc trả 401/403/404.
- [x] WebSocket native `/api/v1/realtime`: account/profile/assignment invalidation, cookie/Origin, heartbeat, reconnect và REST resync. Không có mutation trên socket.
- [x] Bỏ refetch hồ sơ/list khi focus, giữ revalidation nền từ realtime; vẫn kiểm lại phiên khi focus/visible, gộp request đang chạy.
- [x] Chuẩn hóa Prisma/DB thành InsurancePolicy/PolicyStatus/insurance_policies bằng migration mới; giữ policy_id/policy_number/linked_policy_id.
- [x] Xóa preview, fixture nghiệp vụ trong UI, nhánh Staff cũ và CSS không dùng. Giữ Customer/account/connection còn hoạt động và page markers của shared layout.

- [x] S03 search/retry (31/10): API lọc/count toàn tập assignment, FE Search/Clear/URL/page/detail/back và Try again thực sự refetch; Core integration 7 test pass.

## Checklist phần còn lại

Cấu hình 31/10: `.env` root dùng chung cho Compose/Core/Web/MinIO, credential khởi tạo tùy chọn được kiểm khớp volumes cũ. Đã kiểm env mapping/secret isolation, credential mới/chạy lại/xung đột/thiếu, Swagger bật/tắt và gateway/storage; lint/typecheck pass. `.env` thật bị Git/build ignore, không tạo env từng app hoặc file tạm trong repo.

Vận hành local cập nhật 31/10: FE/BE chỉ chạy Docker Compose qua gateway; đã bỏ helper npm host/Core password export và bind mount `.local`. File operator/MinIO console nằm ngoài repo trong thư mục dữ liệu người dùng, operator cũ được giữ nguyên. Stack Docker, gateway/Swagger, storage, lint/typecheck, 5 test admin và 6 test HTTP/realtime đã pass; dữ liệu hiện có được giữ.

Đợt policy/PDF đã thống nhất phạm vi chức năng (31/10): DB lưu nghiệp vụ/metadata, MinIO private local lưu PDF theo version; Core cấp signed URL sau kiểm quyền, Web có trang thông tin DB và Xem/Tải PDF cho Customer/Staff. **Đã dựng nền storage Docker và Staff API A14/A16/A18**. Đã nối FE Staff; chưa có Customer API, cấp URL PDF hoặc viewer; fixture cá nhân không thuộc seed chung. Xem [đặc tả dùng chung](customer/documents.md#hướng-triển-khai-policypdf-đã-thống-nhất--31102026).

- [x] **Storage Docker local (31/10):** MinIO Community AGPL-3.0/mc build source pin commit/checksum/base digest, durable volume, bucket private, root/reader/writer tách quyền. `storage:check` pass init rerun, quyền đọc/ghi, anonymous denied, signed URL Range/CORS/tampered signature và restart persistence. Chỉ local.
- [ ] **Policy/PDF foundation tiếp theo:** nối S3 SDK/Core cấp signed URL sau kiểm session/quyền/version, contract viewer/download, loại tài liệu và policy–version áp dụng. Chưa dựng S3/cloud.
- [x] **Seed policy + PDF:** khách 0/1/nhiều hợp đồng, PDF synthetic có nhãn mô phỏng, điều khoản/phụ lục/version, checksum/metadata nhất quán và chạy lại an toàn; không đưa PDF vào Git/Next public.
- [ ] **Policy/PDF cho cả hai role:** list/detail từ DB, catalog, Xem PDF trong app và Tải PDF đúng phiên bản; Customer ownership/Staff assignment, không reload document, audit riêng xem/tải.

- [ ] **Ưu tiên tiếp: Policy Lookup A15:** API search số hợp đồng/tên-mã khách/mã-tên sản phẩm trên toàn tập active assignment, status và phân trang; FE danh sách trái → dossier/PDF phải tái sử dụng, dọn filter/placeholder/Back to Inbox mẫu, giữ URL/Back–Forward, không reload. Xem [kế hoạch](../next-steps.md#ưu-tiên-tiếp-theo-đã-chốt-staff-policy-lookup). Chưa triển khai.
- [ ] **S03 browser regression**: kiểm tra search/clear/URL/pagination/detail/back, keyboard/mobile, retry lỗi mạng và realtime trên bộ lọc; API và handler UI đã triển khai, chưa có bộ browser E2E tự động.
- [x] **Staff policy read/catalog API**: A14/A16/A18, phân trang theo assignment, allowlist và đúng phiên bản áp dụng; test:policies có fixture tự dọn.
- [ ] **Policy read Web/Customer**: nối S03/S04, A15 search toàn tập và Customer ownership API.
- [ ] **Nhiều policy/ngữ cảnh**: policy đang xem khác policy gắn conversation; chọn xem không tự đổi chat. Header/Copilot hiển thị context, đổi context kiểm scope và tách kết quả cũ. Chưa có UI chọn/context persistence/API cập nhật liên kết.
- [ ] **Product/document**: A17–20, mapping policy–version áp dụng, PDF đúng quyền/hết hạn/thu hồi, citations có document/version/page.
- [ ] **Inbox**: A07–10/A13, danh sách theo conversationId, counts/filters/search/phân trang/lịch sử/read marker; chốt New trước khi nối dữ liệu.
- [ ] **Chat/handoff**: A11–12, quyền điều khiển/version, send idempotency/reconcile timeout và chặn Agent ghi khi takeover.
- [ ] **Yêu cầu Staff từ Customer/Agent (31/10, đã ghi yêu cầu, chưa code):** Customer có thể chủ động yêu cầu ngay trong chat; Agent cũng có thể gợi ý khi chưa giải quyết được. Khách xem lại/xác nhận gửi, Core lưu Ticket + outbox rồi thông báo đúng Staff; Staff tiếp nhận và trả lời trong cùng conversationId. Không gửi khi chưa đồng ý, không tạo trùng, không để Agent trả lời muộn sau tiếp quản. Xem [luồng đầy đủ](customer/chat.md#6-chuyển-từ-agent-sang-staff--yêu-cầu-31102026).
- [ ] **Ticket**: A21–23 và API tạo phía Customer cần đặc tả riêng; confirmation/manual-vs-AI, Ticket+outbox atomic, chống trùng và nhận không gắn chat.
- [ ] **Copilot**: A24–26, Agent contract/checkpoint, lịch sử nội bộ, nguồn/mốc transcript/giới hạn; chèn nháp không tự gửi Customer.
- [ ] **Notifications/realtime nghiệp vụ**: A27–28, Customer recipient, dedup/read/replay, chat/Ticket/notification events và outbox worker. Socket local hiện có chưa cung cấp các phần này.
- [ ] **Customer MVP UI**: menu/dashboard/products/policies/documents/chat/Ticket/notifications; đồng nhất hồ sơ/account với hệ giao diện mới.
- [ ] **UX còn giữ từ mẫu**: bỏ/chỉnh placeholder CCCD/phone trong Policy Lookup và tooltip New; chưa có API cho các tiêu chí đó. Global search/templates/attachment đang disabled; chốt nhu cầu trước triển khai.
- [ ] **QA tiếp theo**: regression có thể chạy lại từ repo/CI, keyboard/focus đầy đủ và mobile Inbox có dữ liệu thật. Hiện chưa có bộ E2E Web được version trong repo.
- [ ] **QA policy/PDF:** cả Customer/Staff và thu hồi assignment, đúng phiên bản/file nguồn, null/thiếu PDF/storage lỗi, expiry và giới hạn thu hồi signed URL, Range/download/CORS/CSP, retry và keyboard/mobile; không coi schema/viewer rỗng là hoàn thành.
- [ ] **Vận hành**: event-driven invalidation/multi-instance, sizing/benchmark và quan sát retry/disconnect; không tính poll snapshot local là realtime production hoàn chỉnh.

## Gap và thứ tự xử lý đề xuất

| ID | Ưu tiên | Gap / tác động | Bên xử lý và điều kiện đóng |
| --- | --- | --- | --- |
| G01 | P0 | Policy UI có khung nhưng chưa đọc được hợp đồng | Core/Web: duyệt A14–16, synthetic seed, test nhiều policy/ngoài assignment/null; UI list/detail dùng response thật |
| G02 | P0 | Chưa có contract chọn/ngữ cảnh policy | Product/Core/Web: chốt xem vs liên kết, quyền đổi/version/persistence; API và test đổi context không dùng kết quả cũ |
| G03 | P0 | PDF và version áp dụng chưa xác định | Core/Agent/Web: duyệt A18–20, policy–terms mapping, access/revoke/expiry và test đúng document/version |
| G04 | P0 | Inbox, takeover, send và Ticket chưa có nghiệp vụ | Product/Core/Web: chốt filter/New, state/version/idempotency; cả Customer chủ động và Agent gợi ý được khách xác nhận phải tạo yêu cầu nhất quán, Ticket+outbox, Staff nhận/trả lời và chặn Agent muộn; triển khai A07–13/A21–23 cùng contract tạo/xác nhận phía Customer/Agent |
| G05 | P1 | Search/retry đã nối; còn copy/tooltip mẫu và browser regression | Core/Web: search A05 và retry cùng URL đã triển khai 31/10; còn bỏ/chỉnh tiêu chí CCCD/phone ở Policy Lookup, tooltip New và regression trình duyệt |
| G06 | P1 | Copilot/AI chưa triển khai | Core/Agent/Web: actor context, retrieval scope/version, checkpoint, citations và fail-safe trước A24–26 |
| G07 | P1 | Không có thông báo nghiệp vụ | Core/Web: Core phát thông báo sau khi yêu cầu đã xác nhận được commit; recipient Staff/Customer đúng quyền, worker/dedup/read/reconnect, fallback khi chưa có Staff; API A27–28 và test Ticket lưu khi delivery lỗi |
| G08 | P1 | Customer portal mới hoàn thành auth/profile | Web/Core: menu/layout mới và read APIs theo ownership; không xóa layout cũ trước khi thay đủ luồng |
| G09 | P1 | Bằng chứng local chưa thành regression suite production | QA/Core/Web: đưa kịch bản test vào repo/CI; test reconnect/quyền/concurrency/a11y/mobile; benchmark riêng |
| G10 | P2 | Tiện ích mẫu chưa có contract | Product/Web: chốt templates/global search/attachment; font picker đã bỏ theo yêu cầu, không đưa trở lại backlog |

P0/P1/P2 là thứ tự làm đề xuất. Có thể tiếp tục UI trước; các thao tác nghiệp vụ giữ disabled cho tới khi contract và Core sẵn sàng. G05 search/retry đã nối, còn browser regression/copy. Ưu tiên tiếp: **G01 policy read + G02 context → G03 PDF → G04 Inbox/Ticket → G06/G07**; G08 có thể đi sau các read API dùng chung.

## Truy vết yêu cầu nguồn

| Yêu cầu | Độ phủ hiện tại |
| --- | --- |
| FR-001 | Login/session/logout/password local; không có public registration/IdP. Không đánh dấu toàn bộ FR-001 xong |
| FR-002 | Staff tự sửa họ tên/phone (31/10); Customer profile/Staff contact/assigned Customer vẫn read-only |
| FR-003 | List/detail/pagination và search tên/code/email/phone trên toàn tập assignment; retry đã nối; chưa nghiệm thu browser E2E đầy đủ |
| FR-005/006/007 | Customer chat chưa làm; Staff có shell, chưa chat/takeover/Copilot |
| FR-008, UC-007 | Có Staff policy list/detail/catalog API; UI còn shell, chưa Customer/product API và cấp URL PDF |
| FR-009/010/011/012/013, UC-005/006 | Chưa có Ticket business/chat history/summary/notification. Route hoặc bảng tồn tại không hoàn thành FR |
| NFR-001/002 | Có baseline auth/assignment/CSRF/allowlist/synthetic cho API đã có; retrieval/tool scope chưa triển khai |
| NFR-003/005/007 | Chưa có AI safety pipeline, giao dịch Ticket hay quyền PDF để nghiệm thu |
| NFR-004/006/008 | Có HTTP foundation/audit local một phần; chưa benchmark, chưa notification workload hay observability AI |

SRS không có FR-004 trong bảng FR. Ticket thủ công và notification Customer là mở rộng menu MVP đã ghi nhận, không gán thành nội dung nguyên văn SRS.

## Bằng chứng đối chiếu và giới hạn kiểm tra

| Phạm vi | Source / bằng chứng |
| --- | --- |
| UI/auth/account | `apps/web/src/components/{auth-screen,login-panel,staff-account-menu,staff-personal-information,staff-profile-editor,change-password-form}.tsx`, `apps/web/src/lib/staff-profile-api.ts` |
| Staff/customer/routes | `staff-reference-workspace.tsx`, `staff-reference-template.tsx`, `staff-customer-directory.tsx`, `customer-workspace.tsx`; `apps/web/src/app/staff/(workspace)` |
| API đã có | `apps/core/src/auth/controllers/{auth,staff-profile}.controller.ts`, `customers/controllers/customer.controller.ts`; service/DTO tương ứng |
| Realtime | `apps/core/src/realtime/realtime.service.ts`, `apps/web/src/lib/realtime.ts`, `infra/local/nginx/default.conf` |
| Policy model | `apps/core/prisma/schema.prisma`, migration `202610300001_rename_insurance_policies` |

Đợt code trước đã chạy Web lint/build; browser smoke trên Docker cho route/pagination/deep link/Back–Forward/persistent socket, account menu/password validation–save–cancel/logout, Customer profile và unassigned state. Test UI dùng API mock synthetic không phải bằng chứng backend password/transaction. Các script browser nằm local, chưa là test suite tái lập sau clone. Kiểm tra responsive trước đó ở 375/768/1600px là overflow/DOM, không có screenshot hoặc nghiệm thu pixel-perfect.

Core có test version trong `apps/core/test`: provisioning/auth/customers/admin/http-foundation/realtime; realtime + HTTP foundation từng qua 6 test. Lệnh chuẩn ở [getting-started](../getting-started.md#commands). Lần đồng bộ tài liệu này chỉ đối chiếu source và kiểm tra tài liệu; không ghi nhận lại những test đó như vừa chạy hay mở rộng thành chứng nhận production.

Bổ sung 31/10: build/lint Web và build Core đã pass; kiểm tra tĩnh không có inline style/UI rule legacy và mọi utility Tailwind tham chiếu đều được sinh trong CSS build. Kiểm tra HTTP qua Docker gateway xác nhận luồng sửa hồ sơ và bundle Edit/Save mới; ảnh người dùng cung cấp cho thấy thao tác lưu hồ sơ thành công. Chưa có bộ browser E2E tự động cho form mới; điều khiển Chrome bị từ chối quyền, không chụp screenshot. Chi tiết và giới hạn kiểm tra được tổng hợp tại checklist.

31/10: FE Staff A14/A16/A18 đã nối; dùng Tailwind, chuyển route không reload, phân trang riêng policyPage và returnTo giữ bộ lọc khách. Catalog chỉ hiển thị metadata đúng phiên bản; chưa có xem/tải PDF. Browser verification của lượt này chưa hoàn tất vì browser host không khả dụng.

31/10: Staff A20 view/download + Original PDF viewer đã triển khai. Trang policy mặc định PDF gốc, thông tin DB ở phần riêng; chọn version/tải không reload. Core kiểm scope/CSRF/active version/object metadata rồi ký URL ngắn hạn bằng reader, audit cấp link. Customer PDF API và citations còn thiếu. URL policy đã bỏ returnTo, context quay về lưu riêng theo tab.

Kiểm chứng đợt PDF: Core/Web typecheck và lint, Docker build, 9 Policy integration tests + 6 HTTP/realtime tests pass. Qua gateway đã kiểm cấp view/download, file PDF gốc trùng byte, Content-Disposition, CORS, Range 206, anonymous/tampered-signature 403. Chưa kiểm thao tác/render trên trình duyệt vì cả browser host và native pipe không khả dụng; không chụp ảnh hoặc tạo report mới.

31/10 — đơn giản hóa trang hợp đồng: bỏ tab và dropdown tài liệu; PDF chính là nội dung trung tâm, thông tin DB thu gọn mặc định đóng; điều khoản/phụ lục nằm riêng, có mở viewer và trở lại hợp đồng chính. Ẩn giới thiệu sản phẩm khỏi trang này, không thay đổi binding/API hoặc xóa dữ liệu. Đã chỉnh viền/dấu đầu dòng khi không dùng Preflight, bỏ đơn vị VND lặp và phần thập phân .00 của VND.

31/10: đã đưa seed 2 sản phẩm/14 policy/17 document/20 version PDF vào bootstrap chung. Compose chờ storage-init rồi seed; phân quyền reader/writer tách, không xuất file host; fixtures cá nhân giữ nguyên. Có test:policy-seed với rollback và mock storage để kiểm rerun/preservation/collision/retry.

Kiểm chứng bootstrap policy: 4 test seed pass (PDF byte-stable, idempotency/preservation, storage failure/rollback/retry/restore, reserved collision); chạy seed Docker hai lượt xác nhận lượt sau 0 tạo/0 upload và giữ 14 hợp đồng. Đọc PDF qua gateway/MinIO đã kiểm 10 trang đại diện main/terms/endorsement, font tiếng Việt nhúng, bounds và render không lỗi; đã dọn ảnh QA tạm.
