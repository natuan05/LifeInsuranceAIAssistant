# C01 — Đăng nhập Customer

[Menu](../menu.md) · [Tiến độ và gap](../implementation-status.md)

Đối chiếu 30/10/2026. **Đã nối API local** tại `/login`, dùng LoginPanel React/Tailwind theo mẫu, font/ảnh tự host và nhãn tiếng Anh.

## Thành phần và thao tác

Email, password có hiện/ẩn, trạng thái đang gửi/lỗi, chuyển Staff login và hướng dẫn liên hệ quản trị khi quên mật khẩu. `POST /api/v1/auth/login` nhận email/password; cookie phiên và `GET /auth/me` quyết định actor/role. Login Customer tới `/customer`; sai role đi đúng cổng. Không có public register/OTP/SSO/reset hoặc lưu password vào browser storage.

## Trạng thái và checklist

- [x] Khôi phục phiên, điều hướng theo actor; phiên hết hạn về login.
- [x] Form disabled khi gửi, hiện/ẩn password, lỗi công khai và xử lý 429 theo API.
- [x] Đăng xuất/đổi password dùng API thật, xem [C08](profile.md).
- [ ] Điều hướng vào menu Customer MVP khi menu mới được dựng; hiện `/customer` là trang hồ sơ, chưa phải dashboard hợp đồng.

Core kiểm Origin/CSRF theo loại request và quyền ở server. UI không tự cấp role. Lệnh chạy/tài khoản dev ở [getting-started](../../getting-started.md).
