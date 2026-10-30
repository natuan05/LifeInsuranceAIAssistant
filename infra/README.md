# Hạ tầng local

Stack dùng root compose.yaml; cấu hình Nginx tại local/nginx/default.conf, Dockerfiles trong apps/core và apps/web. Chưa triển khai IaC/tài nguyên cloud.

Lệnh chạy/dừng, cổng, dữ liệu/volumes và xử lý lỗi ở [hướng dẫn chung](../docs/getting-started.md). Ranh giới quyền tại [kiến trúc](../docs/architecture.md) và [quy tắc cấu hình](../docs/configuration-and-data.md).


Đối chiếu 30/10/2026: Nginx hai listener proxy Upgrade `/api/v1/realtime` tới Core để cookie Path=/api/v1 được gửi đúng. Đây là invalidation local cho account/profile/assignment, chưa có chat/Ticket/notification delivery hoặc pipeline production. Sau recreate Web/Core nếu upstream cũ gây 502, kiểm service healthy rồi restart gateway. [Tiến độ/gap](../docs/ui/implementation-status.md) giữ trạng thái chức năng, không suy ra realtime nghiệp vụ từ healthcheck container.
