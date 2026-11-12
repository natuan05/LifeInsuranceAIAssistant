# Staff — tài liệu triển khai

04/11/2026 · [Plans theo chức năng](plans/README.md) · [Contract chung](plans/00-staff-contract.md) · [API E/P](plans/00-staff-contract.md#api-theo-chức-năng) · [Routes](plans/00-staff-contract.md#điều-hướng) · [Gap](plans/README.md#phần-còn-lại-theo-chức-năng).

## Cách đọc

Mỗi chức năng có một contract và các phase API/UI/flow/test trong plans, cùng cấu trúc Customer. Nội dung màn hình, API, routes và phần còn thiếu đã gộp vào contract sở hữu; thư mục Staff chỉ giữ README.md và plans/, không duy trì file tổng hợp song song.

| Đã có runtime | Còn kiểm theo phạm vi | Để nhánh Agent |
| --- | --- | --- |
| Auth/profile, Customers, Policy/PDF, Products, Inbox I01–I06, handoff notifications và TK01–TK05 Staff Ticket | Benchmark/fanout và tích hợp rộng hơn | Agent/Copilot, I07 draft/confirmation |

Products tự mở PDF, nhiều tài liệu dùng selector; phiên bản mới chuyển chủ động. Search Enter không nút Search/Clear trên Products/Customers/Lookup; Inbox debounce/Enter. Realtime giữ vùng đọc/nháp/focus, không F5; mất scope xóa ngay.

## Bắt đầu lần triển khai tiếp

[TK01–TK05](plans/07-tickets-contract.md) là baseline đã có cho quyền/model/read/Accept/UI/status/notification; không làm lại theo danh sách phase. Producer I07 từ đề xuất Agent + xác nhận Customer còn kế hoạch, confirmed snapshot chưa có. Không tạo Ticket fake hoặc cho Staff xem AI riêng để lấp UI.

Agent/Copilot và I07 theo [Agent Design](../../specifications/Agent_Design.md) và [plan](../../superpowers/plans/2026-10-31-agent-rag-implementation.md); Copilot không có Use draft. Customer Home/Products/Policies/PDF đã có; phần còn lại theo [plans riêng](../customer/plans/README.md). Tài liệu chia theo chức năng app, không có kế hoạch Release riêng.
