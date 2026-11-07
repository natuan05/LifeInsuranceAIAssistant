# Customer — hiện trạng, yêu cầu và kế hoạch

Đối chiếu **06/11/2026 theo main 05/11** · [UI chung](../README.md) · [Kế hoạch theo phase](plans/README.md) · [Menu](../menu.md).

## 1. Cách đọc

File màn hình C01–C09 cũ đã hợp nhất vào các contract trong `plans/`; mỗi thư mục chức năng chứa phase API/UI/flow/test. Home/Products/Policies/PDF và chat shell đã triển khai trong main 05/11; Agent/confirmation và các phần mở rộng còn theo gate riêng. `E` là phần đã có, `P` là đề xuất; không suy toàn bộ Customer hoặc Agent hoàn tất từ UI.

Nguồn: [Requirement](../../specifications/Requirement.md), [Data Model](../../specifications/Data_Model.md), [architecture](../../architecture.md), [source review](../../source-review.md); schema thực `apps/core/prisma/schema.prisma`. Khi khác biệt, giữ truy vết quyết định local, không lấy UI mẫu làm yêu cầu nghiệp vụ.

## 2. Đối chiếu chức năng

| Màn hình | Căn cứ | Đang có | Cần làm và owner kế hoạch |
| --- | --- | --- | --- |
| [C01 Login](plans/01-auth-contract.md) | FR-001 | Login/session/logout/password bằng tài khoản được cấp sẵn | Bảo trì [auth](plans/01-auth-contract.md); không tự đăng ký Customer/Staff trong MVP |
| [C02 Home](plans/02-home-contract.md) | Tổ chức UX cho FR-002/008, không FR dashboard riêng | H01/H02 shell/navigation/Home đã có | Bảo trì theo [Home](plans/02-home-contract.md), không thêm dashboard metrics từ UI mẫu |
| [C03 Products](plans/03-products-contract.md) | FR-008 | PR01/PR02 UI catalog/detail/PDF, Core dùng chung | Bảo trì theo [Products](plans/03-products-contract.md) |
| [C04 My policies](plans/04-policies-contract.md) | FR-008, UC-007 | PO01/PO02 owner read API và UI đã có | Bảo trì [owner scope](plans/04-policies-contract.md); không gọi Staff API |
| [C05 Documents](plans/05-documents-contract.md) | FR-008, NFR-007 | D01/D02 Customer catalog/access/PDF đã có | Bảo trì [version/access](plans/05-documents-contract.md); không suy RAG đã có |
| [C06 Chat](plans/06-chat-contract.md) | FR-005/006/011 và quyết định consent local | I03–I06 own AI/Direct/handoff/history/send/realtime/SYSTEM | [Ghép UI rồi Agent](plans/06-chat-contract.md); chưa có AI trả lời thật |
| [C07 Tickets](plans/07-tickets-contract.md) | FR-009/012, Staff FR-010 | Schema, chưa confirmation workflow | [Phối hợp I07](plans/07-tickets-contract.md); Customer xác nhận riêng, không Ticket từ handoff |
| [C08 Profile](plans/08-profile-contract.md) | FR-002; password theo auth | GET own profile/contact; account/password/logout | [Core tự sửa và UI](plans/08-profile-contract.md) |
| [C09 Notifications](plans/09-notifications-contract.md) | Đề xuất UX; FR-013 chỉ System→Staff | Chat có realtime và SYSTEM; không recipient Customer | [Chốt phạm vi trước](plans/09-notifications-contract.md); không tự bật center/unread |

Source không có FR-004. Forgot-password/OTP/SSO, upload, thanh toán, read receipts, dashboard metrics và Customer notification center không tự được coi là Must. Không dùng enum để suy ra chức năng: TicketStatus có CLOSED không có nghĩa MVP cần resolve/close; ConversationStatus chỉ AI_ACTIVE/PENDING_HANDOFF/STAFF_ACTIVE.

## 3. API baseline — E

- `POST /auth/login`, `GET /auth/me`, `POST /auth/change-password`, `POST /auth/logout`.
- `GET /customers/me`: own profile + assignmentStatus + Staff contact nếu khả dụng; chưa PATCH.
- `GET /products`, `GET /products/:productId`: A17/P01 dùng chung hai role đã đăng nhập, active catalog/search/page/DTO/quota.
- `GET /products/:productId/documents`; POST `/products/:productId/documents/:documentId/versions/:versionId/view|download`: A19/P02 PUBLIC current version, session/CSRF/quota/recheck/audit; PR01/PR02 UI đã có.
- Customer policies/catalog/access theo [PO01](plans/policies/01-owner-read-api.md) và [D01](plans/documents/01-owner-document-access.md), UI PO02/D02 đã nối.
- I03: `GET /customers/me/chat-support`; `GET/POST /customers/me/conversations`; `GET /customers/me/conversations/:id`; POST `.../:id/handoff-requests`; GET `/customers/me/conversation-commands/:clientRequestId?operation=...`.
- I03/I05: GET/POST `.../conversations/:id/messages`; GET `.../:id/messages/by-client-id/:clientMessageId`.
- I06: `WS /api/v1/realtime`, receive-only invalidation; dữ liệu/quyền vẫn qua REST. Staff Accept tạo SYSTEM bền vững trong transcript.

Prefix REST `/api/v1`; body/DTO/quota chat do [I03](../staff/plans/inbox/03-handoff-transcript.md), [I05](../staff/plans/inbox/05-messaging-customer.md), [I06](../staff/plans/inbox/06-realtime-routing.md) sở hữu; sản phẩm do [P01](../staff/plans/products/01-catalog-read-api.md)/[P02](../staff/plans/products/02-document-access.md). Chưa có Agent thật, producer/xác nhận Ticket I07 hoặc Customer PATCH trong baseline này. Đọc phạm vi auth hiện tại tại C01; không tự thêm đăng ký/SSO từ sơ đồ nguồn.

## 4. Quy tắc triển khai

Giữ auth, nháp, idempotency/reconcile, consent và realtime đã chạy. Layout Customer mới dùng Tailwind `tw:`, Lexend và tokens Staff, cải thiện khoảng cách/thứ bậc/responsive theo [contract chung](plans/00-customer-contract.md); không sửa nghiệp vụ để hợp hình UI. URL ký/credential/private data không vào URL ứng dụng/storage/log. FE/Core chỉ Docker qua gateway. Test synthetic tự dọn; không thêm seed cá nhân vào bootstrap/tài liệu chung.
