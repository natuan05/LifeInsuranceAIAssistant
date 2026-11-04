# Hạ tầng local

Stack ở root compose.yaml; Nginx tại local/nginx/default.conf, Dockerfiles trong apps/core và apps/web, MinIO/storage client trong infra/local. Chưa triển khai IaC/tài nguyên cloud.

Lệnh chạy/dừng, cổng, env/data/credential volumes và xử lý lỗi ở [Getting Started](../docs/getting-started.md). Ranh giới quyền tại [kiến trúc](../docs/architecture.md) và [quy tắc cấu hình](../docs/configuration-and-data.md).

Đối chiếu04/11/2026: Nginx hai listener proxy Upgrade /api/v1/realtime tới Core, cookie Path=/api/v1 được gửi đúng. WS hiện có account/profile/assignment và chat/scope/notification invalidations; I06 worker/outbox và REST catch-up local đã chạy. Không transcript/private payload, tokenstream, delivery/read ACK hoặc fanout nhiều replica.

Core chỉ storage-reader, seed-dev writer; test cleanup authority chỉ profile tests riêng. Init/prepare/migrate/seed chờ health/job success, runtime env root .env; volumes đã có được giữ, không rotate/reset khi cập nhật source. Sau recreate Web/Core nếu upstream cũ gây502, kiểm service healthy rồi restart gateway. Trạng thái chức năng ở [checklist](../docs/ui/implementation-status.md), không suy quyền/nghiệp vụ từ healthcheck.
