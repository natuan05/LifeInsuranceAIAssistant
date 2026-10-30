# Hợp đồng giao tiếp

Nơi đặt đặc tả API và sự kiện dùng giữa Web, Core và Agent sau khi chốt thiết kế. Hiện chưa có schema hoặc client sinh tự động.

Các hợp đồng cần thiết kế trước: ngữ cảnh actor được ủy quyền; yêu cầu/kết quả Agent; phạm vi tài liệu; Business Tools; xác nhận và chống trùng Ticket; sự kiện tiếp quản/thông báo.

- Core sở hữu quy tắc nghiệp vụ và quyền. Các bên thống nhất định dạng giao tiếp, không dùng chung ORM entity.
- TypeScript và Python trao đổi theo đặc tả trung lập ngôn ngữ; không import trực tiếp mã nội bộ của nhau.
- Chọn định dạng và cách sinh client khi bắt đầu tích hợp. Chỉ thêm package dùng chung khi có người dùng thực tế.
- Mẫu request/response chỉ chứa định danh và dữ liệu giả lập; không chứa token hay URL đã ký.


## Trạng thái 30/10/2026

API local hiện đã có controller/DTO và Swagger cho auth/profile/assigned customers; native WebSocket `/api/v1/realtime` chỉ invalidation account/profile/assignment. Thư mục này chưa có schema giao tiếp được version hoặc generated client riêng, không có nghĩa toàn bộ dự án chưa có API.

[Bản đồ API UI](../docs/ui/staff/api-map.md) phân biệt A01–06 đã có với A07–28 đề xuất. Contract policy context update, Customer business APIs và chat/Ticket/notification events/replay còn thiếu; kênh invalidation không xác lập các contract đó. Xem [checklist và gap](../docs/ui/implementation-status.md) trước khi thêm schema/client.
