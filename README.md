# Life Insurance AI Assistant

Trợ lý chăm sóc khách hàng bảo hiểm nhân thọ cho **Customer và Staff đã đăng nhập**. PoC chỉ dùng dữ liệu khách hàng và hợp đồng sinh hoàn toàn giả lập.

## Trạng thái

Repo hiện chỉ có khung thư mục và tài liệu nền. Chưa có mã chức năng, dependencies, database, tài nguyên cloud hoặc ứng dụng chạy được. Git làm việc local; chưa cấu hình remote.

## Phạm vi nghiệp vụ

- Customer hỏi đáp, xem hợp đồng/tài liệu của mình và xác nhận tạo Ticket khi cần hỗ trợ.
- Staff tra cứu khách hàng được phân công, dùng AI hỗ trợ và tiếp quản hội thoại.
- Public RAG tìm tài liệu sản phẩm công khai; Private RAG tìm hợp đồng theo quyền. Cả hai phục vụ người đã đăng nhập.
- PoC chưa làm upload/ingestion trong ứng dụng, kho tri thức nội bộ Staff, quy trình xử lý Ticket đến hoàn tất, thanh toán hay phê duyệt Claim.

## Cấu trúc

```text
apps/
  web/          Next.js: Customer Portal và Staff Workspace
  core/         NestJS: danh tính, quyền và nghiệp vụ; modular monolith
  agent/        Python + custom LangGraph: điều phối AI và retrieval
contracts/      Nơi đặt hợp đồng giao tiếp khi được thiết kế
docs/           Kiến trúc nền, đối chiếu nguồn và bước tiếp theo
  adr/          Quyết định kiến trúc, luôn ghi rõ trạng thái
data/
  public/       Quy ước nguồn tài liệu công khai và manifest
  synthetic/    Quy ước dữ liệu giả lập và fixture nhỏ
infra/          Ranh giới môi trường local và hướng triển khai AWS
```

Mỗi ứng dụng hiện chỉ có README. Chưa tạo module con hoặc chốt công cụ quản lý workspace. Đọc [quyết định tổ chức repo](docs/adr/0001-repository-layout.md) để xem đánh đổi.

## Định hướng kỹ thuật

| Phần | Mức xác nhận hiện tại |
| --- | --- |
| Cloud | AWS đã chọn |
| Frontend / Core | Next.js / NestJS modular monolith |
| Agent | Python + custom LangGraph, phát triển local; dự kiến AgentCore Runtime |
| Database | PostgreSQL + pgvector, local trước; định hướng RDS |
| Hosting Core | Dự kiến ECS + EC2 |
| Thông báo | Đang cân nhắc Redis/BullMQ; chưa chốt queue |
| Model / embedding / tự host | Chưa chốt |

## Đọc tiếp

1. [Ranh giới kiến trúc](docs/architecture.md).
2. [Nguồn, điểm chưa thống nhất và quyết định cần chốt](docs/source-review.md).
3. [Quản lý cấu hình, secrets và dữ liệu](docs/configuration-and-data.md).
4. [Bước triển khai tiếp theo](docs/next-steps.md).

Tài liệu trao đổi gốc nằm ngoài repo tại `C:\Users\Admin\Documents\ChatGPT\Life Insurance AI Assistant`. Repo chỉ giữ phần tổng hợp phục vụ phát triển, không sao chép toàn bộ kho trao đổi.
