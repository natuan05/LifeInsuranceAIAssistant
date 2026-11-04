# C04 — Hợp đồng của tôi

[Menu](../menu.md) · [Tiến độ và gap](../implementation-status.md)

Đối chiếu 30/10/2026. **Chưa có UI/API policy Customer; model InsurancePolicy đã có quan hệ nhiều policy/Customer.**

## Mục đích và thành phần dự kiến

Danh sách policy, sản phẩm/status/ngày hiệu lực, quyền lợi/sum assured và kỳ phí từ Core.

## Thao tác dự kiến

1. Mở My policies, chọn một policy theo id; một Customer có thể có nhiều policy.
2. Xem coverage/premium/next due date từ nguồn Core; null không mặc định 0 hoặc đã đóng phí.
3. Mở tài liệu đúng version hoặc Hỏi về policy này sau khi có chat/context contract.

## Phạm vi triển khai tiếp — 31/10/2026

Trang My policies cần list/detail từ DB và bản PDF hợp đồng chi tiết có sẵn trong object storage private. Thông tin nghiệp vụ trên web giúp đọc nhanh; phần đầy đủ đọc bằng viewer Xem PDF trong app, kèm nút Tải PDF đúng phiên bản. Không cần lưu toàn bộ văn bản PDF vào DB hoặc nhân đôi thành trang HTML chi tiết. Điều khoản/phụ lục là tài liệu liên quan riêng, không dùng PDF sản phẩm chung thay hợp đồng cá nhân.

Core xác minh Customer từ phiên và ownership ở mỗi API; không dùng API Staff hoặc ID do client gửi để tự cấp quyền. Chọn hợp đồng/tài liệu, xem/zoom/tải và retry không reload kiểu F5; giữ URL/back và focus phù hợp. Khi chưa có tài liệu vẫn xem thông tin hợp đồng và trạng thái chưa có PDF. Luồng Hỏi về policy này tiếp tục phụ thuộc chat/context, không chặn việc triển khai policy read/PDF.

Đặc tả dùng chung và checklist hai vai trò ở [Xem/tải tài liệu](documents.md#hướng-triển-khai-policypdf-đã-thống-nhất--31102026).

## Checklist còn lại

- [ ] Duyệt API ownership list/detail Customer; không dùng Staff API thay quyền Customer.
- [ ] UI list/detail, pagination/filter theo contract; loading/rỗng/lỗi/thu hồi quyền.
- [ ] Tách policy đang xem với policy liên kết chat, liên kết PDF và context rõ ràng.
- [ ] Xem PDF trong app và Tải PDF đúng version, cùng nguồn file với phía Staff, kiểm ownership khi cấp quyền truy cập.
- [ ] Seed khách không có/một/nhiều hợp đồng, PDF có nhãn synthetic, field null và policy chưa có tài liệu; UI phân biệt từng trạng thái.

Các phần dự kiến không phải contract đã duyệt; Core kiểm quyền, Agent không truy cập business DB. Thuật ngữ UI tiếng Anh dùng Policy.
