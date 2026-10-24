# Hạ tầng

Nơi đặt cấu hình môi trường và triển khai khi bắt đầu giai đoạn tương ứng. Hiện chỉ có tài liệu, chưa có Docker Compose, Dockerfile, IaC hoặc tài nguyên cloud.

| Môi trường | Định hướng |
| --- | --- |
| Local | Chạy Web, Core, Agent và PostgreSQL + pgvector; cách dựng sẽ chọn sau |
| AWS | Core dự kiến ECS + EC2; Agent dự kiến AgentCore Runtime; database định hướng RDS |
| PDF | Nguồn đề xuất S3 riêng tư; cách phục vụ file local chưa chốt |

Chưa chọn công cụ IaC, region, topology HA/DR hoặc queue. Không sao chép sizing và ngưỡng tải trong roadmap thành cấu hình mặc định. State, credential, dữ liệu và checkpoint local phải nằm ngoài Git theo [quy tắc cấu hình](../docs/configuration-and-data.md).
