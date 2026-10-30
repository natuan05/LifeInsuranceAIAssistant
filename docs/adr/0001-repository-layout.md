# ADR-REPO-0001 — Monorepo gọn

- Ngày: 24/10/2026.
- Trạng thái: **Áp dụng cho tổ chức repo**, theo quyền tự quyết các lựa chọn thông thường trong yêu cầu khởi tạo.
- Phạm vi: bố trí thư mục; không phê duyệt các ADR đề xuất trong tài liệu nguồn.

## Lựa chọn

Dùng một Git repo với ba ứng dụng `web`, `core`, `agent`. Giữ `contracts`, `docs`, `data` và `infra` cạnh các ứng dụng. Mỗi ứng dụng sẽ quản lý môi trường và dependencies phù hợp khi bắt đầu code.

## Cân nhắc

| Phương án | Lợi ích | Đánh đổi |
| --- | --- | --- |
| Monorepo gọn — chọn | API, tài liệu và các ứng dụng thay đổi trong cùng một lần review | Cần phối hợp hai hệ công cụ JavaScript/Python; sau này CI phải chọn đúng phạm vi |
| Nhiều repo | Quyền truy cập và chu kỳ phát hành tách biệt | Tăng việc đồng bộ phiên bản API và thay đổi xuyên repo ngay từ PoC |
| Workspace có nhiều thư viện dùng chung | Tái sử dụng và điều phối build khi quy mô tăng | Chưa có mã dùng chung; thêm cấu hình và phụ thuộc sớm |

## Hệ quả

- Monorepo không bắt buộc dùng Nest CLI monorepo mode, Nx hoặc Turborepo. Chưa chọn package manager hay build runner.
- Chưa tạo shared library, dịch vụ RAG riêng, Worker riêng hoặc cây module nghiệp vụ rỗng.
- Tách module theo năng lực nghiệp vụ khi có luồng cụ thể. Chỉ tách deployment khi có yêu cầu vận hành thực tế.
- Xem lại lựa chọn nếu các nhóm cần quyền repo khác nhau hoặc phát hành hoàn toàn độc lập.

Căn cứ kỹ thuật: [NestJS Workspaces](https://docs.nestjs.com/cli/monorepo) phân biệt cách tổ chức workspace với tính năng ứng dụng; lựa chọn monorepo gọn ở đây là đánh giá cho dự án này.


## Cập nhật baseline local 30/10/2026

Các câu “chưa chọn” trong phần trên phản ánh thời điểm quyết định 24/10/2026. Theo yêu cầu triển khai tiếp, local đã dùng npm workspaces Web/Core và một lockfile root; không dùng Nx/Turborepo, Agent chưa có runtime/package. Baseline hiện hành ở [architecture](../architecture.md), chức năng UI/API ở [checklist tiến độ](../ui/implementation-status.md). Không thay trạng thái các ADR-AI/cloud đề xuất từ việc đã có UI hoặc WebSocket local.
