# Web

Next.js App Router cho Customer Portal và Staff Workspace. Web gọi Core, không trực tiếp gọi Agent/DB hoặc nhận credential server. App runtime chỉ Docker Compose qua gateway; lệnh setup/test ở [Getting Started](../../docs/getting-started.md).

## Runtime hiện tại — 04/11/2026

Customer /login, Staff /staff/login dùng LoginPanel; /account dùng auth boundary theo role. Staff có Personal information editor tên/phone và Security/change-password; account menu Personal information/Sign out. Session passive freshness30 giây, initial/invalidate/expiry/retry kiểm ngay; không gọi auth/me mỗi tin hoặc selection.

Staff có Customers search/list/profile/policies, Policy Lookup/dossier/PDF, Products/catalog/PDF tự mở và Inbox All/Requests/Active với accordion/search/Accept/transcript/composer/notifications. Tickets route chỉ khung; Copilot chưa nối. Customer hiện có own profile/contact và chat tối thiểu/Direct/consent/handoff/send/reconcile/realtime; Customer shell/registration/PATCH/policy/PDF UI mới còn plans riêng.

## Giao diện và router

Tất cả styling dùng Tailwind4 prefix tw:, Lexend/font/ảnh tự host, English labels. globals.css chỉ import/theme/font; không staff-workspace.css, legacy layer hoặc stylesheet component riêng. Giấy phép font tại public/fonts/OFL-Lexend.txt. Không public signup/reset/OTP/SSO chỉ vì UI mẫu có.

Shared route group staff/(workspace) giữ layout/socket cho customers/inbox/policies/products/tickets và detail. Page marker trả null để layout sở hữu workspace, không phải dead code. /staff redirect /staff/customers. Query History API, đổi route Next Link/router; không F5/remount workspace khi tìm/lọc/phân trang/lưu/thử lại.

Search Products/Customers/Policy Lookup bằng Enter, xóa text rồi Enter bỏ lọc; Inbox debounce300ms/Enter/IME. Products tự mở PDF đầu, nhiều tài liệu selector; cùng version giữ iframe, version mới chuyển chủ động. Policy main PDF theo binding, information đóng mặc định/related docs riêng. Không tự trích PDF thành dữ liệu nghiệp vụ.

## Realtime và privacy

useRealtime nhận ready/invalidate/session-expired và I06 chat/scope/notification invalidations, REST authority cho data/grant/catch-up. Background sync giữ DOM/accordion/nháp/focus/scroll/cursor pages, không đưa revision realtime vào directory key. Revoke/actor/session đổi xóa memory/iframe đúng scope. Inbox không Refresh inbox/conversation/messages hoặc Message saved, giữ sending/unknown/reconcile/errors.

Core mới quyết định Direct/consent/Accept và quyền tài liệu; client không suy từ assignment/UUID/Ticket link. Signed URL chỉ memory, không history/localStorage/chat/log; vẫn có residual TTL ở storage.

Code/API/test plans ở [Staff](../../docs/ui/staff/plans/README.md), [Customer](../../docs/ui/customer/plans/README.md), [tiến độ](../../docs/ui/implementation-status.md). Browser tests dùng DOM/network/console/PDF bytes/hash; không screenshot/video/trace. Mock không chứng minh Core/MinIO authorization.
