# S01 — Đăng nhập và tài khoản

[Chỉ mục Staff](README.md) · [Tiến độ](../implementation-status.md) · [Bản đồ API](api-map.md) · [Khoảng trống](gap-review.md)

Đối chiếu 30/10/2026. Căn cứ: SRS FR-001; baseline local auth. API P và đường dẫn UI chưa có chỉ là đề xuất.


## Hiện trạng 30/10/2026 — Đã nối API local

- [x] Login/session/điều hướng đúng role, password/logout A01–04.
- [x] Menu hai hành động, Personal information style Staff, Security mở password form.
- [x] Lời nhắc đóng được; `/account#change-password` mở form.
- [ ] Chỉnh sửa hồ sơ Staff: chưa có API, không có nút cập nhật.

Các phần yêu cầu bên dưới mô tả đích triển khai; chỉ các dòng `[x]` là đã làm.

## Thành phần và điều hướng

`/staff/login`: logo/ảnh, email, mật khẩu có hiện/ẩn, lỗi, trợ giúp liên hệ quản trị và chuyển cổng Customer. `/account`: actor, mã tài khoản, email, role, đổi mật khẩu và đăng xuất. Từ staff card mở tài khoản thay vì reload như mock.

## Thao tác và API

| Thao tác | API | Kết quả |
| --- | --- | --- |
| Mở app/khôi phục phiên | A02 E | Dùng actor Core, đúng role vào Staff; Customer chuyển đúng home |
| Đăng nhập | A01 E | Email/password đã cấp; không SSO/OTP/đăng ký public hoặc lưu mật khẩu |
| Đổi mật khẩu | A04 E | Kiểm tra cũ/mới/xác nhận, giới hạn 6 ký tự/72 byte UTF-8 theo Core; không trim password; cấp phiên mới |
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

Dùng cùng StaffReferenceTemplate/sidebar với workspace, không còn khung auth-card LifeCare cũ. Header Personal information; thẻ identity/avatar từ actor, các trường read-only full name/email/account code/role; thẻ Security mở form Change password theo nhu cầu. Không hiển thị trường giả hoặc nút cập nhật khi chưa có API sửa hồ sơ Staff.

Form mật khẩu dùng style Staff riêng, giữ API và validation hiện có, có Cancel, thông báo lỗi/thành công. `/account#change-password` mở form từ lời nhắc. Kiểm tra giao diện 375/768/1600px và kiểm tra form bằng API giả lập; không đổi credential dev trong test.
