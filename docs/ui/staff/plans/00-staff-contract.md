# Staff — contract chung và ranh giới nghiệm thu

UI Staff không hiển thị các hướng dẫn thao tác thừa như “Press Enter to search”, giới hạn tìm kiếm hoặc nhắc phím tắt chat. Giữ nhãn trường, trạng thái và lỗi cần thiết; thao tác bàn phím vẫn hoạt động.

04/11/2026 · [Chỉ mục phase](README.md) · [API E/P](00-staff-contract.md#api-theo-chức-năng) · [Routes](00-staff-contract.md#điều-hướng) · [Customer chung](../../customer/plans/00-customer-contract.md).

## 1. Nguồn và trạng thái

Requirement FR-001/002/003/006/007/008/010/011/012/013, NFR-001–008; [SRS](../../../specifications/Requirement.md), [Data Model](../../../specifications/Data_Model.md), [kiến trúc](../../../architecture.md), [quyết định local](../../../source-review.md). Prisma trong apps/core/prisma/schema.prisma và controller/service hiện hành dùng để xác minh runtime; UI mẫu không là nguồn quyền/nghiệp vụ.

**E** là code đã có, **P** là đề xuất/chưa implement. Các AU/CU/PL/NO bổ sung mô tả cho code đã làm, không phải code mới hoặc test vừa chạy. I01–I06/P01–P03 đã có; Ticket/Copilot và phần nghiệm thu còn mở được ghi đúng phase. Không đánh dấu trọn FR-001 cho đăng ký chưa có, FR-007/012 cho Agent chưa chạy, FR-010 cho route Ticket còn khung.

## 2. Model và quyền

| Model | Quy tắc Staff |
| --- | --- |
| User/StaffProfile/AuthSession | Actor/role/lock từ session; không client chọn StaffId hoặc LLM xác định quyền |
| StaffAssignment/CustomerProfile | Active assignment để đọc hồ sơ/policy; không đủ để đọc AI chat riêng |
| InsurancePolicy/InsuranceProduct | Hợp đồng theo khách; sản phẩm inactive không ẩn policy lịch sử; financials/null/date-only theo DTO |
| Document/DocumentVersion | PUBLIC/PRIVATE_POLICY; product current published version khác policy exact applied version; không PRIVATE_CUSTOMER/Document.kind |
| Conversation/ConversationHandoff/Message (consent/acceptance trong handoff) | AI_ACTIVE/PENDING_HANDOFF/STAFF_ACTIVE; Direct hợp lệ hoặc consent+Accept mới transcript, sau Accept toàn lịch sử Customer-facing |
| SupportTicket | TicketStatus giữ OPEN/ASSIGNED/IN_PROGRESS/RESOLVED/CLOSED; không chat Closed. TK01 version/policy nội bộ đã có; confirmed snapshot I07 còn P |
| Notification/OutboxEvent | Recipient Staff, dedup/retry/outbox sau commit; không Customer recipient hoặc delivered/read ACK chat |

Assignment, chat controller, Ticket assignee và notification recipient là những quan hệ khác nhau. Biết UUID/link/Ticket không mở transcript. Copilot/internal/tool traces không lọt Customer-facing APIs/events.

## 3. Protocol và transaction

Prefix REST /api/v1, GET no-store, cookie phiên HttpOnly. Browser lấy csrfToken từ login/auth/me trong memory; ghi sau login dùng Origin allowlist, JSON, X-Auth-Request:1, X-CSRF-Token. Không lộ secrets, URL ký, raw snapshot/private data vào URL/log/browser storage.

401 phiên,403 role/CSRF, resource ngoài quyền/không tồn tại404,400 DTO/query,409 conflict,429 Retry-After,503 dependency theo contract. Core lấy actor/assignment/ownership/current version; UI không là authority. Snapshot read/lock order/cursor/receipt cụ thể do phase sở hữu, không thay bằng mock data để báo thành công.

Ghi nghiệp vụ cần audit/outbox atomic khi contract yêu cầu; ACK sau commit. Unknown outcome reconcile cùng key/payload; không đổi key/version ngầm. Agent checkpoint khác commit nghiệp vụ; không truy cập trực tiếp Business DB.

## 4. UX hiện hành

Tailwind4 prefix tw:, Lexend/tokens Staff, English labels. Header gọn; không CSS cũ/@apply/inline source styles. Search Products/Customers/Policy Lookup bằng Enter; xóa text rồi Enter bỏ lọc, không Search/Clear buttons. Inbox search debounce300ms/Enter và IME; không counts/Closed/New.

Không F5/document navigation cho search/filter/page/save/retry/selection. Query dùng History API, route dùng Next Link/router; đọc tài liệu Next cài trong repo trước sửa routing. Realtime REST resync giữ DOM/accordion/draft/focus/scroll/các cursor pages đã tải; scope/actor/phiên đổi thì clear. Không dùng revision realtime làm key remount directory.

Products tự mở PDF đầu tiên, nhiều file dùng Document select; không View/Refresh documents/Close thường trực. Cùng version giữ iframe/src; published version mới chỉ hiện nút chuyển, link mới vẫn reauthorize current. Policy main PDF theo binding, tài liệu phụ riêng. Native iframe không chứng minh zoom/page nội bộ qua DOM. Signed URL đã cấp còn residual TTL, không hứa thu hồi tức thì.

Inbox không Refresh inbox/conversation/messages hoặc Message saved; ACK hiện tin đã commit. Pending/unknown/error/reconcile vẫn có trạng thái và Retry đúng chỗ. Notification cũng không có Refresh thường trực; Try again chỉ xuất hiện khi lỗi.

## 5. Cấu trúc và cách cập nhật

Contract chức năng sở hữu phạm vi/model/chia phase, API/routes và phần còn lại; file phase sở hữu vị trí code, API spec chi tiết, flow, test, gate. Chỉ mục chung chỉ dẫn tới owner, không duy trì api-map/routes/gap-review riêng. Không tạo lại file màn hình song song hoặc report.md.

Nguồn state hiện tại: [chỉ mục phase](README.md) và [tiến độ](../../implementation-status.md). File baseline lịch sử giữ kết quả kiểm thử có ngày; không coi checklist code đã pass là suite vừa chạy lại sau sửa docs.

## 6. Mốc Staff trước Agent

1. Giữ và nghiệm thu Auth/Customers/Policy/PDF/Products/Inbox/handoff notification đang E.
2. TK01–TK05: Staff đọc/tiếp nhận Ticket độc lập nguồn tạo; mỗi phase có gate. Test fixture không tạo API fake Agent hoặc thay bootstrap.
3. Test Core/browser/E2E thuộc từng phase code của chức năng; không có nhóm Release hoặc chuẩn bị commit trong plans.
4. Hoãn CP01–CP04, Agent draft/confirmation I07 và Customer UI mới. Việc này là tách mốc, không xóa requirement/plan tương lai.

Resolve/close/reopen Ticket đã được người dùng chọn05/11 và triển khai trong TK03/TK04. Không thêm Claim/payment/upload/manual Ticket/read receipts/global search/template/attachment chỉ vì enum/icon có sẵn. Những mục chưa được chọn không tự thành Must hoặc phase bắt buộc. Đổi linkedPolicy/context nếu được chọn nằm trong nhóm Copilot, không chức năng app độc lập; Customer notification center có N01/N02 riêng.


## API theo chức năng

Mã Axx chỉ để truy vết, không phải mã FR. Bảng endpoint và E/P nằm ngay tại contract sở hữu; chi tiết DTO/quyền/tests do phase tương ứng quyết định.

| Chức năng | API / owner |
| --- | --- |
| Auth/profile | [A01–A04, GET/PATCH staff/me](01-auth-contract.md#api-và-routes-của-chức-năng) |
| Customers | [A05/A06](02-customers-contract.md#api-và-routes-của-chức-năng) |
| Inbox | [A08–A12; A13 còn P](03-inbox-contract.md#api-và-routes-của-chức-năng); A07 counts đã loại |
| Products | [A17/A19/access](04-products-contract.md#api-và-routes-của-chức-năng) |
| Policies/PDF | [A14/A15/A16/A18/A20](05-policies-contract.md#api-và-routes-của-chức-năng) |
| Notifications | [A27/A28](06-notifications-contract.md#api-và-routes-của-chức-năng) |
| Tickets | [A21–A23 E](07-tickets-contract.md#api-và-routes-của-chức-năng) |
| Copilot | [A24–A26 P](08-copilot-contract.md#api-và-routes-của-chức-năng) |

Customer APIs có baseline và owner tại [Customer plans](../../customer/plans/00-customer-contract.md); không gọi Staff API thay quyền owner. Health/Swagger là vận hành, operator /ops/v1 không phải Staff API. Đã có PATCH Ticket status resolve/close/reopen; chưa có endpoint linkedPolicy/return-to-AI/Claim/payment/upload/global search/templates; không suy endpoint từ icon hoặc enum.

## Điều hướng

Route của Auth/Account, Customers, Inbox, Products, Policies và Tickets nằm trong bảng API/routes của từng contract bên trên. /staff chuyển /staff/customers; /account dùng shared auth boundary theo role. Copilot là panel trong Inbox, chưa có route riêng. Tickets có A21/A22 read API TK02; TK03 Accept/PATCH status resolve/close/reopen và TK04 list→detail riêng đã có; consumer notification TK05 đã có; producer tạo từ Agent còn I07. Không thêm chat/Ticket lồng dưới customer detail.

Query dùng History API, đổi route dùng Next Link/router; shared layout không gọi auth/me ở mọi page marker. Back/Forward giữ filter/selection đúng scope. Legacy Inbox request→requests, recent→active, new/AI/Closed→All rồi Core recheck. Cursor transcript/signed URL không đưa vào URL app. Link Ticket không bỏ Direct/Accept gate.

## WebSocket local hiện có

`WS /api/v1/realtime` (WSS khi HTTPS): cookie, exact Origin, AuthService.me; ready/invalidate/session-expired và I06 chat/scope/notification và TK05 Ticket invalidations, không nội dung Private hoặc client subscription/mutation. Snapshot account/profile/assignment và outbox local dẫn Web REST resync/catch-up. Không tokenstream LLM, read receipts hoặc xác nhận delivered/read.

Frame client gửi bị đóng 1008; phiên thu hồi đóng 4001; DB lỗi đóng 1013 để reconnect/backoff. Giới hạn local: 128 kết nối/process, 4/actor, 60 handshake/phút/socket IP; qua gateway là IP gateway, không tin X-Forwarded-For. Đây không là sizing/SLA production.


## Phần còn lại theo chức năng

| ID | Phần còn lại | Phase sở hữu |
| --- | --- | --- |
| G08 | Customer có shell/Home/Products/Policies/PDF/chat; self-edit và Agent/confirmation còn phase riêng | [Customer plans](../../customer/plans/README.md), không lẫn scope Staff |
| G09 | Auth/Customers/Policy có regression và real gateway/Core/DB/MinIO E2E trên Chromium/Firefox/WebKit | AU01–AU03, CU01/CU02, PL01–PL04; runner test-staff.mjs. Benchmark/cloud không thuộc mốc Staff local |
| G10 | Global search/templates/attachments/read marker/complete Ticket workflow chưa chọn | [Extensions](00-staff-contract.md); không tự thành Must từ UI mẫu/enum |
