# Core

NestJS modular monolith sở hữu danh tính, phân quyền và nghiệp vụ. Setup Docker, env, cổng, Swagger, tài khoản mẫu và lệnh test ở [Getting Started](../../docs/getting-started.md); baseline tại [kiến trúc](../../docs/architecture.md).

## Runtime hiện tại — 04/11/2026

AppModule import Database/Auth/Customers/Policies/Products/Conversations/Realtime/Outbox/Notifications và Tickets (TK01 policy/version và TK02 Staff read controllers). Source theo tính năng với controllers/dto/services/module tương ứng. AdminModule/AccountsModule thuộc entrypoint local src/admin/main.ts, role admin_runtime riêng; không public qua gateway. Prisma schema/migrations là nguồn model, không tạo bản model TypeScript song song.

Đã có auth/session/password/logout, GET/PATCH staff/me, GET customers/me, Staff assigned-customer list/search/detail, policy list/lookup/detail/applied-document catalog/view/download, product PUBLIC catalog/current-document access hai role, Inbox groups/metadata/consent/Accept/history/send/reconcile và handoff/Ticket notifications (TK05).

I01–I06 thực thi Direct/consent/Accept gate, command receipts/sequence, SYSTEM sau Accept và outbox/realtime catch-up. Assignment không cho Staff xem chat AI riêng. A21/A22 Staff Ticket list/detail đã có TK02; TK03 tiếp nhận Ticket đã có; tạo/xác nhận còn kế hoạch, không suy từ bảng hoặc route.

## Database và storage

Schema hiện có19 model ứng dụng và10 migrations đến 202611050002_ticket_status_notifications. Rename InsurancePolicy/PolicyStatus/insurance_policies và remove ConversationStatus.CLOSED giữ lịch sử bằng migration mới; TicketStatus.CLOSED còn riêng. Runtime/operator kiểm compatibility hiện hành, không reset DB hoặc sửa migration đã apply.

Core dùng DB role core_runtime và storage-reader từ Docker volumes; seed/job dùng writer riêng. Policy exact applied version khác Product current published version. Core kiểm session/quyền/binding/version, HEAD/recheck/audit trước signed URL; Web không nhận credential. URL đã cấp còn residual TTL theo contract.

## Realtime và kiểm thử

WS /api/v1/realtime receive-only, cookie/exact Origin/session; account/profile/assignment snapshot và I06 chat/scope và TK05 Ticket/notification invalidation. Client REST resync theo quyền; không transcript/raw tool/LLM tokenstream trong frame. Outbox worker local một Core process có lease/retry/dedup, không production fanout hoặc delivery/read ACK.

Core tests, browser mock và gateway E2E là các lớp riêng. Lệnh dùng Docker test harness trong Getting Started; fixture synthetic riêng tự dọn, không thay bootstrap hoặc credential. API E/P và kế hoạch code ở [Staff contracts/phases](../../docs/ui/staff/plans/README.md); Customer mới theo [plans riêng](../../docs/ui/customer/plans/README.md).

Agent và các contract/tác vụ tương lai do nhánh phụ trách riêng; README này chỉ ghi trạng thái app, không phê duyệt thiết kế Agent/cloud.
