# S03 — Khách hàng được phân công và hồ sơ

[Chỉ mục Staff](README.md) · [Tiến độ](../implementation-status.md) · [Bản đồ API](api-map.md) · [Khoảng trống](gap-review.md)

Đối chiếu 30/10/2026. Căn cứ: FR-002/003; UC-003; baseline customer API. API P và đường dẫn UI chưa có chỉ là đề xuất.


## Hiện trạng 30/10/2026 — Một phần; list/detail/pagination đã nối A05–06

- [x] Customers list/detail riêng, hồ sơ read-only và pagination 10/trang.
- [x] URL/page/deep link/breadcrumb/Back–Forward; Insurance policies lớn, personal information nhỏ.
- [x] Loading/rỗng/lỗi, xóa dữ liệu khi 401/403/404; realtime refresh nền.
- [ ] Search toàn tập assignment (mở rộng A05); không lọc cục bộ một trang.
- [ ] Retry ngay tại trạng thái lỗi list; hiện Back to list có thể giữ cùng URL.
- [ ] Danh sách policy và liên kết lịch sử/Ticket theo khách: A14/A08/A21.

Các phần yêu cầu bên dưới mô tả đích triển khai; chỉ các dòng `[x]` là đã làm.

## Thành phần

Thêm mục **Khách hàng** độc lập với All/Requests trong inbox: danh sách có tên, mã tài khoản, email/điện thoại, trạng thái, phân trang. Chi tiết hồ sơ ở màn hình Khách hàng riêng, gồm birth/address nếu có; không dùng khung chat/Case Details của Inbox thay cho trang quản lý khách hàng. Tên field “National ID” trong mẫu không thuộc DTO hiện tại; không hiển thị CCCD mặc định.

## Thao tác và API

| Thao tác | API / điều hướng |
| --- | --- |
| Xem toàn tập khách phụ trách | A05 E theo page/pageSize; không chỉ khách có hội thoại |
| Mở hồ sơ | A06 E; null ngày sinh/địa chỉ → “Not provided” |
| Tìm khách toàn tập | Cần mở rộng A05 P; hiện query search lạ bị 400. Không lọc một trang rồi coi như toàn bộ |
| Xem hợp đồng | A14 P → S04, chọn trong nhiều hợp đồng |
| Xem trao đổi/Ticket theo khách | A08/A21 P với customerId → S05/S06 |

Hồ sơ chỉ đọc; không sửa KYC, phân công, khóa/mở tài khoản. Staff phụ trách Customer và Staff tiếp quản cuộc chat là hai quan hệ cần hiển thị riêng.

## Trạng thái riêng / checklist

- [x] Staff chưa được gán khách: danh sách rỗng có hướng dẫn; không mở lookup toàn công ty.
- [x] Customer bị khóa vẫn có thể xem nếu active assignment còn hợp lệ theo baseline; không suy ra mất quyền chỉ từ nhãn khóa.
- [x] Detail không tồn tại/ngoài scope đều phản hồi an toàn 404; dữ liệu đang mở bị thu hồi không giữ trong cache UI.

## Yêu cầu trạng thái khi triển khai đầy đủ

Đang tải, danh sách rỗng/không có kết quả, lỗi có nút thử lại. Phiên hết hạn chuyển đăng nhập; mất phân công/không còn quyền xóa dữ liệu riêng đang mở và tải lại scope. Không lấy quyền từ state client. Mọi dữ liệu mẫu phải có nhãn mô phỏng; chỉ báo thao tác thật thành công sau phản hồi Core.

## Phân tách màn hình Khách hàng và Inbox

Theo yêu cầu người dùng: mục Khách hàng hiển thị bảng khách được phân công → Xem chi tiết → thông tin cá nhân và khu vực danh sách hợp đồng (nhiều hợp đồng/khách). Không có transcript, composer, takeover hoặc Copilot ở đây. Các vùng đó chỉ nằm trong Inbox; chọn khách không tự mở cuộc chat hoặc dùng khách đó làm header cho một Inbox chưa chọn hội thoại.

Đã nối API danh sách/hồ sơ hiện có. Khu vực hợp đồng mới có khung trạng thái chưa kết nối vì A14 P chưa triển khai; không coi đó là khách chưa có hợp đồng. Đã kiểm tra chuyển Khách hàng ↔ Inbox, hồ sơ, quay lại danh sách và không tràn ngang 375/768/1600px trên Docker.

## Bố cục chi tiết và làm mới dữ liệu

Chi tiết Customer ưu tiên Insurance policies ở vùng chính, Personal information ở cột phụ 290px (250px ở màn hình trung bình). Header hiển thị breadcrumb Customers → Customer details, tên/avatar, account code và trạng thái; không dùng header mô tả lớn với nút back rời. Mobile xếp policies trước personal information. Nội dung hợp đồng chưa có API vẫn ghi rõ chưa kết nối, không xem đó là danh sách rỗng đã xác minh.

Đã bỏ refetch dữ liệu hồ sơ theo cả focus lẫn visibilitychange: nguồn thay đổi là WebSocket ready/invalidate. Refetch cùng actor/page/customer chạy nền, giữ dữ liệu hiện tại thay vì xóa toàn bộ và bật Loading. Chuyển khách/trang vẫn tải mới, request cũ bị abort; lỗi 401/403/404 xóa dữ liệu riêng và xử lý quyền. Kiểm phiên khi trở lại tab vẫn giữ, gộp request khi focus/visibility cùng xảy ra. Áp dụng cách refresh nền cho Customer Portal để tránh cùng lỗi nháy.

Kiểm tra: tab focus không phát request danh sách mới, giao diện giữ nguyên trong lúc API realtime trả chậm, dữ liệu mới thay đúng nội dung và 404 xóa hồ sơ đang xem; kiểm bố cục 375/768/1600px.
