# Core

Nơi phát triển NestJS theo modular monolith: một ứng dụng nghiệp vụ, chia module khi triển khai từng luồng.

- Xác minh danh tính; kiểm tra Customer ownership và Staff assignment tại mỗi thao tác.
- Sở hữu API khách hàng, hợp đồng, danh mục tài liệu, hội thoại, tiếp quản và Ticket.
- Cung cấp Business API cho Agent; tự kiểm tra quyền và tham số ở mỗi lời gọi.
- Xác thực xác nhận tạo Ticket, chống trùng và chỉ báo thành công sau commit. Ticket và outbox cùng giao dịch theo SRS UC-005.
- Phân phối thông báo sau khi nghiệp vụ đã lưu; queue và vị trí chạy Worker cần chốt.

Chưa tạo module con, schema, ORM hoặc cơ chế đăng nhập. Identity provider và việc lưu credential cần đối chiếu trước khi thiết kế. Hướng hosting: ECS + EC2, chưa triển khai.
