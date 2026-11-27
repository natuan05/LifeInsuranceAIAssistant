# Tiến độ triển khai UI và độ phủ yêu cầu

Customer và Staff có auth/account, Products, Policies/PDF và chat hai đầu. Customer Ticket có manual/draft/confirmation; Staff có read/Accept/status. Application Phase 0–5 đã triển khai; nối Core–Agent/Copilot theo kế hoạch riêng.

[Thứ tự đọc](README.md) · [Menu đích](menu.md) · [Chỉ mục Staff](staff/README.md) · [API E/P](staff/plans/00-staff-contract.md#api-theo-chức-năng) · [Gap G01–G09](staff/plans/README.md#phần-còn-lại-theo-chức-năng)

Products **P01/A17 và P02/A19/access đã có Core/MinIO/gateway**, P03 Staff UI đã triển khai: [Staff Products](staff/plans/04-products-contract.md). [Customer plans](customer/plans/README.md) có H01/H02, PR01/PR02 và PO01/PO02/D01/D02 đã triển khai; hồ sơ Customer chỉ đọc theo quyết định 13/11; Agent/Ticket confirmation và notification center Customer theo phase sở hữu. Tài khoản cấp sẵn đã chốt 07/11, không còn registration backlog trong MVP.

Application Phase 0–5 đã hoàn tất, gồm tool local và hồi quy. Nối Core–Agent không thuộc phạm vi này.

**Phần nối Agent còn P:** [CH02](customer/plans/chat/02-agent-boundary.md#bàn-giao-triển-khai-coreagent) là điểm bàn giao Core/Web. Agent đã có code; Request Staff support chưa tự điền AI summary vào reason, và PROPOSE_TICKET chưa được nối từ Agent thật vào draft sáu nhóm/nguồn. Hai hành động có review/xác nhận riêng, không tự thực thi lẫn nhau. Đợt nối bao gồm cả Customer và Staff Copilot, nghiệm thu riêng từng luồng.

## Quy ước

**Đã nối API**: UI dùng Core hiện có. **Một phần**: thiếu phần trong phạm vi chức năng. **Khung**: có route/bố cục nhưng chưa nghiệp vụ. **Chưa làm**: chưa có luồng. `[x]` chỉ xác nhận dòng cụ thể, không chứng minh E2E, benchmark hoặc production. API/routes/checklist và gap nằm trong contract chức năng; plans/README chỉ dẫn tới owner.

## Ma trận màn hình

| Mã | Trạng thái | Đã có | Còn thiếu |
| --- | --- | --- | --- |
| C01 | Login/session đã có local | Tài khoản được cấp sẵn; email/password/session/role | Không yêu cầu tự đăng ký; reset/OTP/SSO không tự là Must. Chưa suy production/NFR đã đạt từ local |
| C02 | Đã nối API local | H01 shell điều hướng, H02 Home hiển thị portfolio từ dữ liệu hợp đồng thực tế, lối tắt dịch vụ và Staff phụ trách | Đã tinh chỉnh tiêu đề đen ASSIGNED SUPPORT STAFF, gỡ card tĩnh Paperless Policy |
| C03 | Đã nối API local | PR01 catalog/search/detail tại chỗ, nút View Details, PR02 xem/tải PDF tài liệu PUBLIC qua SignedPdfPreview | Đã bỏ nút ép chat; khách hàng tự chủ động vào chat khi có nhu cầu |
| C04 | Đã nối API local | PO01/PO02 danh sách/chi tiết hợp đồng, quyền lợi, lịch phí theo ownership | Hồi quy ownership và dữ liệu theo PO01/PO02 |
| C05 | Đã nối API local | D01/D02 xem/tải PDF hợp đồng sở hữu qua MinIO presigned URL | Tích hợp SignedPdfPreview |
| C06 | I03–I06 và CH01 đã nối | Own list/create/AI/Direct/history/handoff/consent/send/realtime/SYSTEM trong Customer shell | CH02/CH03 Agent trả lời thật/citations |
| C07 | Application Phase 2 hoàn tất | Manual-create, draft read/edit/confirm, validation/replay/CAS/snapshot/receipt và own list/detail | Tích hợp nguồn Agent thật và sáu nhóm summary/source refs theo I07/T01/T02 |
| C08 | Đã nối API local | Hồ sơ chỉ đọc/Staff contact, account/password/logout, menu cá nhân rút gọn | Hồ sơ chỉ đọc theo PF01/02; kiểm thử hồi quy và masking theo phạm vi riêng |
| C09 | Application Phase 3–4 hoàn tất | DTO/recipient, chuông và common read; event v2, watermark/chu kỳ unread, retry/dedup và cleanup mỗi 24 giờ với retention 30 ngày | Tool local/hồi quy Phase 5 đã kiểm |
| S01 | Đã nối API local | Login/session/account/password/logout, GET/PATCH staff/me; regression + gateway/Core/DB E2E trên Chromium/Firefox/WebKit | Auth mở rộng ngoài MVP theo yêu cầu riêng |
| S02 | I01–I06 đã nối | Model/quyền/groups/lazy/search/cursor/Accept/chat/send/realtime, không counts | I07 Ticket riêng; QA tích hợp rộng hơn |
| S03 | Đã nối API local | Customers list/detail/search/page/retry, policies/PDF; Conversations/Tickets theo customerId, Back/no-F5, regression + real E2E ba browser | Phase CU01/CU02 sở hữu bảo trì và test cases |
| S04 | Đã nối API local | A14/A15/A16/A18/A20, lookup/dossier/PDF/download, PL05 Inbox lookup; regression + real Core/DB/MinIO E2E hai role trên ba browser | Agent citations/context còn P; native PDF toolbar/zoom không thuộc kiểm DOM |
| S05 | Chat hai đầu/realtime và Staff Copilot đã có code | Staff hỏi trong Inbox. Core kiểm quyền chat nguồn, lưu lượt và báo trạng thái qua outbox/WebSocket. Agent đọc lịch sử theo mốc của lượt | Nghiệm thu với model thật và corpus được phép theo [CP01–CP04](staff/plans/08-copilot-contract.md) |
| S06 | TK01–TK05 Core/UI/consumer đã có | A21/A22 read; A23 Accept/version/audit/outbox; UI list→detail/status dropdown/reopen, Notifications toolbar/portal/no-F5 | Phase 3 đã đồng bộ TICKET_CREATED/version và recipient Customer độc lập Staff; Phase 4 đã có unread cycle/cleanup hằng ngày; Phase 5 tool local/hồi quy đã kiểm theo spec Application. Nguồn Agent/summary thuộc I07 riêng; benchmark/fanout còn mở |
| S07 | Handoff I06/Ticket TK05 đã có | A27/A28 union target, recipient/outbox/dedup/reconnect, WS Ticket/catch-up, badge đếm chưa đọc trên toolbar, inline mark read/mark all read, tích hợp Security Notice đổi mật khẩu | Customer center/message read status theo N01/N02 đã duyệt; N03 (Email SMTP cho Ticket qua MailHog) đã hoàn thành và kiểm thử; kiểm riêng quyền và delivery của cả hai role |

## Nền đã triển khai

- [x] Auth email/password/session/CSRF/lock/rate limit và role; Customer own profile/Staff contact, Staff active assignment. Không public provisioning từ Web.
- [x] Account Staff tự sửa tên/phone, concurrency expectedUpdatedAt và audit atomic; các trường định danh/quyền/phòng ban chỉ đọc.
- [x] Customers search/count/phân trang cùng scope, URL/deep link/Back–Forward, retry tại chỗ; hồ sơ chỉ đọc, không KYC trong DTO.
- [x] Staff Policy Lookup và PDF gốc đúng phiên bản, DB information thu gọn, supporting terms/endorsements, signed URL TTL và audit cấp link.
- [x] I01–I05 đã có model/quyền/read/entry/consent/Accept/history/send và browser UI; bằng chứng từng đợt nằm trong phase sở hữu. I06 đã bổ sung SYSTEM, outbox/realtime/catch-up và notification handoff local; Agent runtime vẫn chưa có. HTTP/service, browser mock và gateway E2E ghi riêng, không đánh đồng các lớp.
- [x] Schema InsurancePolicy/PolicyStatus/insurance_policies, giữ lịch sử migration; metadata/version/ownership constraints.
- [x] MinIO private local, volume bền vững, reader/writer tách quyền; Core SDK cấp URL sau kiểm quyền. Bootstrap chung có policy/document/version/PDF synthetic, create-only/checksum và chạy lại an toàn.
- [x] React/Tailwind 4 prefix tw:, Lexend/English, shared Staff routes/layout; đã bỏ legacy stylesheet/Preferences/font picker/fixture nghiệp vụ giả.
- [x] WebSocket receive-only invalidation account/profile/assignment, reconnect và REST resync; I06 đã có chat/notification handoff; Ticket riêng.
- [x] Root .env/Compose, FE/BE chỉ Docker; runtime credentials trong volumes, tool host ngoài repo. Hướng dẫn vận hành tại [Getting Started](../getting-started.md).

## Bảo vệ dữ liệu Customer — bổ sung 12/11/2026

**Phase 1 đã triển khai Core/Web.** Staff list/detail nhận email/phone đã che, Hiện/Ẩn từng trường qua API kiểm quyền và audit metadata. Search chỉ tên/mã; Staff detail dùng birthYear/provinceCity, hiện null vì chưa có nguồn xác minh. Customer self-read giữ nguyên. Kiểm bằng fixture synthetic qua API/DB/gateway/browser, không kết luận về triển khai cloud.

- [x] Email/phone Staff list/detail che mặc định theo định dạng A, có Hiện/Ẩn để liên hệ theo cập nhật 14/11. Core/Web đã triển khai theo CU01/CU02.
- [x] Số hợp đồng Staff hiển thị đầy đủ theo phân công/gate tài nguyên, chốt A ngày 14/11 và khớp source hiện tại.
- [x] CU01-T07/CU02-T06 kiểm reauthorize/audit/Hiện-Ẩn/revoke; hồi quy Policy/PDF giữ gate tài nguyên.
- [x] Search Customer đã chốt A: chỉ tên/mã, không email/phone.
- [x] Core filter/Swagger/Web placeholder chỉ tên/mã; kiểm search/count/URL/Back/page.
- [x] Staff detail chỉ năm sinh/tỉnh-thành đã xác minh, thiếu căn cứ thì ẩn đã chốt A.
- [x] DTO/projection Staff và UI theo CU01-T05; chưa có nguồn xác minh nên null từng trường, không raw birth/address.
- [x] Định dạng A đã chốt cho email giữ 1 ký tự đầu và phone giữ 2 số cuối, phần bị che dùng `***`.
- [x] Core projection/DTO/Web và CU01-T06; API mặc định không raw email/phone.
- [x] Họ tên/mã Customer đã chốt A. Staff có active assignment hợp lệ xem đầy đủ, source hiện đã khớp.
- [x] Phạm vi profile Staff, reveal/audit metadata và lỗi an toàn đã chốt, triển khai theo CU01/CU02. Trường năm sinh/tỉnh-thành chưa có nguồn xác minh trả null; không coi việc thiếu nguồn là policy chưa chốt. [Đặc tả dữ liệu](../configuration-and-data.md#customer-sensitive-data).
- [x] Tách Staff/self và UI Customers; Policy/Inbox/Ticket chỉ nhận tên/mã trong DTO Customer, không có contact card raw.
- [x] Bộ lọc trước Gemini chốt B ngày 14/11 theo source/plan. MVP có sáu quy tắc system prompt trong prompts.py và test đối chiếu thiết kế, dùng dữ liệu synthetic.
- [x] Tests synthetic Core/API/DB và browser Customers/PDF qua gateway; không xác nhận trạng thái cloud hoặc nghiệm thu Agent từ Phase 1.

## Phần tiếp theo

- [x] Ngữ cảnh hợp đồng Copilot đã chốt B ngày 14/11, MVP dùng manual lookup và hợp đồng được nêu/làm rõ trong câu hỏi. Không bổ sung ô chọn hợp đồng hoặc API đổi `linkedPolicyId`.
- [ ] Kiểm CP04-T05 về câu mơ hồ, scope hợp đồng và task/citation đúng view. Manual lookup và Copilot đã có code, nghiệm thu model thật còn mở. [Quyết định chuẩn](../specifications/Agent_Design.md#copilot-policy-selection).

- [x] Logout/hết phiên chốt B ngày 14/11, yêu cầu AI Core đã tiếp nhận tiếp tục xử lý theo quyền tài khoản/tài nguyên hiện hành. Phiên cũ bị chặn, người dùng login lại cùng actor xem kết quả. [Chính sách chuẩn](../specifications/Agent_Design.md#agent-logout-session-policy).
- [ ] Nghiệm thu CH02-T08/CH03-T07/AU03-T05/CP04-T04 với accept/logout race, queued, expiry, callback, login lại và revoke. Baseline logout/session có code, tích hợp Agent còn P.

- [x] Dữ liệu khôi phục Agent chốt A ngày 14/11, giữ checkpoint/receipt/kết quả/sự kiện trong MVP và chưa tự xóa theo thời gian. [Chính sách chuẩn](../configuration-and-data.md#mvp-agent-recovery-retention).
- [ ] Nghiệm thu Task 4 hồi quy retention/restart/fence/replay và event đã ACK còn lưu nhưng không gửi lại.

- [x] Lịch sử chat MVP đã chốt A ngày 14/11, giữ để xem lại và chưa tự xóa theo thời gian. [Chính sách chuẩn](../configuration-and-data.md#mvp-chat-history-retention).
- [ ] Kiểm CH01-T06 với lịch sử cũ, New AI chat, Notification cleanup 30 ngày và quyền/revoke. Dữ liệu khôi phục Agent giữ trong MVP theo A ngày 14/11, log/audit/cache và production tiếp tục chờ chốt.

- [ ] Nghiệm thu chính sách lượt AI lỗi/quá hạn A ngày 14/11/2026 theo CH02-T07/CH03-T06. Core lưu FAILED, UI báo lỗi để Customer chủ động gửi tin mới. Kiểm mất ACK, duplicate delivery, restart/reload và callback muộn theo [quyết định chuẩn](../specifications/Agent_Design.md#failed-turn-policy).

- [ ] Nghiệm thu chat AI mới sau Staff theo quyết định 14/11/2026. Web New AI chat và Core create/receipt đã có. Kiểm context/thread riêng, retry create, callback đúng cuộc và grant độc lập trong CH01-T05/CH02-T05/T06/I03-T06. Cuộc cũ dùng trạng thái/quyền hiện hành, dừng nhắn không tạo Close/command kết thúc. [Quyết định chuẩn](../specifications/Agent_Design.md#new-ai-chat-after-staff).

- [x] Gỡ API/UI/tests/routes lồng của bản thử Inbox/Ticket; giữ Account/Customers/Policy độc lập.
- [x] Ghi [kế hoạch Inbox/chat](staff/plans/inbox/00-inbox-spec.md) có enum, accordion khách, tên/mã search, chat cuộn, API/schema/phase.
- [x] I01–I06: model/gate/legacy/metadata/consent/Accept/history/send/UI/realtime đã triển khai; pending không đọc A10.
- [ ] Triển khai FR-006 theo đặc tả kỹ thuật đã chốt: Staff có quyền xem toàn bộ lịch sử Customer-facing từ tin đầu tiên (Customer chưa gán thì Staff bất kỳ, đã gán thì đúng Staff phụ trách), Takeover chủ động khi AI đang xử lý (A14 takeover) và kiểm soát quyền đánh dấu đã đọc (readAt). [Kế hoạch Inbox](staff/plans/03-inbox-contract.md#6-đặc-tả-mở-rộng-quyền-đọc-và-takeover--fr-006).
- [x] Consent/request/Accept/handoff notification/SYSTEM không tự tạo Ticket, fence nền đã có I01–I06.
- [x] Application Phase 2: manual/draft Core, validation/CAS/fingerprint/snapshot/receipt và retry Web; có kiểm Core/DB/gateway/browser.
- [x] A2-04: đổi actor khi manual/confirm pending, bỏ phản hồi cũ và tách intent/receipt theo actor.
- [ ] Tích hợp Agent writer, sáu nhóm summary/source refs theo I07/T01/T02; chưa nghiệm thu Agent thật.
- [x] Product catalog P01 Core/gateway có API Public đúng role và metadata hiện hành.
- [x] Product documents P02 có kiểm quyền, audit và cấp signed URL qua Core/MinIO.
- [x] Staff Products P03 có catalog/search/detail và PDF viewer.
- [x] Customer Policy/PDF và Products đã nối API theo ownership/public catalog.
- [x] Session boundary có retry, freshness và xử lý invalidation/expiry theo Auth.
- [x] PDF viewer giữ file/version hiện tại khi metadata không đổi và xóa khi mất quyền.
- [ ] E2E tích hợp/CI, các trình duyệt khác, concurrency/catch-up/expiry/storage lỗi và benchmark; không lấy invalidation local làm cam kết production.

Mã gap/điều kiện đóng nằm duy nhất tại [G01–G09](staff/plans/README.md#phần-còn-lại-theo-chức-năng). Chi tiết chức năng tại [Staff index](staff/README.md); thứ tự tiếp theo tại [next steps](../next-steps.md).

## Truy vết yêu cầu

| Yêu cầu | Độ phủ hiện tại |
| --- | --- |
| FR-001 | Local login/session/logout/password đã có cho tài khoản cấp sẵn; tự đăng ký không thuộc MVP theo quyết định 07/11. External IdP không là điều kiện hoàn tất chức năng login local |
| FR-002 | Staff xem khách đúng assignment; Customer xem own profile chỉ đọc theo phạm vi chốt 13/11. Staff self-edit là yêu cầu bổ sung đã triển khai |
| FR-003 / UC-003 | Staff list/detail/search/phân trang đúng assignment đã nối; có Core tests và regression FE, chưa E2E đầy đủ |
| FR-005/006/007 | Chat Customer–Staff/consent/Accept/send/realtime đã có; Agent có graph/adapter/store; FR-006 đã chốt toàn bộ đặc tả kỹ thuật (canView/takeover/readAt, bỏ qua đổi phân công) và sẵn sàng triển khai code; luồng AI trả lời/Copilot qua Core và UI chưa được nghiệm thu, không đánh dấu đủ FR-005/007 |
| FR-008 / UC-007 | Staff/Customer policy/PDF và product catalog/documents/UI đã có. Retrieval AI và mapping nguồn áp dụng cho RAG là phần Agent riêng; không nghiệm thu từ UI đọc PDF |
| FR-009/010/011/012/013 / UC-005/006 | Own/authorized history, Staff handoff và Ticket read/Accept/status/UI/notification đã có. Phase 2 đã sửa Customer draft/manual/confirmation, replay/CAS/snapshot/receipt; I07 còn tích hợp nguồn Agent/summary; AI Copilot còn phần triển khai; không đánh dấu đủ nhóm FR |
| NFR-001/002 | Baseline auth/assignment/CSRF/allowlist/synthetic ở API hiện có; retrieval/tool scope chưa làm |
| NFR-003 | Staff đọc DB/snapshot và exact document version; AI safety/retrieval pipeline chưa làm |
| NFR-005/006 | Handoff và Ticket+outbox đã có source; Unread/read-cycle và retention đã triển khai theo Phase 4. Chưa đo workload/SLA thông báo5 giây, không suy từ test local |
| NFR-007 | Staff/Customer signed PDF access/TTL/phiên bản đã có. Signed URL không thu hồi tức thì, audit cấp link không chứng minh tải thành công |
| NFR-004/008 | HTTP request metadata/audit local có một phần; chưa benchmark hoặc observability Agent/notification đầy đủ |

Bảng FR nguồn không có FR-004. Ticket thủ công đã thuộc phạm vi Customer theo quyết định 13/11; notification center Customer và message read status đã duyệt theo N01/N02; FR-013 trong repo phản ánh phạm vi hai role. Bản Data Model nguồn khác baseline local ở một số ràng buộc; xem [architecture](../architecture.md#local-data-model) và [Policies](staff/plans/05-policies-contract.md#quan-hệ-dữ-liệu-và-phiên-bản), không sửa nguồn/ADR chỉ từ tiến độ UI.

## Kiểm thử

Các lớp API/DB, browser mock và gateway E2E theo [quy ước UI](README.md#quy-ước-test-case-và-sequence-diagram). Lệnh chạy tại [tài liệu chức năng Application](README.md); test case và trạng thái nghiệm thu theo phase chức năng.
