# C01 — Đăng nhập hiện có và đăng ký Customer

04/11/2026 · **Kế hoạch A01/A02, chưa triển khai** · [Chung](00-customer-contract.md) · C01.

## 1. Yêu cầu và baseline

FR-001 có cả đăng ký/đăng nhập. Login/session/password/logout đã E, nhưng chưa có public register/OTP/SSO/reset. Không đánh dấu toàn FR hoàn tất từ tài khoản local được cấp. Dù FR ghi Customer/Staff, thiết kế này chỉ đề xuất Customer đăng ký; Staff vẫn do vận hành cấp, không nhận role từ signup.

## 2. Chia phase

| Phase | Nội dung | Gate |
| --- | --- | --- |
| [A01](auth/01-registration-core.md) | Quyết định signup policy, API/validation/quota và tạo User+CustomerProfile atomic | Chốt local signup/email verification trước bật route |
| [A02](auth/02-registration-ui.md) | Form đăng ký, redirect/login, errors/keyboard/responsive | A01 thật; không runtime mock |

Auth đang chạy được giữ nguyên. Không làm quên mật khẩu, xác minh OTP hoặc thay password policy chỉ để bổ sung form.

## 3. Data và phạm vi

User/CustomerProfile dùng quan hệ role composite hiện có; accountCode cấp bằng allocator đang dùng, hash password bằng cơ chế hiện có. Customer mới không có policy/assignment/chat/Ticket mặc định. Không nhập citizenId hoặc ảnh giấy tờ từ form đăng ký. Không nhận status/isActive/assignedStaffId/confirmedAt.

Đăng ký công khai cần chốt kiểm soát lạm dụng và email verification, vì source chưa đặc tả. Đề xuất local: email/password/fullName, không auto-login, về login sau commit; không suy rộng thành cơ chế cloud đã duyệt. A01 phải ghi quyết định trước code; không thêm email provider/secret khi chưa có nhu cầu được chốt.

## 4. Gate hoàn tất

- [ ] A01 policy/transaction/constraints/tests pass; secret/password không log.
- [ ] A02 UI/E2E tạo tài khoản synthetic và login được, teardown đúng.
- [ ] Login/password/logout hai role, session freshness/CSRF và Staff provisioning không hồi quy.

## UX và baseline của chức năng

## Thành phần và thao tác

Email, password có hiện/ẩn, trạng thái đang gửi/lỗi, chuyển Staff login và hướng dẫn liên hệ quản trị khi quên mật khẩu. `POST /api/v1/auth/login` nhận email/password; cookie phiên và `GET /auth/me` quyết định actor/role. Login Customer tới `/customer`; sai role đi đúng cổng. Không có public register/OTP/SSO/reset hoặc lưu password vào browser storage.

## Trạng thái và checklist

- [x] Khôi phục phiên, điều hướng theo actor; phiên hết hạn về login.
- [x] Form disabled khi gửi, hiện/ẩn password, lỗi công khai và xử lý 429 theo API.
- [x] Đăng xuất/đổi password dùng API thật, xem [C08](08-profile-contract.md).
- [ ] Điều hướng vào shell H01 khi được dựng; giữ profile/chat/account đang hoạt động.
- [ ] A01/A02: đăng ký Customer theo contract được chốt; chưa có endpoint runtime.

Core kiểm Origin/CSRF theo loại request và quyền ở server. UI không tự cấp role. Lệnh chạy/tài khoản dev ở [getting-started](../../../getting-started.md).
