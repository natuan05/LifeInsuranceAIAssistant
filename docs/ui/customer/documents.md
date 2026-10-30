# C05 — Xem tài liệu

[Menu](../menu.md) · [Tiến độ và gap](../implementation-status.md)

Đối chiếu 30/10/2026. **Chưa có catalog/view API hoặc UI PDF; chỉ có schema Document/DocumentVersion.**

## Mục đích và thành phần dự kiến

Xem/tải PDF có sẵn đúng ownership và phiên bản áp dụng của policy; không có upload/ingestion trong app.

## Thao tác dự kiến

1. Từ policy chọn tài liệu bằng documentId/versionId; Core kiểm lại quyền.
2. Nhận access URL có hạn hoặc stream (cách trả chưa chốt), mở đúng trang khi từ citation.
3. Hết hạn xin quyền lại; bị thu hồi/PDF lỗi báo rõ, không giữ URL ký trong chat/log.

## Checklist còn lại

- [ ] Chốt mapping policy–terms/version áp dụng, không tự dùng currentVersion.
- [ ] API catalog/access cho Customer và viewer/error/retry/expiry.
- [ ] Test ownership/thu hồi/quyền phiên bản/PDF hỏng; không đánh dấu NFR-007 đạt khi chỉ có bảng.

Các phần dự kiến không phải contract đã duyệt; Core kiểm quyền, Agent không truy cập business DB. Thuật ngữ UI tiếng Anh dùng Policy, file contracts.md giữ để không gãy liên kết.
