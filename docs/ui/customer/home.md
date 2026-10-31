# C02 — Trang chủ

[Menu](../menu.md) · [Tiến độ và gap](../implementation-status.md)

Đối chiếu 30/10/2026. **Một phần: `/customer` hiện là hồ sơ và contact Staff, chưa phải dashboard MVP.**

## Mục đích và thành phần dự kiến

Xem nhanh policy/kỳ phí từ Core, Staff phụ trách và lối tắt policy/trợ lý.

## Thao tác dự kiến

1. Từ menu mở Home; load summary theo ownership, không lấy count từ fixture.
2. Bấm policy mở chi tiết đúng id; kỳ phí không có dữ liệu không chuyển thành đã thanh toán.
3. Mở trợ lý sau khi chat/context API sẵn sàng.

- [x] Hồ sơ/Staff contact hiện có qua C08; phần đó không tính là dashboard hợp đồng đã xong.

## Checklist còn lại

- [ ] Dashboard và read contract tổng quan (chưa duyệt endpoint).
- [ ] Loading/rỗng/lỗi; chưa có policy/Staff vẫn sử dụng các phần được phép.
- [ ] Lối tắt policy/chat và menu Customer mới.

Các phần dự kiến không phải contract đã duyệt; Core kiểm quyền, Agent không truy cập business DB. Thuật ngữ UI tiếng Anh dùng Policy.
