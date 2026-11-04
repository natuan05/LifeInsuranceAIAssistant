# S03 — Customers và hồ sơ khách được phân công

[Chỉ mục Staff](../README.md) · [API](00-staff-contract.md#api-theo-chức-năng) · [Policies](05-policies-contract.md) · [Khoảng trống](README.md#phần-còn-lại-theo-chức-năng)

Đối chiếu **03/11/2026**. Căn cứ: FR-002/003, UC-003, NFR-001/002. Danh sách/search/hồ sơ/hợp đồng đã nối Core; Inbox/Ticket theo khách chưa có.

## Hiện trạng

- [x] `/staff/customers`: list/search/phân trang 10/trang trên toàn tập active assignment.
- [x] `/staff/customers/:customerId`: hồ sơ chỉ đọc và Insurance policies A14; mở chi tiết/catalog/PDF A16/A18/A20.
- [x] Tìm bằng Enter, không có nút Search/Clear search. Xóa nội dung rồi Enter để bỏ lọc; giữ focus. URL giữ search/page, đổi từ khóa về trang 1.
- [x] Deep link/breadcrumb/Back–Forward; tìm kiếm/phân trang/retry không F5 hoặc remount workspace.
- [x] Loading/empty/no match/error/retry; request cũ bị hủy; 401/403/404 xóa dữ liệu riêng.
- [x] Realtime refresh nền cho list/hồ sơ cùng query, giữ dữ liệu trong lúc chờ; kiểm phiên khi focus/visible vẫn có.
- [x] Có 15 regression browser Chromium với API/WebSocket giả lập.
- [ ] Liên kết theo khách sang Inbox/Tickets sau khi triển khai [kế hoạch](inbox/00-inbox-spec.md); hiện chưa có link/API/UI hỗ trợ trong Customers.

## API hiện có

Prefix `/api/v1`; actor/role từ session. Session, assignment và list/count đọc cùng snapshot RepeatableRead.

| API | Input và kết quả |
| --- | --- |
| A05 GET /staff/customers | page 1–100000 (default 1), pageSize 1–50 (default 10), search tùy chọn; `{items,total,page,pageSize}` |
| A06 GET /staff/customers/:customerId | UUID; `{customer}` đúng active assignment; ngoài quyền/không tồn tại cùng 404 |

List item: `{id,fullName,accountCode,email,phone,status}`. Detail thêm birth/address nullable; FE hiện “Not provided” khi thiếu. Không trả citizenId/KYC, password/token hoặc metadata nội bộ. status là UserStatus ACTIVE/LOCKED, không phải trạng thái hợp đồng/hội thoại.

Search trim, tối đa 100 ký tự, chuỗi con không phân biệt hoa thường theo fullName/accountCode/email/phone; rỗng/space tương đương bỏ lọc. Không bỏ dấu hoặc chuẩn hóa phone. `%`, `_`, backslash là ký tự thường. Query lạ/lặp/sai kiểu/control chars/quá dài trả 400. Scope và search áp trước count/phân trang, không tìm trên riêng trang hiện tại; thứ tự userId tăng dần. Trang vượt phạm vi có items rỗng nhưng giữ total.

Staff chưa có khách nhận list rỗng. Customer LOCKED vẫn được Staff còn assignment phục vụ; Staff bị khóa/phiên không hợp lệ không đọc được. 401 chuyển login, 403/404 xóa dữ liệu không còn quyền; lỗi mạng/5xx có Try again tại vùng lỗi. Các lần đọc mới quan sát thay đổi quyền đã commit; UI không là nguồn cấp quyền.

Hồ sơ chỉ đọc: không sửa KYC, khóa tài khoản hoặc phân công. Staff phụ trách Customer, người điều khiển chat và assignee Ticket là các quan hệ khác nhau.

## Bố cục và điều hướng

Danh sách là bảng tên/mã/email/phone/status với cuộn ngang trong vùng riêng ở màn hình nhỏ. Detail có breadcrumb Customers → Customer details, tên/avatar/mã/status; Insurance policies là vùng chính, Personal information là cột phụ. Mobile xếp policies trước hồ sơ.

Hợp đồng dùng [contract Policies](05-policies-contract.md), có loading/empty/error/retry riêng; chỉ hiện chưa có hợp đồng sau phản hồi rỗng thành công. Mở policy bằng Next Link; URL gọn, ngữ cảnh search/page/policyPage quay về lưu trong sessionStorage theo tab, được kiểm customerId. Không nhúng chat/composer/takeover/Copilot hoặc list Ticket vào Customers.

List/hồ sơ không refetch theo focus/visibility; realtime ready/invalidate kích hoạt refetch nền cho cùng actor/query. Đổi khách/trang tải mới và hủy request cũ. Vòng đời preview PDF đã tách khỏi metadata refetch: giữ iframe/src khi cùng file/version, vẫn kiểm quyền/binding; xem [Policies](05-policies-contract.md#giao-diện-hiện-tại).

## Kiểm thử và giới hạn

Các đợt trước ghi nhận 7 Core integration tests cho scope/role, search ngoài trang đầu/count/phân trang, ký tự literal và thay đổi phân công. Regression browser 03/11 có 15 ca cho search/clear/URL/deep link/breadcrumb/Back–Forward, bàn phím, retry mạng, realtime giữ filter/draft/focus/sidebar, response cũ, 401/403/404 và responsive 375/768/1600px.

Bộ `apps/web/tests/browser/staff-customers.spec.mjs` tạo fixture trong bộ nhớ, không phụ thuộc số khách trên máy/không seed hoặc sửa DB. HTTP/WebSocket được Playwright giả lập trên Web Docker. Đây là browser regression FE; Core authorization là lớp riêng, chưa phải E2E browser/Core/DB và chưa tự động kiểm nội dung PDF tải về. Việc 02 ngày 03/11 đã chạy lại 15 ca Customers cùng các suite Account/Session/Policies; giới hạn mock vẫn giữ nguyên.

## Chạy browser regression

Theo [Getting Started](../../../getting-started.md), Web/Core chạy Docker qua gateway; source ứng dụng đổi phải rebuild Docker trước test. Chuẩn bị `npm ci` và `npx playwright install chromium` khi cần, rồi:

```powershell
npm run test:browser:customers
```

Mặc định `http://localhost:8080`, đổi bằng `BROWSER_TEST_BASE_URL`. Screenshot/video/trace tắt. Kết quả tổng hợp ở `apps/web/test-results/results.json` (Git ignore); dọn artifact do lần test tạo sau khi đọc. Chưa kiểm Firefox/WebKit.

## Phần còn lại

- [ ] Sau khi Inbox/Tickets hoạt động: liên kết từ hồ sơ bằng customerId đã kiểm quyền; chi tiết hỗ trợ vẫn ở đúng màn hình nghiệp vụ.
- [ ] E2E tích hợp browser/Core/DB và hồi quy các trình duyệt khác.

Dữ liệu kiểm thử phải hoàn toàn synthetic; bộ regression tạo fixture độc lập trong bộ nhớ để chạy được trên mọi máy.

## Phase triển khai

[CU01 — Read API](customers/01-assignment-read-api.md) và [CU02 — Directory/profile UI](customers/02-directory-profile-ui.md) đều E; CU02 còn cần bổ sung E2E browser/Core/DB thật. Liên kết sang Inbox/Tickets theo customerId là UX tùy phạm vi, không nhúng chat/Ticket list vào Customers và không blocker FR-003.

## API và routes của chức năng

Bảng truy vết Axx được chuyển từ tài liệu tổng hợp; E/P giữ theo runtime, DTO/quyền/luồng/test chi tiết do các phase của chức năng sở hữu. Không thêm endpoint từ việc gom tài liệu.

| ID | Method/path | Phạm vi |
| --- | --- | --- |
| A05 E | GET /staff/customers | search/page/pageSize trong toàn tập active assignment; [Customers](02-customers-contract.md#api-hiện-có) |
| A06 E | GET /staff/customers/:customerId | Hồ sơ đúng assignment; không citizenId/KYC |

| Route | Trạng thái |
| --- | --- |
| /staff/customers | Search Enter/list/page — CU01/CU02 |
| /staff/customers/:customerId | Hồ sơ readonly và policies; không nhúng chat/Tickets |
