# C01 — Đăng nhập và xác thực tài khoản Customer

05/11/2026 · **Đã hoàn tất theo kiến trúc cấp tài khoản** · [Chung](00-customer-contract.md) · C01.

## 1. Yêu cầu và nguyên tắc xác thực

- **Không có tính năng khách hàng tự đăng ký tài khoản (No public self-registration)**: Trong nghiệp vụ bảo hiểm nhân thọ, tài khoản khách hàng (`Customer`) được cấp thông qua quy trình phát hành hợp đồng bảo hiểm và quản trị vận hành nội bộ (`Staff`/hệ thống cấp kèm mã khách hàng `CUS-xxxxxx`).
- Mật khẩu ban đầu được hệ thống cấp (`passwordChangeRecommended = true`).
- Khách hàng đăng nhập qua cổng `/login` bằng email được cấp và được khuyến nghị đổi mật khẩu tại `/account` sau lần đăng nhập đầu tiên.
- Không triển khai luồng tự đăng ký công khai (`/register`), OTP kích hoạt tự do, SSO bên ngoài hoặc reset mật khẩu tự động mà không qua quy trình định danh hợp đồng.

## 2. Luồng xác thực vận hành

- **Đăng nhập**: `POST /api/v1/auth/login` nhận `{ email, password }`. Cookie phiên HttpOnly được cấp phát, `GET /api/v1/auth/me` xác định vai trò `CUSTOMER` và tự chuyển hướng vào Cổng khách hàng `/customer`.
- **Bảo mật phiên & CSRF**: Xác thực qua cookie phiên, kiểm tra header `X-Auth-Request: 1` và token `X-CSRF-Token` cho mọi thao tác ghi dữ liệu.
- **Đổi mật khẩu**: `POST /api/v1/auth/change-password` cho phép chủ tài khoản tự cập nhật mật khẩu, xóa cờ khuyến nghị đổi mật khẩu.
- **Đăng xuất**: `POST /api/v1/auth/logout` hủy phiên an toàn và chuyển hướng về `/login`.

## 3. Trạng thái và checklist

- [x] Khôi phục phiên, điều hướng theo actor; phiên hết hạn về login.
- [x] Form disabled khi gửi, hiện/ẩn password, lỗi công khai và xử lý 429 theo API.
- [x] Đăng xuất/đổi password dùng API thật, xem [C08](08-profile-contract.md).
- [x] Chốt chính sách tài khoản được cấp từ nghiệp vụ hợp đồng; không có luồng tự đăng ký công khai.
- [x] Điều hướng vào shell H01 (`CustomerWorkspace`) tràn viền toàn màn hình.
