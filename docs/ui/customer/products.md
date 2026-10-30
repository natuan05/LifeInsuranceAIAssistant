# C03 — Sản phẩm

[Menu](../menu.md) · [Tiến độ và gap](../implementation-status.md)

Đối chiếu 30/10/2026. **Chưa có UI/API sản phẩm.**

## Mục đích và thành phần dự kiến

Danh sách/chi tiết sản phẩm và quyền lợi chung, tài liệu công khai có phiên bản.

## Thao tác dự kiến

1. Mở Products, tìm/chọn sản phẩm trong catalog được Core cung cấp.
2. Mở chi tiết và tài liệu sản phẩm; A17/A19 là đề xuất dùng chung trong bản đồ Staff, chưa có endpoint thật.
3. Nội dung công khai không tự xác nhận quyền lợi của policy cá nhân.

## Checklist còn lại

- [ ] Duyệt API catalog, filter/pagination và nội dung tối thiểu.
- [ ] Danh sách/chi tiết/PDF, loading/rỗng/lỗi và xử lý tài liệu không khả dụng.
- [ ] Phân biệt Public với Private, mở tài liệu đúng version.

Các phần dự kiến không phải contract đã duyệt; Core kiểm quyền, Agent không truy cập business DB. Thuật ngữ UI tiếng Anh dùng Policy, file contracts.md giữ để không gãy liên kết.
