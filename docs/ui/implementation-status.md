# Tiến độ triển khai UI và độ phủ yêu cầu

Products P03 cập nhật 04/11/2026: PDF tự hiển thị khi chọn sản phẩm, bộ chọn khi nhiều tài liệu; bỏ View PDF/Refresh documents/Close preview. Realtime giữ bản đang đọc và thông báo chuyển phiên bản mới; bị gỡ/mất quyền thì xóa. 45 test pass (18 Products mock +26 Policy/PDF regression +1 E2E Core/MinIO thật); lint/Docker build/typecheck pass. Chi tiết tại [P03](staff/plans/products/03-staff-products-ui.md).

Cập nhật 05/11/2026: PL05 Quick Policy Lookup trong Inbox (modal in-place và tab mới) đã hoàn tất. Notification center bổ sung badge đếm số lượng chưa đọc, đánh dấu đọc tại chỗ từng mục và toàn bộ, tích hợp thông báo đổi mật khẩu bảo mật. 29 test browser pass (20 staff-inbox + 8 conversation-realtime + 1 ticket-flow).

Customer Portal cập nhật 05/11/2026: Đã hoàn tất triển khai UI Customer tích hợp bao gồm Shell H01, Home H02 (portfolio thực tế, tiêu đề đen ASSIGNED SUPPORT STAFF chuẩn, bỏ card tĩnh Paperless Policy), Products PR01/PR02 (danh sách, tìm kiếm, nút View Details xem chi tiết giải pháp kèm Back to Solutions, bỏ nút ép mở chat, xem/tải PDF tài liệu PUBLIC qua SignedPdfPreview), và My Policies PO01/PO02/D01/D02 (tra cứu hợp đồng, quyền lợi, lịch phí, xem hợp đồng PDF). Giao diện 100% tiếng Anh nhất quán. Tất cả test customer-conversations (5/5), customer-policies (5/5), staff-inbox (20/20) pass. Docker web container đã rebuild sạch.

Baseline UI **05/11/2026**, bổ sung quyết định và đối chiếu source đến **14/11/2026** tại [ma trận code/quyết định](../source-review.md#code-decision-alignment). Các kết quả test có ngày bên trên thuộc đợt tương ứng, không phải nghiệm thu lại toàn bộ FR/NFR. Operator là công cụ riêng; Web/Core local chạy Docker qua gateway.

[Thứ tự đọc](README.md) · [Menu đích](menu.md) · [Chỉ mục Staff](staff/README.md) · [API E/P](staff/plans/00-staff-contract.md#api-theo-chức-năng) · [Gap G01–G09](staff/plans/README.md#phần-còn-lại-theo-chức-năng)

Products **P01/A17 và P02/A19/access đã có Core/MinIO/gateway**, P03 Staff UI đã triển khai: [Staff Products](staff/plans/04-products-contract.md). [Customer plans](customer/plans/README.md) có H01/H02, PR01/PR02 và PO01/PO02/D01/D02 đã triển khai; hồ sơ Customer chỉ đọc theo quyết định 13/11; Agent/Ticket confirmation và notification center Customer theo phase sở hữu. Tài khoản cấp sẵn đã chốt 07/11, không còn registration backlog trong MVP.

## Quy ước

**Đã nối API**: UI dùng Core hiện có. **Một phần**: thiếu phần trong phạm vi chức năng. **Khung**: có route/bố cục nhưng chưa nghiệp vụ. **Chưa làm**: chưa có luồng. `[x]` chỉ xác nhận dòng cụ thể, không chứng minh E2E, benchmark hoặc production. API/routes/checklist và gap nằm trong contract chức năng; plans/README chỉ dẫn tới owner.

## Ma trận màn hình

| Mã | Trạng thái | Đã có | Còn thiếu |
| --- | --- | --- | --- |
| C01 | Login/session đã có local | Tài khoản được cấp sẵn; email/password/session/role | Không yêu cầu tự đăng ký; reset/OTP/SSO không tự là Must. Chưa suy production/NFR đã đạt từ local |
| C02 | Đã nối API local | H01 shell điều hướng, H02 Home hiển thị portfolio từ dữ liệu hợp đồng thực tế, lối tắt dịch vụ và Staff phụ trách | Đã tinh chỉnh tiêu đề đen ASSIGNED SUPPORT STAFF, gỡ card tĩnh Paperless Policy |
| C03 | Đã nối API local | PR01 catalog/search/detail tại chỗ, nút View Details, PR02 xem/tải PDF tài liệu PUBLIC qua SignedPdfPreview | Đã bỏ nút ép chat; khách hàng tự chủ động vào chat khi có nhu cầu |
| C04 | Đã nối API local | PO01/PO02 danh sách/chi tiết hợp đồng, quyền lợi, lịch phí theo ownership | 5/5 browser tests pass |
| C05 | Đã nối API local | D01/D02 xem/tải PDF hợp đồng sở hữu qua MinIO presigned URL | Tích hợp SignedPdfPreview |
| C06 | I03–I06 và CH01 đã nối | Own list/create/AI/Direct/history/handoff/consent/send/realtime/SYSTEM trong Customer shell | CH02/CH03 Agent trả lời thật/citations |
| C07 | Application Phase 2 đã triển khai; còn một ca kiểm browser | Manual-create, draft read/edit/confirm, validation/replay/CAS/snapshot/receipt và own list/detail | Kiểm A2-04 đổi actor khi Ticket pending; tích hợp nguồn Agent thật và sáu nhóm summary/source refs theo I07/T01/T02 |
| C08 | Đã nối API local | Hồ sơ chỉ đọc/Staff contact, account/password/logout, menu cá nhân rút gọn | Hồ sơ chỉ đọc theo PF01/02; kiểm thử hồi quy và masking theo phạm vi riêng |
| C09 | Source có schema/API/UI; cần review | Chat/SYSTEM, recipient Customer, read/read-all, message.readAt, chuông/realtime và cleanup | Hoàn thiện DTO/event; sửa gộp theo chu kỳ đọc chat, giữ id/bật unread khi có tin mới; đổi cleanup từ mỗi giờ sang khi khởi động + mỗi 24 giờ theo phương án B; chạy tests N01/N02, retention 30 ngày chung Customer/Staff |
| S01 | Đã nối API local | Login/session/account/password/logout, GET/PATCH staff/me; regression + gateway/Core/DB E2E trên Chromium/Firefox/WebKit | Auth mở rộng ngoài MVP theo yêu cầu riêng |
| S02 | I01–I06 đã nối | Model/quyền/groups/lazy/search/cursor/Accept/chat/send/realtime, không counts | I07 Ticket riêng; QA tích hợp rộng hơn |
| S03 | Đã nối API local | Customers list/detail/search/page/retry, policies/PDF; Conversations/Tickets theo customerId, Back/no-F5, regression + real E2E ba browser | Phase CU01/CU02 sở hữu bảo trì và test cases |
| S04 | Đã nối API local | A14/A15/A16/A18/A20, lookup/dossier/PDF/download, PL05 Inbox lookup; regression + real Core/DB/MinIO E2E hai role trên ba browser | Agent citations/context còn P; native PDF toolbar/zoom không thuộc kiểm DOM |
| S05 | Chat hai đầu/realtime đã nối | Consent/handoff/Accept/history/send/SYSTEM/catch-up | Agent/Copilot/history nội bộ/summary/checkpoint |
| S06 | TK01–TK05 Core/UI/consumer đã có | A21/A22 read; A23 Accept/version/audit/outbox; UI list→detail/status dropdown/reopen, Notifications toolbar/portal/no-F5;63 Core +3 migration tests trong đợt status;22 browser (14 Ticket mock/1 real hai-tab +7 handoff) | I07 draft/confirmation/producer riêng; benchmark/fanout còn mở |
| S07 | Handoff I06/Ticket TK05 đã có | A27/A28 union target, recipient/outbox/dedup/reconnect, WS Ticket/catch-up, badge đếm chưa đọc trên toolbar, inline mark read/mark all read, tích hợp Security Notice đổi mật khẩu | Customer center/message read status theo N01/N02 đã duyệt; kiểm riêng quyền và delivery của cả hai role |

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
- [ ] Kiểm CP04-T05 về câu mơ hồ, scope hợp đồng và task/citation đúng view. Manual lookup đã có, Copilot còn P. [Quyết định chuẩn](../specifications/Agent_Design.md#copilot-policy-selection).

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
- [x] Chốt pending chỉ metadata, sau Accept toàn bộ lịch sử Customer-facing; bỏ counts/Closed chat đích, tách handoff và Ticket trong tài liệu.
- [x] Consent/request/Accept/handoff notification/SYSTEM không tự tạo Ticket, fence nền đã có I01–I06.
- [x] Application Phase 2: manual/draft Core, validation/CAS/fingerprint/snapshot/receipt và retry Web; có kiểm Core/DB/gateway/browser.
- [ ] A2-04: ca browser Ticket chuyên biệt đổi Customer actor khi manual/confirm pending; source có binding nhưng chưa đủ bằng chứng để đóng tiêu chí này.
- [ ] Tích hợp Agent writer, sáu nhóm summary/source refs theo I07/T01/T02; chưa nghiệm thu Agent thật.
- [x] Product A17/P01 Core/gateway:10 test HTTP/PostgreSQL +1 gateway pass, lint/build pass;78 test hồi quy chat pass. Không browser E2E/UI Products.
- [x] Product A19/access P02:13 Core/HTTP/MinIO test +1 gateway pass;88 regression pass (10 P01 +78 chat), lint/build pass. Không browser E2E/UI Products.
- [x] Staff Products P03:17 browser test mock +1 E2E Core/PostgreSQL/MinIO th?t;93 regression Account/Session/Customers/Policy/Inbox pass; t?ng111 pass, kh?ng flaky.
- [x] Customer ownership Policy/PDF theo PO01/PO02/D01/D02 đã hoàn tất; Products PR01/PR02 danh sách/chi tiết/xem PDF tài liệu đã hoàn tất (5/5 browser tests pass, Docker web pass). Bỏ ép luồng chat trực tiếp, chuyển sang View Details tại chỗ.
- [x] Việc 01: retry khôi phục phiên không F5, dedup/abort/role/next; có 22 regression Session, gồm tối ưu focus/visibility 30 giây và bypass khi invalidation/expiry.
- [x] Việc 02: metadata revalidate nền, giữ iframe/src cùng file/version; revoke/expiry/download/actor đổi đúng lifecycle; 26 regression Policies mới.
- [ ] E2E tích hợp/CI, các trình duyệt khác, concurrency/catch-up/expiry/storage lỗi và benchmark; không lấy invalidation local làm cam kết production.

Mã gap/điều kiện đóng nằm duy nhất tại [G01–G09](staff/plans/README.md#phần-còn-lại-theo-chức-năng). Chi tiết chức năng tại [Staff index](staff/README.md); thứ tự tiếp theo tại [next steps](../next-steps.md).

## Truy vết yêu cầu

| Yêu cầu | Độ phủ hiện tại |
| --- | --- |
| FR-001 | Local login/session/logout/password đã có cho tài khoản cấp sẵn; tự đăng ký không thuộc MVP theo quyết định 07/11. External IdP không là điều kiện hoàn tất chức năng login local |
| FR-002 | Staff xem khách đúng assignment; Customer xem own profile chỉ đọc theo phạm vi chốt 13/11. Staff self-edit là yêu cầu bổ sung đã triển khai |
| FR-003 / UC-003 | Staff list/detail/search/phân trang đúng assignment đã nối; có Core tests và regression FE, chưa E2E đầy đủ |
| FR-005/006/007 | Chat Customer–Staff/consent/Accept/send/realtime đã có; Agent có graph/adapter/store, luồng AI trả lời/Copilot qua Core và UI chưa được nghiệm thu, không đánh dấu đủ FR-005/007 |
| FR-008 / UC-007 | Staff/Customer policy/PDF và product catalog/documents/UI đã có. Retrieval AI và mapping nguồn áp dụng cho RAG là phần Agent riêng; không nghiệm thu từ UI đọc PDF |
| FR-009/010/011/012/013 / UC-005/006 | Own/authorized history, Staff handoff và Ticket read/Accept/status/UI/notification đã có. Phase 2 đã sửa Customer draft/manual/confirmation, replay/CAS/snapshot/receipt; I07 còn tích hợp nguồn Agent/summary; AI Copilot còn phần triển khai; không đánh dấu đủ nhóm FR |
| NFR-001/002 | Baseline auth/assignment/CSRF/allowlist/synthetic ở API hiện có; retrieval/tool scope chưa làm |
| NFR-003 | Staff đọc DB/snapshot và exact document version; AI safety/retrieval pipeline chưa làm |
| NFR-005/006 | Handoff outbox/realtime local có I06; Ticket+outbox nghiệp vụ còn I07. Chưa đo workload/SLA thông báo5 giây, không suy từ test local |
| NFR-007 | Staff/Customer signed PDF access/TTL/phiên bản đã có. Signed URL không thu hồi tức thì, audit cấp link không chứng minh tải thành công |
| NFR-004/008 | HTTP request metadata/audit local có một phần; chưa benchmark hoặc observability Agent/notification đầy đủ |

Bảng FR nguồn không có FR-004. Ticket thủ công đã thuộc phạm vi Customer theo quyết định 13/11; notification center Customer và message read status đã duyệt theo N01/N02; FR-013 trong repo phản ánh phạm vi hai role. Bản Data Model nguồn khác baseline local ở một số ràng buộc; xem [architecture](../architecture.md#local-data-model) và [Policies](staff/plans/05-policies-contract.md#quan-hệ-dữ-liệu-và-phiên-bản), không sửa nguồn/ADR chỉ từ tiến độ UI.

## Bằng chứng kiểm thử và giới hạn

| Lớp | Bằng chứng đã ghi nhận ở các đợt trước | Giới hạn |
| --- | --- | --- |
| Core integration | Customers 7 test; Policies 10; HTTP/realtime 6; suites version trong apps/core/test | PolicyStorageService được mock trong Policy suite; không thay kiểm MinIO thật |
| Browser regression | Account 15 + Session 22 + Customers 15 + Policies 26 Chromium; scripts version trong apps/web/tests/browser | API/phiên và WebSocket được giả lập; không ghi DB, không E2E Core authorization |
| Gateway/storage smoke | Cấp URL, file PDF trùng byte, disposition, Range/CORS, anonymous/tampered bị chặn | Kiểm từng lớp, chưa browser E2E tự động đầy đủ |
| Policy Lookup browser smoke | Search/status/page/Enter/URL/Back–Forward, chọn PDF, mobile và thu gọn cột | Đã có 26 regression Policy/PDF với mock; còn E2E/CI/MinIO thật và native PDF page/zoom |
| Bootstrap policy | 4 seed tests; rerun/preservation/collision/rollback/retry, PDF ổn định/checksum | Không phụ thuộc fixture riêng trên máy người chạy; không nghiệm thu UI/Agent |
| Static/build | Các đợt trước đã chạy lint/typecheck/Docker build | Không chứng minh nghiệp vụ, hiệu năng hoặc pixel-perfect |

Tối ưu kiểm phiên khi quay lại tab ngày **03/11/2026** đã qua Web lint/typecheck, Docker build/up và **78 ca browser pass** (15 Account + 22 Session + 15 Customers + 26 Policies). Suite kiểm đúng ranh giới freshness 30 giây, không auth thừa bởi focus/ready, invalidate/expiry bypass và cổng login theo role đã xác thực; không đổi auth từng API Core. Bằng chứng việc 01/02 ban đầu ở [kế hoạch 01](staff/plans/auth/03-session-lifecycle.md#8-ghi-chú-triển-khai), [kế hoạch 02](staff/plans/policies/04-viewer-lifecycle.md#9-ghi-chú-triển-khai). Các test backend/storage là bằng chứng trước, không chạy lại trong đợt FE này. Browser dùng API/WebSocket/PDF mock, không E2E Core/DB/MinIO hoặc kiểm page/zoom native PDF. Chi tiết hành vi hiện tại tại [Account](staff/plans/01-auth-contract.md#kiểm-phiên-khi-quay-lại-tab), lệnh/giới hạn từng suite ở file chức năng và [Getting Started](../getting-started.md#commands).
