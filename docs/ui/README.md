# Tài liệu giao diện và tiến độ

Đối chiếu code ngày **30/10/2026**. Tài liệu viết tiếng Việt để team triển khai; nội dung giao diện Web dùng tiếng Anh.

## Thứ tự đọc

1. [Tiến độ, checklist và gap](implementation-status.md): phần chạy thật, phần mới có khung và thứ tự xử lý.
2. [Menu MVP](menu.md): phạm vi Customer/Staff dự kiến, không phải tất cả menu đã có.
3. [Chỉ mục Staff](staff/README.md), [routes](staff/routes.md): cấu trúc giao diện hiện tại.
4. Tài liệu màn hình S01–S07 hoặc C01–C09 được liên kết trong menu.
5. [Bản đồ API Staff](staff/api-map.md): A01–06 đã có; A07–28 còn đề xuất.
6. [Gap Staff và quyết định mở](staff/gap-review.md): chốt trước khi xây API phụ thuộc.
7. [Đặc tả nguồn](../specifications), [baseline kiến trúc](../architecture.md), [đối chiếu nguồn](../source-review.md): truy vết yêu cầu và khác biệt local.

## Cách cập nhật

- `[x]` chỉ đánh dấu phạm vi đã triển khai có bằng chứng code; không đồng nghĩa đã đạt toàn bộ FR/NFR hoặc production.
- `[ ]` là phần còn thiếu. Khung route, nút disabled và trạng thái chưa kết nối không tính là nghiệp vụ hoàn thành.
- Bảng tiến độ là đầu mối trạng thái. Màn hình giữ chi tiết UX/API; `getting-started.md` giữ lệnh chạy; `architecture.md` giữ quyết định local.
- Khi thay đổi: cập nhật checklist → màn hình/API/routes liên quan → gap → tài liệu bên ngoài UI bị ảnh hưởng. Giữ nguyên ID Cxx/Sxx/Axx và lịch sử migration.
- File `contracts.md` trong hai thư mục màn hình giữ tên để không gãy liên kết; thuật ngữ kỹ thuật hiện dùng **Policy / InsurancePolicy / insurance_policies**.

Các tài liệu nguồn trong repo có ghi chú đối chiếu implementation. Không chỉnh Google Docs, PDF hoặc thư mục mẫu UI bên ngoài repo trong đợt đồng bộ này.
