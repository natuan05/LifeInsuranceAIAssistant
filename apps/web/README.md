# Web

Next.js App Router cho Customer Portal và Staff Workspace. Web gọi Core để đọc/ghi nghiệp vụ; không trực tiếp gọi Agent hoặc database, không nhận credential server.

Setup env, chạy Docker, cổng và đăng nhập ở [hướng dẫn chung](../../docs/getting-started.md). Thiết kế ở [kiến trúc](../../docs/architecture.md).

## Giao diện đăng nhập

- Customer: `/login`; Staff: `/staff/login`. Cả hai dùng `LoginPanel`, Tailwind CSS 4 và font Lexend tự host (giấy phép trong `public/fonts/OFL-Lexend.txt`).
- Chuyển từ mẫu `insurance_ui/login.html` và `staff-login.html`: nền xanh nhạt, cửa sổ hai cột, ảnh riêng cho từng role; điện thoại thu về một cột. Hai ảnh trong `public/images` lấy từ các file PNG cùng tên của mẫu do người dùng cung cấp.
- Vẫn đăng nhập bằng email qua Core; quyền và điều hướng dựa trên actor trong phiên. Quên mật khẩu hiển thị hướng dẫn liên hệ quản trị; không mô phỏng OTP, SSO/2FA, lưu mật khẩu hoặc dùng tài khoản demo của mẫu.
- Utility Tailwind dùng prefix `tw:` và không nạp Preflight. CSS Customer account/profile và connection đang dùng nằm trong layer `legacy`; Staff account đã dùng style workspace mới. Nhánh Staff cũ/CSS không dùng/preview đã bỏ.


## Staff workspace và trạng thái

Đối chiếu 30/10/2026. Cấu trúc mẫu người dùng được chuyển sang `staff-reference-template.tsx`; `staff-reference-workspace.tsx` ghép dữ liệu/panel/URL và `staff-workspace.css` scope `.staff-inbox`. Staff fullscreen, English/Lexend, không Preferences; account popover chỉ Personal information/Sign out. Customers tách khỏi chat; detail ưu tiên Insurance policies nhưng policy data chưa kết nối.

`/staff` redirect `/staff/customers`; route group `(workspace)` giữ layout/socket cho customers/inbox/policies/tickets và detail. Page markers trả null là điểm vào layout, không phải dead code. `/account` là entry riêng dùng chung hai role, Staff có Security mở password form. Xem [routes](../../docs/ui/staff/routes.md).

Auth/account/Customer profile/assigned-customer list-detail-pagination dùng API thật. Search khách chưa có; Inbox/policy/Ticket chỉ khung route, composer/takeover disabled, Copilot và notification chưa có API. Customer profile/account vẫn là layout cũ đang hoạt động, không coi đó là code thừa.

`useRealtime` dùng native WebSocket cookie tới `/api/v1/realtime`, nhận ready/invalidate/session-expired rồi đọc lại REST. Account/profile/assignment là scope hiện có; không phải chat transport. Profile/list refresh nền, không refetch khi focus; auth vẫn revalidate phiên. Xem [checklist và gap](../../docs/ui/implementation-status.md), [thứ tự tài liệu](../../docs/ui/README.md).
