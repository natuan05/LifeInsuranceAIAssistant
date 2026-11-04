# S01 — Đăng nhập và tài khoản

[Chỉ mục Staff](README.md) · [Tiến độ](../implementation-status.md) · [Bản đồ API](api-map.md) · [Khoảng trống](gap-review.md)

Đối chiếu 31/10/2026. Căn cứ: SRS FR-001; baseline local auth và yêu cầu sửa hồ sơ Staff. API P và đường dẫn UI chưa có chỉ là đề xuất.


## Hiện trạng 31/10/2026 — Đã nối API local

- [x] Login/session/điều hướng đúng role, password/logout A01–04.
- [x] Menu hai hành động, Personal information style Staff, Security mở password form.
- [x] Lời nhắc đóng được; `/account#change-password` mở form.
- [x] API đọc/sửa hồ sơ Staff (31/10/2026): `GET/PATCH /api/v1/staff/me`.
- [x] Web đã nối form sửa họ tên/số điện thoại với GET/PATCH /staff/me (31/10/2026).
- [x] Edit/Save/Cancel, validation tên/phone, disabled khi gửi, thông báo kết quả; 409 yêu cầu tải lại hồ sơ, 401 chuyển đăng nhập.
- [x] API lưu/đọc lại và cập nhật tên auth/me đã kiểm chứng qua gateway Docker thật; chặn phiên bản cũ 409 và Customer 403.
- [x] Giao diện dùng Tailwind `tw:`; đã bỏ dòng Contact your administrator cùng icon/dải footer.
- [x] Web/Core Docker tại cổng 8080 đã cập nhật; bundle mới có Edit/Save và không còn footer Contact.
- [ ] Regression browser tự động cho form sửa hồ sơ: keyboard/focus, responsive và các lỗi mạng/phiên/xung đột; không đánh đồng kiểm tra HTTP với browser E2E.

Các phần yêu cầu bên dưới mô tả đích triển khai; chỉ các dòng `[x]` là đã làm.

## Thành phần và điều hướng

`/staff/login`: logo/ảnh, email, mật khẩu có hiện/ẩn, lỗi, trợ giúp liên hệ quản trị và chuyển cổng Customer. `/account`: actor, mã tài khoản, email, role, đổi mật khẩu và đăng xuất. Từ staff card mở tài khoản thay vì reload như mock.

## Thao tác và API

| Thao tác | API | Kết quả |
| --- | --- | --- |
| Mở app/khôi phục phiên | A02 E | Dùng actor Core, đúng role vào Staff; Customer chuyển đúng home |
| Đăng nhập | A01 E | Email/password đã cấp; không SSO/OTP/đăng ký public hoặc lưu mật khẩu |
| Đổi mật khẩu | A04 E | Kiểm tra cũ/mới/xác nhận, giới hạn 6 ký tự/72 byte UTF-8 theo Core; không trim password; cấp phiên mới |
| Mở hồ sơ Staff | GET /staff/me E | Lấy tên/phone/department và updatedAt của Staff trong phiên |
| Lưu hồ sơ Staff | PATCH /staff/me E | fullName/phone + expectedUpdatedAt; cần CSRF; chỉ báo thành công sau Core, làm mới tên app shell |
| Đăng xuất | A03 E | Thu hồi phiên; về `/staff/login` |

Lời nhắc đổi password là khuyến nghị, không khóa toàn bộ app. Trợ giúp quên password hiện là liên hệ quản trị, không gọi API reset công khai.

## Trạng thái riêng / checklist

- [x] Form disabled khi gửi, lỗi sai tài khoản/cổng/khóa và 429 hiển thị thông điệp an toàn.
- [x] Không dùng tên Staff hard-code; đăng xuất thật, kiểm lại phiên khi quay lại tab.
- [x] Không chuyển tính năng operator tạo/khóa/gán tài khoản vào Staff.

## Yêu cầu trạng thái khi triển khai đầy đủ

Đang tải, danh sách rỗng/không có kết quả, lỗi có nút thử lại. Phiên hết hạn chuyển đăng nhập; mất phân công/không còn quyền xóa dữ liệu riêng đang mở và tải lại scope. Không lấy quyền từ state client. Mọi dữ liệu mẫu phải có nhãn mô phỏng; chỉ báo thao tác thật thành công sau phản hồi Core.

## Giao diện thanh tài khoản

Thanh avatar/tên/mã Staff nằm trong footer sidebar theo kích thước của UI nguồn. Nhấn mở popover chỉ gồm Personal information (`/account`) và Sign out qua API hiện có. Change password nằm trong trang Personal information, không còn là mục menu riêng. Không đặt nút đăng xuất lớn bên ngoài thanh tài khoản. Popover đóng khi click ra ngoài/Escape; Escape trả focus về nút mở. Menu được kiểm tra không tràn viewport ở 375/768/1600px.

## Trang Personal information hiện tại

Nếu truy cập bản Docker ở `localhost:8080`, thay source/build npm chưa cập nhật container. Cần rebuild Web và Core: `docker compose up -d --build --no-deps core web`, sau đó `docker compose restart gateway` để cập nhật upstream. Ngày 31/10 đã kiểm chứng GET/PATCH hồ sơ qua gateway thật và bundle FE mới có Edit/Save; kiểm chứng này không bao gồm thao tác trực tiếp trên Chrome.

Toàn bộ Web dùng Tailwind 4 prefix `tw:` trực tiếp trong component (31/10/2026); đã xóa staff-workspace.css. Thẻ hồ sơ không còn footer Contact; email/code/role/department vẫn chỉ đọc.

Cập nhật API 31/10/2026: `GET /api/v1/staff/me` trả `{staff: {id, accountCode, email, role, fullName, phone, department, updatedAt}}`. Chỉ Staff đang đăng nhập được đọc/sửa chính mình. `PATCH` nhận `fullName` (trim, 1–255 ký tự, không ký tự điều khiển), `expectedUpdatedAt` (ISO timestamp từ GET), và `phone` tùy chọn (7–15 chữ số, có thể bắt đầu bằng `+`; bỏ qua để giữ, `null` để xóa). Không nhận userId/email/accountCode/role/department hay trường lạ; query lạ bị từ chối.

PATCH cần cookie phiên, Origin được phép, JSON, `X-Auth-Request: 1`, `X-CSRF-Token` từ auth/me hoặc login. Trả 200 với cùng cấu trúc hồ sơ sau commit; 400 input sai, 401 phiên không hợp lệ, 403 sai role/CSRF/Origin, 404 thiếu hồ sơ, 409 phiên bản cũ hoặc phone trùng, 429 quá 30 lần/15 phút/user. Client gặp 409 cần tải lại GET trước khi sửa tiếp. Core khóa user, kiểm lại phiên sau khóa, cập nhật hồ sơ và audit cùng giao dịch; audit không chứa giá trị hồ sơ. Phiên hiện tại giữ nguyên; auth/me trả tên mới. Không cần migration/dependency mới. Web đã nối API chỉnh sửa ngày 31/10/2026.

Dùng cùng StaffReferenceTemplate/sidebar với workspace, không còn khung auth-card LifeCare cũ. Header Personal information; thẻ identity/avatar từ actor, các trường read-only full name/email/account code/role; thẻ Security mở form Change password theo nhu cầu. Nút Edit personal information mở form họ tên/số điện thoại; Save changes gửi PATCH kèm updatedAt và CSRF mới lấy từ auth/me. Cancel bỏ bản nháp; 409 yêu cầu tải lại hồ sơ, không tự gửi lại. Chỉ thông báo thành công sau phản hồi Core và phát invalidation để cập nhật tên ở app shell. Email/code/role/department chỉ đọc.

Form mật khẩu dùng style Staff riêng, giữ API và validation hiện có, có Cancel, thông báo lỗi/thành công. `/account#change-password` mở form từ lời nhắc. Kiểm tra giao diện 375/768/1600px và kiểm tra form bằng API giả lập; không đổi credential dev trong test.
