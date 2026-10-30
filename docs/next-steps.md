# Phạm vi hiện tại và hướng phát triển

Đối chiếu **30/10/2026**. Chi tiết duy nhất về trạng thái màn hình và gap nằm ở [checklist UI](ui/implementation-status.md); đọc [chỉ mục UI](ui/README.md) theo thứ tự. Setup/vận hành ở [getting-started](getting-started.md), quyết định còn mở ở [source-review](source-review.md).

## Đã có

- [x] Compose Web/Core/Nginx/PostgreSQL/DbGate; migration/seed synthetic và operator local tách public app.
- [x] Auth/session/đổi password/logout, hồ sơ Customer/Staff contact và Staff assigned-customer list/detail/pagination.
- [x] Staff UI từ mẫu, Customers riêng, account page/menu, routes/deep link/shared layout; English/Lexend/fullscreen và dọn preview/dead UI.
- [x] InsurancePolicy/PolicyStatus/insurance_policies bằng migration mới.
- [x] WebSocket receive-only invalidation account/profile/assignment; REST resync/refresh nền. Chưa realtime chat/Ticket/notification.

## Thứ tự tiếp theo đề xuất

1. **G05 — hoàn thiện Customers:** search API theo toàn tập assignment, pagination/count cùng filter và retry lỗi ở list. Không đưa lại nút Refresh trên header.
2. **G01/G02 — policy read/context:** chốt A14–16, DTO/ownership/assignment/null, seed hoàn toàn synthetic; list/detail và nhiều policy. Tách policy đang xem với policy gắn hội thoại; contract đổi liên kết chưa có.
3. **G03 — product/document/PDF:** catalog, mapping policy–version áp dụng, quyền xem có hạn và citations. Không tự dùng currentVersion hoặc mở upload.
4. **G04 — Inbox/Ticket:** chốt New/filter, list/transcript/version/idempotency, confirmation/Ticket+outbox và takeover chặn Agent ghi; API A07–13/A21–23. Customer Ticket manual/AI cần contract tạo riêng.
5. **G06/G07 — Agent và notifications:** actor/tool scope, retrieval/version, checkpoint bền vững, Copilot/history/summary; recipient Staff/Customer, outbox delivery/read/dedup/reconnect. Chưa chốt provider/model/queue/production transport.
6. **G08/G09 — hoàn thiện Customer portal và kiểm chứng:** menu/style mới trên các read API dùng chung; E2E được version/CI, keyboard/mobile có dữ liệu, concurrency và benchmark.

Các bước là kế hoạch, không phải yêu cầu triển khai ngay hoặc phê duyệt API đề xuất. Cloud/RDS, SLO/sizing/HA/DR vẫn cần phạm vi riêng. Giữ nguyên ranh giới Core/Agent, dữ liệu synthetic và lịch sử migration.
