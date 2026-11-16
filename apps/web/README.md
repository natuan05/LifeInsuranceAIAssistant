# Web

Next.js App Router cho Customer Portal và Staff Workspace. Web gọi Core qua gateway; chạy bằng Docker Compose theo [Getting Started](../../docs/getting-started.md). Phần đã có/còn thiếu theo [tiến độ Application](../../docs/ui/implementation-status.md).

## Chức năng hiện có

- Customer: Home/portfolio, Products, Policies/PDF, hồ sơ chỉ đọc, chat/Direct/consent/handoff, tạo New AI chat và Tickets manual/draft/confirm/list/detail.
- Staff: Account/Security, Customers search/profile/reveal, Policies/PDF, Products, Inbox/Accept/chat và Tickets read/Accept/status.
- Notification center có source ở hai role; DTO/navigation, event và unread/read-cycle còn cần sửa theo Phase 3–4. Copilot và câu trả lời Agent thật chưa tích hợp.

Tài khoản được cấp sẵn. Customer login tại `/login`, Staff tại `/staff/login`; session/role boundary bảo vệ route và xóa dữ liệu riêng khi đổi actor/mất phiên.

## Router và giao diện

Staff route group `staff/(workspace)` giữ layout/socket khi chuyển Customers, Inbox, Policies, Products và Tickets; `/staff` chuyển tới `/staff/customers`. Query/Back–Forward và cập nhật nền giữ nháp, focus, scroll; không reload toàn trang.

Tailwind 4 dùng prefix `tw:`, font Lexend/ảnh tự host và nhãn tiếng Anh. Giấy phép font tại `public/fonts/OFL-Lexend.txt`.

Products/Customers/Policy Lookup tìm bằng Enter; Inbox có debounce/IME. PDF viewer giữ file hiện tại khi metadata không đổi, xóa khi mất quyền; signed URL chỉ giữ trong memory. Chính sách dữ liệu theo [quy định chung](../../docs/configuration-and-data.md).

## Realtime và kiểm thử

`useRealtime` nhận invalidation/session-expired; REST là nguồn dữ liệu/quyền cho resync và catch-up. Lệnh browser mock/gateway E2E tại [tài liệu chức năng Application](../../docs/ui/README.md). Chi tiết chức năng theo [Staff](../../docs/ui/staff/plans/README.md) và [Customer](../../docs/ui/customer/plans/README.md).
