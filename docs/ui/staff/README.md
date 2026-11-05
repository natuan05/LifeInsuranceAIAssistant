# Staff — tài liệu triển khai

04/11/2026 · [Plans theo chức năng](plans/README.md) · [Contract chung](plans/00-staff-contract.md) · [API E/P](plans/00-staff-contract.md#api-theo-chức-năng) · [Routes](plans/00-staff-contract.md#điều-hướng) · [Gap](plans/README.md#phần-còn-lại-theo-chức-năng).

## Cách đọc

Mỗi chức năng có một contract và các phase API/UI/flow/test trong plans, cùng cấu trúc Customer. Nội dung màn hình, API, routes và phần còn thiếu đã gộp vào contract sở hữu; thư mục Staff chỉ giữ README.md và plans/, không duy trì file tổng hợp song song.

| Đã có runtime | Còn làm trước Agent | Để nhánh sau |
| --- | --- | --- |
| Auth/profile, Customers, Policy/PDF, Products, Inbox I01–I06, handoff notifications | TK01–TK05 Core/UI/Ticket events đã có; benchmark/fanout còn mở | Agent/Copilot, I07 draft/confirmation, Customer mới |

Products tự mở PDF, nhiều tài liệu dùng selector; phiên bản mới chuyển chủ động. Search Enter không nút Search/Clear trên Products/Customers/Lookup; Inbox debounce/Enter. Realtime giữ vùng đọc/nháp/focus, không F5; mất scope xóa ngay.

## Bắt đầu lần triển khai tiếp

[TK01 — Quyền/model Ticket](plans/tickets/01-scope-model-contract.md) trước TK02 read, TK03 accept, TK04 UI, TK05 event. TK01 đã có version/policy nội bộ; TK02 A21/A22 read API đã có với44 tests TK02+regression pass. TK03 Accept đã có. TK04 UI đã nối. TK05 events đã có; Ticket route đã có list/detail/Accept, confirmed snapshot chưa có. Không tạo Ticket fake hoặc cho Staff xem AI riêng để lấp UI.

Không triển khai Agent trong mốc này; Customer theo [plans riêng](../customer/plans/README.md) để đợt sau. Tài liệu chia theo chức năng app, không có kế hoạch Release riêng.
