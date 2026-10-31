# Staff — bản đồ API theo màn hình

[Chỉ mục Staff](README.md) · [Checklist tiến độ](../implementation-status.md) · [Khoảng trống](gap-review.md)

Ngày 31/10/2026. Prefix **`/api/v1`**. `E` = đã có, đối chiếu controller/service/DTO trong `apps/core/src/auth`, `apps/core/src/customers` và `apps/core/src/policies`. `P` = đề xuất hợp đồng giao tiếp để review, **chưa có API**. Các ID Axx là mã tham chiếu trong tài liệu này, không phải mã nguồn SRS. Không gọi API Agent hoặc DB trực tiếp từ Web.

## API đã có

Bổ sung 31/10/2026: `GET /staff/me` và `PATCH /staff/me` đã có trong Core và đã nối form Web. Contract/input/lỗi tại [S01](account.md#trang-personal-information-hiện-tại). PATCH chỉ sửa fullName/phone của Staff trong phiên, cần CSRF và expectedUpdatedAt; email/code/role/department read-only.

| ID | Method/path | Màn hình / input và output cần dùng |
| --- | --- | --- |
| A01 E | POST /auth/staff/login | S01: `{email,password}` → actor + csrfToken, cookie phiên; không nhận role từ client để cấp quyền |
| A02 E | GET /auth/me | S01 và app shell: actor `{id,accountCode,email,role,fullName,passwordChangeRecommended}` + csrfToken |
| A03 E | POST /auth/logout | S01: thu hồi phiên hiện tại, `{}`; cần CSRF |
| A04 E | POST /auth/change-password | S01: currentPassword/newPassword/confirmPassword → phiên mới; cần CSRF; thu hồi các phiên khác |
| A05 E | GET /staff/customers?page=&pageSize=&search= | S03: items `{id,fullName,accountCode,email,phone,status}`, total/page/pageSize. page mặc định 1, tối đa 100000; pageSize mặc định 10, 1–50. Search tên/code/email/phone tối đa 100 ký tự sau trim, literal substring không phân biệt hoa thường, lọc toàn tập assignment trước count/phân trang |
| A06 E | GET /staff/customers/:customerId | S03 hồ sơ riêng; dự kiến Case Details khi có conversation: `{customer}` với các trường trên + birth/address có thể null. UUID; ngoài quyền/không có cùng 404. **Không có citizenId** |

A01–06 đã được Web sử dụng; đây là API nghiệp vụ hiện có cho Staff. Customer dùng thêm `POST /auth/login` và `GET /customers/me`. Health endpoints phục vụ vận hành; operator `/ops/v1` là ứng dụng riêng. Xem [source controller](../../../apps/core/src/customers/controllers/customer.controller.ts).

A05 đã nhận `search` (31/10), không nhận `query`, `status` hoặc `cursor`; DTO strict từ chối query lạ, search lặp/quá dài/ký tự điều khiển. Chuỗi rỗng sau trim không lọc; `%`/`_`/backslash là ký tự thường. Không tìm CCCD hoặc dữ liệu ngoài assignment; total và items dùng cùng điều kiện trong một snapshot.

Auth/business không cache. Cookie HttpOnly; Web không lưu credential trong browser storage. Login/ghi gửi JSON và `X-Auth-Request`; logout/change-password thêm `X-CSRF-Token`. Mutation P cần áp dụng quy tắc CSRF/Origin của Core khi thiết kế, không sao chép thao tác client mock.

## API đề xuất

Các trường dưới là dữ liệu UI cần, không phải DTO đã duyệt. Pagination mới chưa chọn cursor hay page; bộ lọc, sort, giới hạn và error codes cần chốt trước triển khai. ID `:id` ở mỗi dòng là tài nguyên của dòng đó.

| ID | Method/path dự kiến | Màn hình / mục đích | Dữ liệu tối thiểu và điểm cần chốt |
| --- | --- | --- | --- |
| A07 P | GET /staff/work-queue/summary | S02, badge menu | Số hội thoại theo trạng thái, Ticket cần nhận; cùng scope/filter với danh sách. Có thể tổng hợp từ list thay endpoint riêng |
| A08 P | GET /staff/conversations | S02/S05 hàng đợi/lịch sử | Bộ lọc customerId/status/search; items: id, customer, linkedPolicyId, lastMessage, updatedAt, assignedStaff, unreadCount, version; phân trang, archived/closed read-only |
| A09 P | GET /staff/conversations/:id | S05 header/Case Details | Trạng thái, người tiếp quản, customerId, linkedPolicyId, linkedTicketIds, version; allowedActions do Core xác định nếu chọn pattern đó |
| A10 P | GET /staff/conversations/:id/messages | S05 transcript/lịch sử | Trang tin theo thứ tự ổn định: id/sender/content/createdAt/citations; citation có documentId/versionId/page, không URL ký lưu vĩnh viễn; không trả raw tool payload Private |
| A11 P | POST /staff/conversations/:id/takeover | S05 tiếp nhận hoặc chủ động giành quyền AI | expectedVersion + khóa chống lặp dự kiến. Core kiểm assignment, trạng thái, Ticket liên quan nếu có, chặn Agent ghi đang chạy; trả trạng thái/version mới. Không bắt buộc tạo Ticket cho takeover chủ động |
| A12 P | POST /staff/conversations/:id/messages | S05 gửi tin Staff | content + clientMessageId/idempotency dự kiến; chỉ người có quyền điều khiển; trả messageId/thời điểm lưu/trạng thái chính thức. Không tự gửi Copilot |
| A13 P | POST /staff/conversations/:id/read | S05/S07 mốc đã đọc | lastReadMessageId, chống lùi mốc/đếm trùng; đánh dấu transcript khác đánh dấu notification |
| A14 E | GET /staff/customers/:customerId/policies | S03/S04 hồ sơ → nhiều hợp đồng | Đã có page/pageSize, items/total, exact decimal string/null và assignment check; đã nối FE. Contract tại Staff policies |
| A15 P | GET /staff/policies | S04 Policy Lookup toàn màn hình/nhanh | Kế hoạch tiếp theo: search số hợp đồng, tên/mã khách, mã/tên sản phẩm trong active assignment; lọc ACTIVE/LAPSED/MATURED/PENDING và phân trang sau scope/search. Không tìm CCCD/phone; DTO/query cần chốt trước code |
| A16 E | GET /staff/policies/:policyId | S04 chi tiết | Đã có detail/allowlisted benefits snapshot, sản phẩm/customer summary và assignment check; đã nối FE |
| A17 P | GET /products; GET /products/:id | S04 sản phẩm/điều khoản công khai | Danh mục/name/code/summary và tài liệu; tái dùng cho Customer nếu contract được duyệt. Nội dung công khai không suy ra quyền lợi cá nhân |
| A18 E | GET /staff/policies/:policyId/documents | S04 danh mục tài liệu hợp đồng | Đã có documentId/title/kind/accessScope + versionId/versionNumber áp dụng, availability/issues; không tự dùng currentVersion, không trả storage key/URL |
| A19 P | GET /products/:id/documents | S04 tài liệu sản phẩm | Danh sách tài liệu công khai và phiên bản; chọn nguồn theo nhu cầu |
| A20 E | POST /staff/documents/:documentId/versions/:versionId/view | S04 xem PDF/mở citation; download có path riêng bên dưới | Kiểm lại quyền, đúng cặp document/version, body {policyId}, CSRF; trả signed URL + expiresAt; liên kết trang. URL hết hạn phải xin lại, không ghi URL ký vào chat/log |
| A21 P | GET /staff/tickets | S02/S06 | Lọc customerId/status/search, phân trang; id/code/title/customer/status/createdAt/assignedStaff/conversationId nullable |
| A22 P | GET /staff/tickets/:id | S06 và thẻ Ticket trong chat | Nội dung khách xác nhận, confirmedAt, nguồn tạo, linkedPolicy/conversation nullable, aiSummary riêng, version. Trường content/source cho Ticket thủ công cần rà model trước code |
| A23 P | POST /staff/tickets/:id/accept | S06 nhận yêu cầu | expectedVersion + chống lặp dự kiến. Ticket không chat: chỉ nhận Ticket; có handoff: cần contract atomic/điều phối với A11 để không nhận Ticket nhưng mất quyền chat. Trả trạng thái đã commit |
| A24 P | GET /staff/conversations/:id/copilot | S05 khôi phục sidebar | Lịch sử nội bộ theo conversation/Customer, copilotThreadId và mốc transcript; không trộn với chat Customer |
| A25 P | POST /staff/conversations/:id/copilot/messages | S05 hỏi/tra cứu | prompt + linkedPolicyId được Core kiểm; trả câu trả lời/citations/trạng thái nguồn hoặc operationId nếu bất đồng bộ |
| A26 P | POST /staff/conversations/:id/copilot/summary | S05 tóm tắt | Mốc transcript được tóm tắt, generatedAt, giới hạn/thiếu dữ liệu, nguồn; không sửa Ticket đã xác nhận |
| A27 P | GET /staff/notifications | S07 | items id/title/body/createdAt/isRead/conversationId/ticketId; phân trang và unreadCount theo đúng người nhận |
| A28 P | POST /staff/notifications/:id/read | S07 đánh dấu đọc | Idempotent; không tự tiếp nhận Ticket hoặc takeover |

## Tính nhất quán và lỗi cần có trong contract P

### Contract Policy/PDF hai vai trò — hướng chuẩn bị triển khai 31/10/2026

Phạm vi chức năng đã được xác nhận. Staff list/detail/catalog và A20 view/download đã triển khai; Customer/product endpoints còn là đề xuất P. Trang chi tiết đọc nghiệp vụ từ DB; catalog/access dẫn tới file PDF gốc trong object storage private. Đặc tả dùng chung tại [C05](../customer/documents.md#hướng-triển-khai-policypdf-đã-thống-nhất--31102026).

| Phía gọi | Đường dẫn đề xuất | Scope / kết quả |
| --- | --- | --- |
| Staff | A14–16 list/detail policy; A18 catalog | Active assignment tới Customer sở hữu policy; response list đủ dữ liệu bảng gồm phí/kỳ đóng/ngày đến hạn khi có, detail có quyền lợi/số tiền bảo hiểm và các trường nghiệp vụ đã xác minh |
| Customer | GET /policies; GET /policies/:id | List/detail chỉ theo ownership trong phiên; tái sử dụng service nghiệp vụ, không gọi Staff API thay auth |
| Customer | GET /policies/:id/documents | Catalog tài liệu áp dụng của chính policy, documentId/versionId/title/phạm vi và phân loại khi contract/schema đã xác định |
| Staff | POST /staff/documents/:documentId/versions/:versionId/view (A20); POST /staff/documents/:documentId/versions/:versionId/download | Tách ý định xem/tải, Core recheck assignment và version trước khi cấp quyền; không nhận bucket/key/URL tùy ý từ client |
| Customer | POST /documents/:documentId/versions/:versionId/view; POST /documents/:documentId/versions/:versionId/download | Tương tự Staff nhưng kiểm ownership; cùng nguồn file/phiên bản |

A20 có path view; path download tách ý định tải. Local đã chọn Core kiểm session/quyền/document/version rồi trả `{url, expiresAt}` signed URL cho GET object trực tiếp từ MinIO, inline/attachment theo hành động, TTL local mặc định 15 phút có cấu hình. Core không stream PDF ở luồng mặc định này. Staff contract body {policyId}, header CSRF, HTTP 200/no-store và lỗi đã ghi tại Staff policies; không nhận bucket/key/URL tùy ý từ client.

Contract cần nêu rõ list/detail/currency/decimal/date/null, pagination/sort/filter, mapping hợp đồng chính–điều khoản–phụ lục và phiên bản áp dụng. Không tự lấy currentVersion. Không biến việc mở policy để xem thành thay linkedPolicy conversation; phần chat/context giữ tách riêng.

Quyền list/detail/catalog và quyền mở/tải đều do Core xác minh; audit phân biệt VIEW/DOWNLOAD, không raw PDF/URL ký. File trả application/pdf, inline/attachment và filename do server kiểm soát; chốt Range, no-store cho phản hồi riêng tư, size/time limits, CORS và CSP. Signed URL còn có thể dùng tới expiry sau khi quyền thay đổi; phải mô tả giới hạn này và test trước nghiệm thu. Storage/PDF lỗi không biến policy DB thành không tồn tại.

### Yêu cầu chuyển từ Agent sang Staff — bổ sung 31/10/2026

Yêu cầu chức năng đã được người dùng xác nhận; API/tool phía Customer/Agent để tạo/xác nhận yêu cầu **chưa chốt đường dẫn/DTO và chưa triển khai**. Không xem A11 (Staff tiếp quản), A23 (Staff nhận Ticket) hoặc A28 (đánh dấu notification đã đọc) là API tạo yêu cầu từ Customer.

Hai nhánh Customer chủ động yêu cầu và Agent gợi ý được khách đồng ý đều cần: nội dung để xem lại/xác nhận, ownership từ phiên, confirmation gắn nội dung/hội thoại/phiên bản và khóa chống trùng. Agent gọi Business API của Core; Core commit Ticket + outbox trước khi trả mã và phát notification. Một lần chuyển giao không nhân đôi khi hai nhánh/retry cùng chạy. Chi tiết tại [Customer chat](../customer/chat.md#6-chuyển-từ-agent-sang-staff--yêu-cầu-31102026).

Staff dùng A08–10 để xem công việc/lịch sử, A11/A23 để tiếp nhận nhất quán, A12 để trả lời, A27–28 để đọc notification. Cần chốt recipient/fallback khi chưa có Staff, state/version của PENDING_HANDOFF, chính sách AI trong lúc chờ, chặn kết quả Agent muộn khi STAFF_ACTIVE và tra cứu kết quả khi timeout trước khi code. Socket invalidation hồ sơ hiện có không cung cấp pipeline này.

### Quy tắc chung cho contract P

- Mọi read/write xác minh lại phiên, role, active assignment; client ID/filter không là bằng chứng quyền. Không rò dữ liệu qua count, tìm kiếm, sự kiện hoặc URL PDF.
- Dự kiến dùng 401 cho phiên hết hạn; 403 cho role/thao tác bị cấm; 404 an toàn cho tài nguyên không có/ngoài scope như baseline; 409 cho version hoặc trạng thái đã đổi; 429 và lỗi dịch vụ có hướng khôi phục. Đây là hướng đề xuất, mã nghiệp vụ chi tiết chưa chốt.
- Timeout gửi tin/tiếp nhận: tra lại bằng khóa request hoặc trạng thái tài nguyên trước retry; cần chốt cơ chế tra kết quả, retention khóa và replay response. Không sinh khóa mới mỗi retry rồi báo thành công bằng state local.
- Quyền tắt composer và nút hành động xuất phát từ Core; khi đổi assignment phải xóa dữ liệu riêng đang mở và kiểm lại scope. Backend vẫn chặn dù UI chưa nhận sự kiện.
- Đồng bộ cần message mới, thay đổi handoff/Ticket, notification và quyền bị thu hồi. Event ID/version để dedup, reconnect có mốc và tải bù từ REST; không dùng event delivery làm nguồn sự thật.
- Endpoint native WebSocket invalidation local đã có như mục dưới; chưa chọn events/replay/transport cho chat/Ticket/notification. ADR nhắc Socket.IO không đồng nghĩa đang dùng Socket.IO. Khi A25/26 bất đồng bộ, cần chốt API lấy trạng thái/kết quả và resume; không tự thêm endpoint chưa xác định.
- Agent giữ checkpoint bền vững riêng với dữ liệu business; cuộc Copilot có customerId và linked context. Đổi khách/hợp đồng phải kiểm lại scope, không tái dùng kết quả Private từ khách cũ.

## Chưa đề xuất API cho tiện ích/chức năng chưa duyệt

Font picker đã bỏ theo yêu cầu, không cần API. Thu gọn panel là client-only; templates hiện disabled, chưa triển khai chèn nháp. Chưa có API Dismiss/reassign, trả lại AI, đóng/resolve Ticket, phê duyệt Claim, thanh toán, upload tài liệu hoặc chỉnh CCCD. Không suy ra nhu cầu các API này chỉ từ icon trong mẫu.

## WebSocket local hiện có

`WS /api/v1/realtime` (WSS khi HTTPS), nhận cookie tại Path=/api/v1, kiểm exact Origin và AuthService.me. Sự kiện `ready`, `invalidate`, `session-expired`; không có payload Private hoặc subscription ID do client tự chọn. Invalidation cho actor/profile/assignment được phát sau đối chiếu snapshot scope mỗi 2 giây; client đọc lại API REST. Không nhận client message/mutation; frame gửi lên bị đóng 1008. Phiên bị thu hồi đóng 4001; DB không khả dụng đóng 1013 để reconnect/backoff. Giới hạn local 128 kết nối/process, 4/actor và 60 handshake/phút/socket IP (sau gateway áp dụng trên IP gateway). Không trust X-Forwarded-For. Các giới hạn này chưa là sizing production.

Contract realtime cho tin chat, Ticket và thông báo A08–A28 vẫn cần thiết kế riêng; transport cho các luồng đó chưa được chọn chỉ từ kênh invalidation local này.


## Checklist nối API

- [x] A01–04: login/actor/logout/password; bổ sung GET/PATCH /staff/me, Web đã nối chỉnh sửa.
- [x] GET/PATCH /staff/me: form Edit/Save/Cancel họ tên/phone; kiểm chứng gateway thật cho lưu/đọc lại, tên actor mới, stale 409 và sai role 403; bundle Docker mới đã phục vụ form.
- [x] A05–06: list/detail Customer, pagination và scope assignment.
- [x] WS local: invalidation account/profile/assignment và REST resync.
- [x] A05 search: DTO/service/count theo cùng filter trên toàn tập assignment; Web search/clear và URL/page/detail/back đã nối, Try again gọi lại request.
- [ ] A07–13: queue/conversation/messages/takeover/read.
- [ ] Customer chủ động yêu cầu Staff hoặc đồng ý gợi ý Agent: contract tạo/xác nhận và tra trạng thái yêu cầu; Ticket/outbox/notification đúng quyền, chống trùng; Staff tiếp nhận rồi trả lời trong cùng hội thoại.
- [x] A14/A16/A18: Staff policy list/detail và catalog metadata đúng phiên bản; chưa nối FE.
- [ ] A15/A17/A19: lookup toàn tập và product API.
- [ ] Policy/PDF hai role: Customer ownership API + Staff assignment API, seed DB/file/version/checksum, trang chi tiết DB, viewer trong app và download; chốt storage/access trước code, không reload toàn workspace.
- [ ] A21–23: Ticket list/detail/accept; API tạo Ticket Customer chưa được mô tả trong bảng Staff này.
- [ ] A24–26: Copilot/history/summary; async job contract còn mở.
- [ ] A27–28: notifications/read; event pipeline/replay còn mở.
- [ ] Contract đổi linkedPolicy conversation (nếu cho phép): **chưa có endpoint đề xuất cụ thể**, không suy ra từ A16 chỉ đọc.

Dấu hoàn thành chỉ cho luồng đã nối. Các endpoint P vẫn chưa được duyệt/triển khai và không tự xuất hiện trong Swagger.

31/10: A20 Staff view/download đã triển khai với body {policyId}, HTTP 200, no-store và audit cấp quyền riêng; xem contract Staff policies. Các API Customer vẫn là đề xuất.
