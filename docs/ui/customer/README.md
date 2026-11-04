# Customer — hiện trạng, yêu cầu và kế hoạch

Đối chiếu **04/11/2026** · [UI chung](../README.md) · [Kế hoạch theo phase](plans/README.md) · [Menu](../menu.md).

## 1. Cách đọc

File màn hình C01–C09 cũ đã hợp nhất vào các contract trong `plans/`; mỗi thư mục chức năng chứa phase API/UI/flow/test. Không duy trì hai bộ đặc tả song song. **Tất cả phase mới trong bộ Customer là kế hoạch, chưa triển khai**. `E` là API đang có, `P` là đề xuất; thiết kế mới không biến thành schema/API thật chỉ vì đã viết spec.

Nguồn: [Requirement](../../specifications/Requirement.md), [Data Model](../../specifications/Data_Model.md), [architecture](../../architecture.md), [source review](../../source-review.md); schema thực `apps/core/prisma/schema.prisma`. Khi khác biệt, giữ truy vết quyết định local, không lấy UI mẫu làm yêu cầu nghiệp vụ.

## 2. Đối chiếu chức năng

| Màn hình | Căn cứ | Đang có | Cần làm và owner kế hoạch |
| --- | --- | --- | --- |
| [C01 Login](plans/01-auth-contract.md) | FR-001 | Login/session/logout/password | [Đăng ký Customer](plans/01-auth-contract.md); không Staff tự đăng ký |
| [C02 Home](plans/02-home-contract.md) | Tổ chức UX cho FR-002/008, không FR dashboard riêng | `/customer` chứa hồ sơ và chat tối thiểu | [Shell/navigation và Home](plans/02-home-contract.md); không bắt buộc summary/count mới |
| [C03 Products](plans/03-products-contract.md) | FR-008 | P01/A17 và P02/A19/access Core dùng chung, chưa UI | [UI catalog/tài liệu PR01/PR02](plans/03-products-contract.md) |
| [C04 My policies](plans/04-policies-contract.md) | FR-008, UC-007 | Schema, parser/service Staff có thể tái dùng | [Owner read API và UI](plans/04-policies-contract.md); không gọi Staff API |
| [C05 Documents](plans/05-documents-contract.md) | FR-008, NFR-007 | MinIO, PDF/metadata và Staff viewer/access | [Customer catalog/access/PDF](plans/05-documents-contract.md); exact applied version |
| [C06 Chat](plans/06-chat-contract.md) | FR-005/006/011 và quyết định consent local | I03–I06 own AI/Direct/handoff/history/send/realtime/SYSTEM | [Ghép UI rồi Agent](plans/06-chat-contract.md); chưa có AI trả lời thật |
| [C07 Tickets](plans/07-tickets-contract.md) | FR-009/012, Staff FR-010 | Schema, chưa confirmation workflow | [Phối hợp I07](plans/07-tickets-contract.md); Customer xác nhận riêng, không Ticket từ handoff |
| [C08 Profile](plans/08-profile-contract.md) | FR-002; password theo auth | GET own profile/contact; account/password/logout | [Core tự sửa và UI](plans/08-profile-contract.md) |
| [C09 Notifications](plans/09-notifications-contract.md) | Đề xuất UX; FR-013 chỉ System→Staff | Chat có realtime và SYSTEM; không recipient Customer | [Chốt phạm vi trước](plans/09-notifications-contract.md); không tự bật center/unread |

Source không có FR-004. Forgot-password/OTP/SSO, upload, thanh toán, read receipts, dashboard metrics và Customer notification center không tự được coi là Must. Không dùng enum để suy ra chức năng: TicketStatus có CLOSED không có nghĩa MVP cần resolve/close; ConversationStatus chỉ AI_ACTIVE/PENDING_HANDOFF/STAFF_ACTIVE.

## 3. API baseline — E

- `POST /auth/login`, `GET /auth/me`, `POST /auth/change-password`, `POST /auth/logout`.
- `GET /customers/me`: own profile + assignmentStatus + Staff contact nếu khả dụng; chưa PATCH.
- `GET /products`, `GET /products/:productId`: A17/P01 dùng chung hai role đã đăng nhập, active catalog/search/page/DTO/quota.
- `GET /products/:productId/documents`; POST `/products/:productId/documents/:documentId/versions/:versionId/view|download`: A19/P02 PUBLIC current version, session/CSRF/quota/recheck/audit; chưa UI.
- I03: `GET /customers/me/chat-support`; `GET/POST /customers/me/conversations`; `GET /customers/me/conversations/:id`; POST `.../:id/handoff-requests`; GET `/customers/me/conversation-commands/:clientRequestId?operation=...`.
- I03/I05: GET/POST `.../conversations/:id/messages`; GET `.../:id/messages/by-client-id/:clientMessageId`.
- I06: `WS /api/v1/realtime`, receive-only invalidation; dữ liệu/quyền vẫn qua REST. Staff Accept tạo SYSTEM bền vững trong transcript.

Prefix REST `/api/v1`; body/DTO/quota chat do [I03](../staff/plans/inbox/03-handoff-transcript.md), [I05](../staff/plans/inbox/05-messaging-customer.md), [I06](../staff/plans/inbox/06-realtime-routing.md) sở hữu; sản phẩm do [P01](../staff/plans/products/01-catalog-read-api.md)/[P02](../staff/plans/products/02-document-access.md). Không chép contract chat khác trong Customer. Chưa có register, Customer owner policy/PDF, Customer PATCH hoặc Ticket API; product UI còn kế hoạch.

## 4. Quy tắc triển khai

Giữ auth, nháp, idempotency/reconcile, consent và realtime đã chạy. Layout Customer mới dùng Tailwind `tw:`, Lexend và tokens Staff, cải thiện khoảng cách/thứ bậc/responsive theo [contract chung](plans/00-customer-contract.md); không sửa nghiệp vụ để hợp hình UI. URL ký/credential/private data không vào URL ứng dụng/storage/log. FE/Core chỉ Docker qua gateway. Test synthetic tự dọn; không thêm seed cá nhân vào bootstrap/tài liệu chung.
