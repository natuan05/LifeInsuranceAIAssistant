# Tiến độ triển khai UI và độ phủ yêu cầu

Products P03 cập nhật 04/11/2026: PDF tự hiển thị khi chọn sản phẩm, bộ chọn khi nhiều tài liệu; bỏ View PDF/Refresh documents/Close preview. Realtime giữ bản đang đọc và thông báo chuyển phiên bản mới; bị gỡ/mất quyền thì xóa. 45 test pass (18 Products mock +26 Policy/PDF regression +1 E2E Core/MinIO thật); lint/Docker build/typecheck pass. Chi tiết tại [P03](staff/plans/products/03-staff-products-ui.md).

Cập nhật 05/11/2026: PL05 Quick Policy Lookup trong Inbox (modal in-place và tab mới) đã hoàn tất. Notification center bổ sung badge đếm số lượng chưa đọc, đánh dấu đọc tại chỗ từng mục và toàn bộ, tích hợp thông báo đổi mật khẩu bảo mật. 29 test browser pass (20 staff-inbox + 8 conversation-realtime + 1 ticket-flow).

Đối chiếu source **05/11/2026**. Đây là snapshot hiện tại, không phải nhật ký triển khai hoặc nghiệm thu toàn bộ FR/NFR. Operator là công cụ riêng; Web/Core local chạy Docker qua gateway.

[Thứ tự đọc](README.md) · [Menu đích](menu.md) · [Chỉ mục Staff](staff/README.md) · [API E/P](staff/plans/00-staff-contract.md#api-theo-chức-năng) · [Gap G01–G10](staff/plans/README.md#phần-còn-lại-theo-chức-năng)

Products **P01/A17 và P02/A19/access đã có Core/MinIO/gateway**, P03 Staff UI đã triển khai: [Staff Products](staff/plans/04-products-contract.md). [Customer theo chức năng và phase](customer/plans/README.md) vẫn chưa triển khai UI mới; dùng chung A17/A19/access. Tách phần không Agent khỏi Agent/Ticket và đề xuất notification center Customer.

## Quy ước

**Đã nối API**: UI dùng Core hiện có. **Một phần**: thiếu phần trong phạm vi chức năng. **Khung**: có route/bố cục nhưng chưa nghiệp vụ. **Chưa làm**: chưa có luồng. `[x]` chỉ xác nhận dòng cụ thể, không chứng minh E2E, benchmark hoặc production. API/routes/checklist và gap nằm trong contract chức năng; plans/README chỉ dẫn tới owner.

## Ma trận màn hình

| Mã | Trạng thái | Đã có | Còn thiếu |
| --- | --- | --- | --- |
| C01 | Một phần FR-001 | Login email/password/session/role | Registration A01/A02; reset/OTP/SSO không tự là Must |
| C02 | Một phần UX | `/customer` đọc hồ sơ/contact và chat tối thiểu | H01 shell và H02 Home nhẹ, không API metrics mặc định |
| C03 | Core catalog/access đã có, UI chưa làm | A17/P01 và A19/access/P02 hai role | UI Customer PR01/PR02 |
| C04 | Chưa làm | Schema policy, quan hệ nhiều policy/khách | Customer list/detail/quyền lợi/kỳ phí theo ownership |
| C05 | Chưa làm phía Customer | Storage private và metadata/file dùng chung đã có | Customer catalog/view/download và UI |
| C06 | I03–I06 đã nối nền | Own list/create/AI/Direct/history/handoff/consent/send/realtime/SYSTEM | CH01 layout mới; CH02/CH03 Agent trả lời thật/citations |
| C07 | Chưa làm | Schema Ticket/outbox, plan I07 | Trusted draft/explicit confirmation/result/detail theo I07/T01/T02; manual/list tổng riêng |
| C08 | Một phần | Hồ sơ chỉ đọc/Staff contact, account/password/logout | Sửa hồ sơ và menu/style Customer mới |
| C09 | Đề xuất UX, chưa chốt | SYSTEM và chat realtime có I06, không Customer Notification row | N01 quyết định scope trước N02; không yêu cầu Must từ FR-013 |
| S01 | Đã nối API local | Login/session/account/password/logout, GET/PATCH staff/me; 15 regression form + 22 phiên/retry không F5, focus freshness 30 giây | E2E/trình duyệt khác |
| S02 | I01–I06 đã nối | Model/quyền/groups/lazy/search/cursor/Accept/chat/send/realtime, không counts | I07 Ticket riêng; QA tích hợp rộng hơn |
| S03 | Đã nối API local | Customers list/detail/search/page/retry, hợp đồng/PDF; 15 regression FE | Link theo khách là UX tùy scope; bổ sung E2E thật trong CU02 |
| S04 | Một phần | A14/A15/A16/A18/A20 và FE list/lookup/detail/catalog/PDF/download; thu gọn cột kết quả, refresh giữ iframe/src, PL05 Quick Policy Lookup trong Inbox (modal overlay và tab mới) và 26 regression Policies | Products P01–P03 đã có riêng; Customer access/Agent citations/context còn P; bổ sung E2E policy thật trong PL03 |
| S05 | Chat hai đầu/realtime đã nối | Consent/handoff/Accept/history/send/SYSTEM/catch-up | Agent/Copilot/history nội bộ/summary/checkpoint |
| S06 | TK01–TK05 Core/UI/consumer đã có | A21/A22 read; A23 Accept/version/audit/outbox; UI list→detail/status dropdown/reopen, Notifications toolbar/portal/no-F5;63 Core +3 migration tests trong đợt status;22 browser (14 Ticket mock/1 real hai-tab +7 handoff) | I07 draft/confirmation/producer riêng; benchmark/fanout còn mở |
| S07 | Handoff I06/Ticket TK05 đã có | A27/A28 union target, recipient/outbox/dedup/reconnect, WS Ticket/catch-up, badge đếm chưa đọc trên toolbar, inline mark read/mark all read, tích hợp Security Notice đổi mật khẩu | Producer tạo I07 sau, Customer center/read receipt không tự thêm |

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

## Phần tiếp theo

- [x] Gỡ API/UI/tests/routes lồng của bản thử Inbox/Ticket; giữ Account/Customers/Policy độc lập.
- [x] Ghi [kế hoạch Inbox/chat](staff/plans/inbox/00-inbox-spec.md) có enum, accordion khách, tên/mã search, chat cuộn, API/schema/phase.
- [x] I01–I06: model/gate/legacy/metadata/consent/Accept/history/send/UI/realtime đã triển khai; pending không đọc A10.
- [x] Chốt pending chỉ metadata, sau Accept toàn bộ lịch sử Customer-facing; bỏ counts/Closed chat đích, tách handoff và Ticket trong tài liệu.
- [x] Consent/request/Accept/handoff notification/SYSTEM không tự tạo Ticket, fence nền đã có I01–I06.
- [ ] Ticket theo gợi ý Agent + xác nhận riêng, Ticket+outbox atomic và Agent writer contract ở I07/CH02.
- [x] Product A17/P01 Core/gateway:10 test HTTP/PostgreSQL +1 gateway pass, lint/build pass;78 test hồi quy chat pass. Không browser E2E/UI Products.
- [x] Product A19/access P02:13 Core/HTTP/MinIO test +1 gateway pass;88 regression pass (10 P01 +78 chat), lint/build pass. Không browser E2E/UI Products.
- [x] Staff Products P03:17 browser test mock +1 E2E Core/PostgreSQL/MinIO th?t;93 regression Account/Session/Customers/Policy/Inbox pass; t?ng111 pass, kh?ng flaky.
- [ ] Customer ownership Policy/PDF theo PO01/PO02/D01/D02. Quick lookup/đổi context không tự thành phần Must.
- [x] Việc 01: retry khôi phục phiên không F5, dedup/abort/role/next; có 22 regression Session, gồm tối ưu focus/visibility 30 giây và bypass khi invalidation/expiry.
- [x] Việc 02: metadata revalidate nền, giữ iframe/src cùng file/version; revoke/expiry/download/actor đổi đúng lifecycle; 26 regression Policies mới.
- [ ] E2E tích hợp/CI, các trình duyệt khác, concurrency/catch-up/expiry/storage lỗi và benchmark; không lấy invalidation local làm cam kết production.

Mã gap/điều kiện đóng nằm duy nhất tại [G01–G10](staff/plans/README.md#phần-còn-lại-theo-chức-năng). Chi tiết chức năng tại [Staff index](staff/README.md); thứ tự tiếp theo tại [next steps](../next-steps.md).

## Truy vết yêu cầu

| Yêu cầu | Độ phủ hiện tại |
| --- | --- |
| FR-001 | Local login/session/logout/password có; public registration/IdP chưa có, chưa hoàn tất toàn FR |
| FR-002 | Staff xem khách đúng assignment; Customer own profile chỉ đọc, chưa quản lý/sửa. Staff self-edit là yêu cầu bổ sung đã triển khai |
| FR-003 / UC-003 | Staff list/detail/search/phân trang đúng assignment đã nối; có Core tests và regression FE, chưa E2E đầy đủ |
| FR-005/006/007 | Chat Customer–Staff/consent/Accept/send/realtime đã có; AI trả lời/Copilot chưa có, không đánh dấu đủ FR-005/007 |
| FR-008 / UC-007 | Staff policy/PDF và Core product catalog A17 hai role đã có; product documents/UI và Customer owner policy/PDF còn thiếu, chưa đủ toàn FR |
| FR-009/010/011/012/013 / UC-005/006 | Own/authorized history và Staff handoff notification đã có I03–I06; Ticket/draft confirmation/AI summary/Copilot còn thiếu, không đánh dấu đủ nhóm FR |
| NFR-001/002 | Baseline auth/assignment/CSRF/allowlist/synthetic ở API hiện có; retrieval/tool scope chưa làm |
| NFR-003 | Staff đọc DB/snapshot và exact document version; AI safety/retrieval pipeline chưa làm |
| NFR-005/006 | Handoff outbox/realtime local có I06; Ticket+outbox nghiệp vụ còn I07. Chưa đo workload/SLA thông báo5 giây, không suy từ test local |
| NFR-007 | Staff signed PDF access/TTL/phiên bản có; Customer còn thiếu. Signed URL không thu hồi tức thì, audit cấp link không chứng minh tải thành công |
| NFR-004/008 | HTTP request metadata/audit local có một phần; chưa benchmark hoặc observability Agent/notification đầy đủ |

Bảng FR nguồn không có FR-004. Ticket thủ công/notification center Customer là đề xuất mở rộng, không tự là Must; FR-013 chỉ System→Staff. Bản Data Model nguồn khác baseline local ở một số ràng buộc; xem [architecture](../architecture.md#local-data-model) và [Policies](staff/plans/05-policies-contract.md#quan-hệ-dữ-liệu-và-phiên-bản), không sửa nguồn/ADR chỉ từ tiến độ UI.

## Bằng chứng kiểm thử và giới hạn

| Lớp | Bằng chứng đã ghi nhận ở các đợt trước | Giới hạn |
| --- | --- | --- |
| Core integration | Customers 7 test; Policies 10; HTTP/realtime 6; suites version trong apps/core/test | PolicyStorageService được mock trong Policy suite; không thay kiểm MinIO thật |
| Browser regression | Account 15 + Session 22 + Customers 15 + Policies 26 Chromium; scripts version trong apps/web/tests/browser | API/phiên và WebSocket được giả lập; không ghi DB, không E2E Core authorization |
| Gateway/storage smoke | Cấp URL, file PDF trùng byte, disposition, Range/CORS, anonymous/tampered bị chặn | Kiểm từng lớp, chưa browser E2E tự động đầy đủ |
| Policy Lookup browser smoke | Search/status/page/Enter/URL/Back–Forward, chọn PDF, mobile và thu gọn cột | Đã có 26 regression Policy/PDF với mock; còn E2E/CI/MinIO thật và native PDF page/zoom |
| Bootstrap policy | 4 seed tests; rerun/preservation/collision/rollback/retry, PDF ổn định/checksum | Không phụ thuộc fixture riêng trên máy người chạy; không nghiệm thu UI/Agent |
| Static/build | Các đợt trước đã chạy lint/typecheck/Docker build | Không chứng minh nghiệp vụ, hiệu năng hoặc pixel-perfect |

Tối ưu kiểm phiên khi quay lại tab ngày **03/11/2026** đã qua Web lint/typecheck, Docker build/up và **78 ca browser pass** (15 Account + 22 Session + 15 Customers + 26 Policies). Suite kiểm đúng ranh giới freshness 30 giây, không auth thừa bởi focus/ready, invalidate/expiry bypass và cổng login theo role đã xác thực; không đổi auth từng API Core. Bằng chứng việc 01/02 ban đầu ở [kế hoạch 01](staff/plans/auth/03-session-lifecycle.md#8-kết-quả-triển-khai-03112026), [kế hoạch 02](staff/plans/policies/04-viewer-lifecycle.md#9-kết-quả-triển-khai-03112026). Các test backend/storage là bằng chứng trước, không chạy lại trong đợt FE này. Browser dùng API/WebSocket/PDF mock, không E2E Core/DB/MinIO hoặc kiểm page/zoom native PDF. Chi tiết hành vi hiện tại tại [Account](staff/plans/01-auth-contract.md#kiểm-phiên-khi-quay-lại-tab), lệnh/giới hạn từng suite ở file chức năng và [Getting Started](../getting-started.md#commands).
