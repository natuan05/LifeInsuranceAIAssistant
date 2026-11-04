# Staff — routes giao diện

Đối chiếu 30/10/2026. [Chỉ mục Staff](README.md) · [Checklist tiến độ](../implementation-status.md). Các đường dẫn dưới đây đã được đăng ký ở Next.js; khác với API `/api/v1/...`.

| Route | Màn hình / trạng thái |
| --- | --- |
| `/staff` | Redirect tới `/staff/customers` |
| `/staff/login` | Đăng nhập Staff |
| `/staff/customers?page=1` | Danh sách được phân công, 10 khách/trang qua API hiện có |
| `/staff/customers/:customerId` | Hồ sơ khách và vùng hợp đồng; đọc profile qua Core. Hợp đồng chưa có API |
| `/staff/inbox?filter=all` | Khung Inbox; filter hỗ trợ all/request/recent/new, chưa nối API hội thoại |
| `/staff/inbox/:conversationId` | Route hội thoại cụ thể đã có khung, chưa tải transcript vì chưa có API |
| `/staff/policies` | Policy Lookup, chưa nối API |
| `/staff/policies/:policyId` | Route chi tiết hợp đồng đã có khung, chưa nối API |
| `/staff/tickets` | Danh sách Ticket riêng, chưa nối API |
| `/staff/tickets/:ticketId` | Route chi tiết Ticket đã có khung, chưa nối API |
| `/account` | Staff Personal information theo style workspace, Security mở password form; Customer giữ account layout hiện có |

Route group `apps/web/src/app/staff/(workspace)` giữ AuthScreen/Staff workspace trong layout chung; page files đăng ký URL, workspace render vùng tương ứng từ pathname/params/searchParams. Sidebar, menu, panel state và WebSocket không unmount khi chuyển giữa các route trong group. `/staff/login` nằm ngoài layout được bảo vệ; `/account` giữ entry riêng để tương thích hai role.

Nguồn trạng thái màn hình là URL, không giữ một bản selectedCustomer/page/menu độc lập để dễ lệch khi Back/Forward. Page query hợp lệ 1–100000, thiếu/sai dùng 1. Mở detail từ trang 2 giữ `?page=2` để breadcrumb trở lại đúng trang; trực tiếp mở detail mặc định page 1. API Core vẫn xác minh quyền, không coi ID trong URL là bằng chứng quyền.

Mở link Staff khi chưa đăng nhập chuyển tới login kèm `next`; sau đăng nhập Staff quay về route hợp lệ trong customers/inbox/policies/tickets. Không nhận URL ngoài ứng dụng làm đích chuyển tiếp. Customer không được vào workspace Staff. Route tồn tại không đồng nghĩa API hoặc dữ liệu đã tồn tại; các phần chưa nối luôn hiển thị trạng thái chưa kết nối, không dựng dữ liệu giả.

Kiểm tra: redirect, query phân trang, link detail/F5, Back/Forward, sidebar giữ DOM và chỉ một WebSocket trong các lần chuyển route; khung Inbox/Policy/Ticket và detail links.


- [x] Route/deep link/query page và Back/Forward đã triển khai.
- [x] Shared layout giữ Staff workspace/socket trong route group.
- [ ] Transcript/policy/Ticket detail thật: route có sẵn nhưng chưa có API tương ứng.
- [ ] Quy tắc New, search/bộ lọc nghiệp vụ và context policy persistence còn mở.
