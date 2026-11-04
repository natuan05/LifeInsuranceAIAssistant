# C08 — Hồ sơ và tài khoản Customer

[Menu](../menu.md) · [Tiến độ và gap](../implementation-status.md)

Đối chiếu 30/10/2026. **Đã nối API local**; layout Customer vẫn là account/profile cũ đang hoạt động, chưa chuyển sang thiết kế Customer MVP mới.

## Thành phần và thao tác hiện có

- `/customer`: actor và hồ sơ read-only (name/code/email/phone/birth/address/status) từ `GET /api/v1/customers/me`; contact Staff được phân công khi khả dụng.
- `/account`: actor từ `GET /auth/me`, form `POST /auth/change-password` với current/new/confirm, hiện/ẩn từng password, lỗi/thành công; `POST /auth/logout` về `/login`.
- Không có API sửa hồ sơ/KYC, tự đổi phân công hoặc khóa tài khoản. Dữ liệu thiếu hiển thị Not provided.

## Trạng thái và checklist

- [x] Loading/rỗng/lỗi, phiên hết hạn; Staff ASSIGNED/UNASSIGNED/STAFF_UNAVAILABLE từ Core.
- [x] Đổi mật khẩu/logout thật; password mới 6 ký tự đến 72 byte UTF-8, không trim, thu hồi các phiên cũ.
- [x] Lời nhắc password có Later; refresh thủ công và WebSocket ready/invalidate tải lại dữ liệu theo quyền.
- [x] Refresh nền giữ nội dung khi cùng actor; không refetch profile mỗi lần focus, vẫn kiểm lại session.
- [ ] Layout/menu/font Customer đồng nhất thiết kế mới (G08), không xóa CSS cũ khi luồng này còn dùng.
- [ ] Chỉnh sửa hồ sơ chỉ làm sau khi chốt trường, quyền và API; không đánh dấu FR-002 hoàn tất chỉ vì đọc được hồ sơ.
