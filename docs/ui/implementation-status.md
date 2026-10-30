# Tiến độ triển khai UI, checklist và gap

Đối chiếu **30/10/2026** với source hiện tại. Phạm vi là Web Customer/Staff và các API Core đang được Web sử dụng; operator local là công cụ riêng. Đây là snapshot implementation, không thay yêu cầu nguồn hoặc duyệt API mới.

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
| S01 | Đã nối API local | `/staff/login`, `/account` style Staff, menu hai hành động, session/logout/password | Chưa có API sửa hồ sơ Staff; không phải phần đã triển khai |
| S02 | Khung UI | Sidebar Inbox và All/Requests/Active/New, URL filter | A07–10; badge/count/search/phân trang công việc và nghĩa của New |
| S03 | Một phần | Customers list/detail riêng, phân trang 10/trang, API assignment, hồ sơ read-only | Search toàn tập chưa có; vùng policy chưa có dữ liệu; retry lỗi cần hoàn thiện |
| S04 | Khung UI | Route Policy Lookup/detail, rail quick lookup, vùng policy ưu tiên trong hồ sơ | A14–20, nhiều policy thực, sản phẩm/PDF, lựa chọn và liên kết ngữ cảnh |
| S05 | Khung UI | Inbox/detail route, rail chọn panel có active state, Case Details/Copilot/lookup | A08–13/A24–26; transcript/gửi/takeover/AI đều chưa có, composer disabled |
| S06 | Khung UI | Route list/detail Ticket riêng, trạng thái chưa kết nối | A21–23, bảng/chi tiết thật, tiếp nhận và liên kết chat |
| S07 | Chưa làm | Chưa có chuông/list/read marker | A27–28 và pipeline outbox/recipient/reconnect |

## Checklist phần đã thực hiện

- [x] Login Customer/Staff theo UI nguồn bằng React/Tailwind; ảnh và Lexend tự host.
- [x] Staff fullscreen theo mẫu đính kèm; Customer management tách khỏi Inbox. Cột giữa sidebar/chat của Inbox dành cho **hội thoại**, không phải danh bạ khách.
- [x] Staff dùng Lexend cố định, bỏ Preferences/font picker; Web dùng tiếng Anh. Hồ sơ/account Customer cũ vẫn hoạt động với CSS riêng, chưa đồng nhất thiết kế với Staff.
- [x] Sidebar account popover chỉ có Personal information và Sign out; trang Staff Personal information cùng style workspace, form password trong Security.
- [x] Lời nhắc đổi password có thể đóng trong phiên mount của UI; không lưu lựa chọn dismiss bền vững qua reload/đăng nhập.
- [x] Staff route list/detail, query phân trang, deep link, Back/Forward; shared layout giữ workspace/socket khi chuyển route trong group. `/account` nằm ngoài group.
- [x] Customers gọi A05/A06, hiển thị total/Previous/Next; breadcrumb giữ page. Không còn nút Refresh trên header Customers.
- [x] Chi tiết ưu tiên vùng Insurance policies, personal information nhỏ bên cạnh; đây vẫn là placeholder policy, chưa phải kết quả rỗng từ Core.
- [x] Auth guard/session, xử lý 401; API khách hàng kiểm active assignment; 404 an toàn cho ngoài scope/không tồn tại. UI xóa dữ liệu riêng khi đọc trả 401/403/404.
- [x] WebSocket native `/api/v1/realtime`: account/profile/assignment invalidation, cookie/Origin, heartbeat, reconnect và REST resync. Không có mutation trên socket.
- [x] Bỏ refetch hồ sơ/list khi focus, giữ revalidation nền từ realtime; vẫn kiểm lại phiên khi focus/visible, gộp request đang chạy.
- [x] Chuẩn hóa Prisma/DB thành InsurancePolicy/PolicyStatus/insurance_policies bằng migration mới; giữ policy_id/policy_number/linked_policy_id.
- [x] Xóa preview, fixture nghiệp vụ trong UI, nhánh Staff cũ và CSS không dùng. Giữ Customer/account/connection còn hoạt động và page markers của shared layout.

## Checklist phần còn lại

- [ ] **S03 search**: mở rộng DTO/API A05 với tìm kiếm trong toàn tập assignment, pagination/count cùng filter; sau đó nối UI.
- [ ] **S03 retry**: lỗi danh sách hiện có Back to list; ở chính list, đích cùng URL có thể không tải lại. Cần nút retry trong trạng thái lỗi, không khôi phục Refresh thường trực trên header.
- [ ] **Policy read**: A14–16, dữ liệu synthetic và allowlist/quyền; list/detail thực cho S03/S04 và Customer ownership.
- [ ] **Nhiều policy/ngữ cảnh**: policy đang xem khác policy gắn conversation; chọn xem không tự đổi chat. Header/Copilot hiển thị context, đổi context kiểm scope và tách kết quả cũ. Chưa có UI chọn/context persistence/API cập nhật liên kết.
- [ ] **Product/document**: A17–20, mapping policy–version áp dụng, PDF đúng quyền/hết hạn/thu hồi, citations có document/version/page.
- [ ] **Inbox**: A07–10/A13, danh sách theo conversationId, counts/filters/search/phân trang/lịch sử/read marker; chốt New trước khi nối dữ liệu.
- [ ] **Chat/handoff**: A11–12, quyền điều khiển/version, send idempotency/reconcile timeout và chặn Agent ghi khi takeover.
- [ ] **Ticket**: A21–23 và API tạo phía Customer cần đặc tả riêng; confirmation/manual-vs-AI, Ticket+outbox atomic, chống trùng và nhận không gắn chat.
- [ ] **Copilot**: A24–26, Agent contract/checkpoint, lịch sử nội bộ, nguồn/mốc transcript/giới hạn; chèn nháp không tự gửi Customer.
- [ ] **Notifications/realtime nghiệp vụ**: A27–28, Customer recipient, dedup/read/replay, chat/Ticket/notification events và outbox worker. Socket local hiện có chưa cung cấp các phần này.
- [ ] **Customer MVP UI**: menu/dashboard/products/policies/documents/chat/Ticket/notifications; đồng nhất hồ sơ/account với hệ giao diện mới.
- [ ] **UX còn giữ từ mẫu**: bỏ/chỉnh placeholder CCCD/phone trong Policy Lookup và tooltip New; chưa có API cho các tiêu chí đó. Global search/templates/attachment đang disabled; chốt nhu cầu trước triển khai.
- [ ] **QA tiếp theo**: regression có thể chạy lại từ repo/CI, keyboard/focus đầy đủ và mobile Inbox có dữ liệu thật. Hiện chưa có bộ E2E Web được version trong repo.
- [ ] **Vận hành**: event-driven invalidation/multi-instance, sizing/benchmark và quan sát retry/disconnect; không tính poll snapshot local là realtime production hoàn chỉnh.

## Gap và thứ tự xử lý đề xuất

| ID | Ưu tiên | Gap / tác động | Bên xử lý và điều kiện đóng |
| --- | --- | --- | --- |
| G01 | P0 | Policy UI có khung nhưng chưa đọc được hợp đồng | Core/Web: duyệt A14–16, synthetic seed, test nhiều policy/ngoài assignment/null; UI list/detail dùng response thật |
| G02 | P0 | Chưa có contract chọn/ngữ cảnh policy | Product/Core/Web: chốt xem vs liên kết, quyền đổi/version/persistence; API và test đổi context không dùng kết quả cũ |
| G03 | P0 | PDF và version áp dụng chưa xác định | Core/Agent/Web: duyệt A18–20, policy–terms mapping, access/revoke/expiry và test đúng document/version |
| G04 | P0 | Inbox, takeover, send và Ticket chưa có nghiệp vụ | Product/Core/Web: chốt filter/New, state/version/idempotency, confirmation và Ticket+outbox/takeover concurrency; triển khai A07–13/A21–23 |
| G05 | P1 | Search/retry và chi tiết chưa nối dữ liệu | Core/Web: search A05; retry lỗi cùng URL; sửa copy/tooltip mẫu sau khi chốt tiêu chí |
| G06 | P1 | Copilot/AI chưa triển khai | Core/Agent/Web: actor context, retrieval scope/version, checkpoint, citations và fail-safe trước A24–26 |
| G07 | P1 | Không có thông báo nghiệp vụ | Core/Web: recipient Staff/Customer, worker/dedup/read/reconnect; API A27–28 và test Ticket lưu khi delivery lỗi |
| G08 | P1 | Customer portal mới hoàn thành auth/profile | Web/Core: menu/layout mới và read APIs theo ownership; không xóa layout cũ trước khi thay đủ luồng |
| G09 | P1 | Bằng chứng local chưa thành regression suite production | QA/Core/Web: đưa kịch bản test vào repo/CI; test reconnect/quyền/concurrency/a11y/mobile; benchmark riêng |
| G10 | P2 | Tiện ích mẫu chưa có contract | Product/Web: chốt templates/global search/attachment; font picker đã bỏ theo yêu cầu, không đưa trở lại backlog |

P0/P1/P2 là thứ tự làm đề xuất. Có thể tiếp tục UI trước; các thao tác nghiệp vụ giữ disabled cho tới khi contract và Core sẵn sàng. Ưu tiên tiếp: **G05 lỗi/search → G01 policy read + G02 context → G03 PDF → G04 Inbox/Ticket → G06/G07**; G08 có thể đi sau các read API dùng chung.

## Truy vết yêu cầu nguồn

| Yêu cầu | Độ phủ hiện tại |
| --- | --- |
| FR-001 | Login/session/logout/password local; không có public registration/IdP. Không đánh dấu toàn bộ FR-001 xong |
| FR-002 | Read-only profile/Staff contact/assigned Customer; chưa sửa hồ sơ |
| FR-003 | List/detail/pagination theo assignment; thiếu search |
| FR-005/006/007 | Customer chat chưa làm; Staff có shell, chưa chat/takeover/Copilot |
| FR-008, UC-007 | Chỉ có schema và Staff lookup shell; chưa policy/product/PDF API |
| FR-009/010/011/012/013, UC-005/006 | Chưa có Ticket business/chat history/summary/notification. Route hoặc bảng tồn tại không hoàn thành FR |
| NFR-001/002 | Có baseline auth/assignment/CSRF/allowlist/synthetic cho API đã có; retrieval/tool scope chưa triển khai |
| NFR-003/005/007 | Chưa có AI safety pipeline, giao dịch Ticket hay quyền PDF để nghiệm thu |
| NFR-004/006/008 | Có HTTP foundation/audit local một phần; chưa benchmark, chưa notification workload hay observability AI |

SRS không có FR-004 trong bảng FR. Ticket thủ công và notification Customer là mở rộng menu MVP đã ghi nhận, không gán thành nội dung nguyên văn SRS.

## Bằng chứng đối chiếu và giới hạn kiểm tra

| Phạm vi | Source / bằng chứng |
| --- | --- |
| UI/auth/account | `apps/web/src/components/{auth-screen,login-panel,staff-account-menu,staff-personal-information,change-password-form}.tsx` |
| Staff/customer/routes | `staff-reference-workspace.tsx`, `staff-reference-template.tsx`, `staff-customer-directory.tsx`, `customer-workspace.tsx`; `apps/web/src/app/staff/(workspace)` |
| API đã có | `apps/core/src/auth/controllers/auth.controller.ts`, `customers/controllers/customer.controller.ts`; service/DTO tương ứng |
| Realtime | `apps/core/src/realtime/realtime.service.ts`, `apps/web/src/lib/realtime.ts`, `infra/local/nginx/default.conf` |
| Policy model | `apps/core/prisma/schema.prisma`, migration `202610300001_rename_insurance_policies` |

Đợt code trước đã chạy Web lint/build; browser smoke trên Docker cho route/pagination/deep link/Back–Forward/persistent socket, account menu/password validation–save–cancel/logout, Customer profile và unassigned state. Test UI dùng API mock synthetic không phải bằng chứng backend password/transaction. Các script browser nằm local, chưa là test suite tái lập sau clone. Kiểm tra responsive trước đó ở 375/768/1600px là overflow/DOM, không có screenshot hoặc nghiệm thu pixel-perfect.

Core có test version trong `apps/core/test`: provisioning/auth/customers/admin/http-foundation/realtime; realtime + HTTP foundation từng qua 6 test. Lệnh chuẩn ở [getting-started](../getting-started.md#commands). Lần đồng bộ tài liệu này chỉ đối chiếu source và kiểm tra tài liệu; không ghi nhận lại những test đó như vừa chạy hay mở rộng thành chứng nhận production.
