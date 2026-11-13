# N01 — Chốt Customer notification scope và recipient

Cập nhật **08/11/2026** · **ĐÃ CHỐT TRIỂN KHAI THEO QUYẾT ĐỊNH NGÀY 08/11/2026** · [C09](../09-notifications-contract.md).

## Data model và phạm vi ảnh hưởng

Bảng bên dưới mô tả tác động của phase, gồm cả ghi gián tiếp qua Core. Tên bảng thuộc schema `business` trừ nơi ghi rõ; cột còn đề xuất được đánh dấu **P**. Web không truy cập DB trực tiếp.

| Bảng/model | Cột hoặc dữ liệu liên quan | Thao tác của phase | Quan hệ/ràng buộc cần giữ | Mức ảnh hưởng và nơi bị tác động |
| --- | --- | --- | --- | --- |
| users + auth_sessions | users.id/role/status, auth_sessions.user_id/token_hash/expires_at/revoked_at | Đọc | AuthSession.user_id → User.id; session phải còn hạn, không bị thu hồi | Cao — mọi API dùng session; không trả token/hash trong DTO |
| Customer notification recipient — P, chưa có schema | recipient_customer_id hoặc bảng CustomerNotification riêng chưa chọn; kind/target/dedup/read/retention cần chốt | DDL dự kiến, không reuse recipient_staff_id | Hiện Notification.recipient_staff_id FK StaffProfile; phải chọn CHECK đúng một recipient hoặc bảng riêng | Cao — Staff notification/dedup/outbox/query scope cần giữ nguyên, không backfill người nhận từ Staff |
| outbox_events | aggregate_type/aggregate_id/event_type/payload/status/retry_count/next_attempt_at/lease_owner/lease_expires_at/last_error | Thêm trong transaction nguồn; worker cập nhật trạng thái/lease | Index status/next_attempt_at/lease_expires_at; aggregate_id là reference kiểm bởi service, không FK đa loại | Cao — retry/reclaim/dedup, commit nghiệp vụ khác delivery; REST vẫn là nguồn dữ liệu |

**Schema/migration:** P — N01 chưa chọn mở rộng Notification hay bảng riêng. N02 chỉ triển khai sau quyết định, không coi staff notification API là Customer API.

**Nhất quán và hồi quy:** Producer/consumer/read đều kiểm Customer owner và target; chat SYSTEM/realtime hiện có không tự biến thành hộp notification. Kiểm không lẫn recipient, dedup/revoke/read và bảo toàn Staff bell.

## 1. Quyết định đã chốt (08/11/2026)

Hệ thống thống nhất **giữ cả hai phương án song song**:
1. Giữ tin nhắn realtime/SYSTEM trong khung chat (I06) khi có sự kiện tương tác trực tiếp.
2. Triển khai hộp thông báo bền vững (Quả chuông Notification Center) lưu trữ trên Database để khách hàng theo dõi sự kiện ngoài luồng chat.

### Các tham số nghiệp vụ và kỹ thuật đã chốt:
1. **Bộ 3 event tối thiểu phát sinh thông báo**:
   - `STAFF_ACCEPTED_HANDOFF`: Staff đã tiếp nhận hội thoại chuyển giao từ khách hàng.
   - `SUPPORT_TICKET_CREATED`: Support Ticket đã được tạo thành công cho khách hàng.
   - `STAFF_MESSAGE_UNREAD`: Khi nhân viên đã gửi tin nhắn hỗ trợ mà khách hàng chưa đọc (chưa mở hội thoại).
2. **Người nhận (Recipient)**: Xác định đúng `customerId` của khách hàng sở hữu sự kiện; truy vấn chỉ trả thông báo thuộc quyền sở hữu của chính khách hàng đó.
3. **Thời hạn lưu trữ & dọn dẹp (Retention)**: Lưu trữ trong **30 ngày**, định kỳ tự động dọn rác DB các bản ghi thông báo cũ hơn 30 ngày (không ảnh hưởng tới bản ghi Ticket hay Message gốc).
4. **Nội dung Generic (Không để lộ thông tin nhạy cảm / PII)**:
   - **Đúng (Generic được phép)**: Hiển thị tiêu đề/thông điệp tóm lược chung:
     - *"Phiếu hỗ trợ #TK-001 của bạn đã được tạo"*
     - *"Nhân viên đã tiếp nhận yêu cầu chat"*
     - *"Bạn có tin nhắn mới từ nhân viên hỗ trợ"*
   - **Sai (Nghiêm cấm)**: Không bê nguyên nội dung tin nhắn chat riêng tư, số tiền bồi thường bảo hiểm, thông tin bệnh án, số CCCD/CMND vào thông báo.
5. **Theo dõi trạng thái đã đọc tin nhắn (Message Read Status)**:
   - Thêm trường theo dõi đã đọc trong database bảng tin nhắn (`messages.read_at` / `is_read`) để đối phương biết tin mình gửi đã được xem (read receipts).
   - Khi có tin nhắn từ Staff mà khách hàng chưa xem (`read_at IS NULL`), phát sinh thông báo generic lên Quả chuông.

| Vị trí từ root repo | Hiện trạng | Trách nhiệm trong phase | Mức ảnh hưởng | Phạm vi cần kiểm lại |
| --- | --- | --- | --- | --- |
| [apps/core/prisma/schema.prisma](<../../../../../apps/core/prisma/schema.prisma>) | Hiện có | Hiện recipient Staff, P Customer schema sau review | Cao | Migrations/index/check và Staff data |
| [apps/core/src/notifications/notifications.service.ts](<../../../../../apps/core/src/notifications/notifications.service.ts>) | Hiện có | Hiện Staff; Customer policy/endpoint còn P | Cao | Không nới gate Staff để dùng cho Customer |
| [apps/core/src/outbox/services/outbox-dispatcher.service.ts](<../../../../../apps/core/src/outbox/services/outbox-dispatcher.service.ts>) | Hiện có | P Customer recipient dispatch sau chốt event | Cao | Handoff/Ticket consumers hiện có |
| `apps/web/src/components/customer-notifications.tsx` | Dự kiến — chưa có file | P conditional UI sau N01, chưa có file | Trung bình | Customer header và deep links |

## 2. Model và vị trí dự kiến

Rà `apps/core/src/notifications/`, `outbox/`, `realtime/`, Prisma `Notification`/`OutboxEvent` và `Message`:
- Phương án mở rộng bảng `business.notifications`: Bổ sung `recipient_customer_id` (nullable, foreign key trỏ tới `CustomerProfile`) kèm CHECK constraint: chính xác một trong hai (`recipient_staff_id` HOẶC `recipient_customer_id`) có giá trị.
- Bổ sung trường `read_at TIMESTAMPTZ NULL` vào bảng `business.messages`.
- Producer: ghi nhận sự kiện qua Transactional Outbox trong cùng transaction nghiệp vụ, worker phát thông báo kèm dedup key `(event_id, recipient_customer_id)`.
- Cron / Scheduled Job: Xóa `notifications` có `created_at < NOW() - INTERVAL '30 days'`.

## 3. API và flow

- Candidate P GET `/api/v1/customers/me/notifications?limit=20&cursor=...`
- Candidate P POST `/api/v1/customers/me/notifications/:notificationId/read`
- Candidate P POST `/api/v1/conversations/:id/read` (để cập nhật `read_at` cho các tin nhắn chưa đọc trong hội thoại, đồng thời xóa/đánh dấu đọc notification tin nhắn chưa đọc tương ứng).

```mermaid
flowchart TD
  A[Quyết định 08/11/2026] --> B[Giữ cả Chat realtime + Quả chuông DB]
  B --> C[3 Event: Staff Accept / Ticket Created / Message Unread]
  C --> D[Recipient = customerId & Retention 30 ngày]
  D --> E[Generic Content - Cấm lộ PII]
  E --> F[Thêm read_at vào Message]
  F --> G[Sẵn sàng triển khai N02]
```

## 4. Test cases

Các ca dưới đây là **kịch bản dự kiến**, chỉ thực thi sau dependency/contract đã chốt trong phần phạm vi; không đánh dấu chức năng đã có.

**Quy ước dữ liệu:** S-A/S-B là hai Staff synthetic; C-A/C-B là hai Customer synthetic khác nhau. Thay alias bằng UUID/token của fixture cô lập; các path HTTP dùng prefix /api/v1 nếu chưa ghi đầy đủ. Chỉ thay assignment, khóa account, inject lỗi hoặc migration trong harness/môi trường test, không trên tài khoản/dữ liệu đang sử dụng.

### N01-T01 — Review owner và loại sự kiện

**Lớp kiểm thử:** Contract review dự kiến.
**Điều kiện và dữ liệu:** Danh sách event/recipient/retention phải được chốt trước N02; dùng C-A/C-B/S-A synthetic.

**Các bước:**

1. Lập bảng mỗi event với recipient và target.
2. Thử truy vết case CustomerB đọc mục A hoặc Staff giả recipient.
3. Review target đã xóa/mất quyền.

**Kết quả mong đợi:** Mỗi loại có owner/gate rõ; không lấy client/LLM quyết recipient; không public API E chỉ từ proposal.

### N01-T02 — Không làm center khi chưa được chọn

**Lớp kiểm thử:** Contract review dự kiến.
**Điều kiện và dữ liệu:** N01 chưa có quyết định triển khai hoặc quyết định không cần center.

**Các bước:**

1. Kiểm routes/menu/badge dự kiến.
2. Đối chiếu yêu cầu nguồn và khả năng I06 hiện có.
3. Đánh dấu gate N02 theo quyết định.

**Kết quả mong đợi:** Không tạo endpoint/UI chết hoặc bắt FR-013 phải có Customer center; N02 chỉ mở khi dependency đã chốt.

### N01-T03 — Migration không phá Staff notifications

**Lớp kiểm thử:** Migration harness dự kiến.
**Điều kiện và dữ liệu:** Nếu chọn model mới, có snapshot Staff A27/A28 với handoff/Ticket fixtures.

**Các bước:**

1. Apply migration trên schema riêng.
2. Chạy lại recipient/dedup/read Staff bằng API harness.
3. Thử payload pending chứa private preview trong fixture.

**Kết quả mong đợi:** Không mất bảng/quyền/unique Staff; typed recipient không chồng lẫn; preview/private history không được public cho Customer sai scope.

**Checklist chức năng liên quan** (giữ trạng thái triển khai, không phải kết quả của lần sửa tài liệu):

- [ ] Có quyết định cần/không cần center, event tối thiểu và source truy vết.
- [ ] Nếu làm: model/constraints/retention/error/producer được ghi cụ thể trước N02.
- [ ] Nếu không làm: đánh dấu N02 deferred, không tạo route/badge/UI chết.

**Dọn sau kiểm thử:** xóa đúng fixture/session/object/schema theo runId; phục hồi fault injection và đóng context/socket test. Không reset DB/credential, sửa bootstrap hoặc xóa volumes. Với PDF kiểm metadata/bytes/hash; với UI kiểm DOM/focus/network, không cần screenshot.

## Sequence diagram

**Luồng dự kiến:** chỉ áp dụng sau khi các dependency và API ở phần phạm vi được chốt.

```mermaid
sequenceDiagram
    actor U as Người phụ trách yêu cầu
    participant R as Review N01
    participant M as Model và permission contract
    participant P as Plan N02
    U->>R: Nêu nhu cầu notification ngoài chat
    R->>M: Đối chiếu event, recipient, owner, retention
    alt Không chọn center hoặc chưa chốt scope
        M-->>R: Điểm còn mở
        R-->>P: Deferred, không tạo UI hoặc API giả
    else Chọn triển khai và đã chốt model
        M-->>R: Contract và migration requirements
        R->>P: Chốt API, producer, test data và cases
    end
```
