# N02 — Notification Center, API và message read status

**Phương án A đã duyệt:** persisted center và chat/realtime, retention 30 ngày theo [N01](01-scope-recipient-contract.md). [C09](../09-notifications-contract.md).

## 1. Source và phạm vi ảnh hưởng

| Vị trí từ root repo | Trách nhiệm |
| --- | --- |
| [customer-notifications.controller.ts](../../../../../apps/core/src/notifications/customer-notifications.controller.ts) | Own list/read/read-all |
| [notifications.service.ts](../../../../../apps/core/src/notifications/notifications.service.ts) | Projection/recipient, keyset, mutation và cleanup |
| [common-conversation.controller.ts](../../../../../apps/core/src/conversations/controllers/common-conversation.controller.ts) | Mark conversation read và read-state |
| [conversation-message.service.ts](../../../../../apps/core/src/conversations/services/conversation-message.service.ts) | Message.readAt và notification unread tương ứng |
| [customer-workspace.tsx](../../../../../apps/web/src/components/customer-workspace.tsx) | Chuông, unread badge và popover |
| [conversation-api.ts](../../../../../apps/web/src/lib/conversation-api.ts) | DTO/request wrappers, được re-export qua notification-api.ts |
| [realtime.service.ts](../../../../../apps/core/src/realtime/realtime.service.ts) | Invalidation đúng recipient |

Schema/migrations theo N01 đã có trong source. N02 tác động cao tới permissions, event retry, read status, projection cả hai role và state browser. Masking thêm theo [ma trận dữ liệu](../../../../configuration-and-data.md#customer-sensitive-data) còn P.

## 2. API và DTO

Prefix `/api/v1`. Bảng theo response Core hiện tại để đồng bộ client/Swagger/tests.

| API | Response |
| --- | --- |
| GET /customers/me/notifications?limit=20&cursor=... | `{items:[{id,kind,title,body,isRead,createdAt,target:{type,id}}],pageInfo:{hasMore,nextCursor}}` |
| POST /customers/me/notifications/:notificationId/read | `{id,isRead:true}` |
| POST /customers/me/notifications/read-all | `{success:true,count:number}` |
| POST /conversations/:conversationId/read | `{success:true,readAt:string}` |
| GET /conversations/:conversationId/read-state | `{readThroughSequence:string}` |

GET dùng keyset createdAt DESC/id DESC, limit 1–50 và cursor theo actor. Customer chỉ list/read notification của chính mình. Mutation theo session/CSRF/Origin, body notification read/read-all là object rỗng. Role-specific conversation read routes hiện có ở Customer/Staff controller và cùng gọi markAsRead, nên không kết luận thiếu endpoint. Web hai role dùng common route theo [spec Application](../../../../application-code-alignment-spec.md#7-phase-3--contract-notification-và-ticket-event), giữ auth/CSRF và transcript/owner gate.

`target` dùng cho navigation; single-read trả object phẳng, read-all dùng `count`. Web mở đúng Ticket/chat và refetch tài nguyên theo quyền hiện hành.

`read-state` là GET chỉ đọc, không nhận query; Core suy role từ session và kiểm quyền transcript/owner. Prefix chỉ bao phủ các tin CUSTOMER_VISIBLE của role đang xem có readAt thật, không đi qua một tin unread. UI dùng prefix cho nhãn đã xem, không tạo timestamp readAt.

Resync lấy read-state và tin mới bằng after cursor, tối đa 10 trang mỗi batch. Batch còn backlog được tiếp tục tự động; lỗi có thể thử lại giữ các trang đã tải thành công và Retry từ cursor cuối. Mất quyền xóa dữ liệu hội thoại. Không tải lại body lịch sử cũ; khi không có tin mới, số request là 2, độc lập độ dài lịch sử đã tải.

## 3. Producer, consumer và trạng thái đọc

1. Business transaction ghi event cùng nghiệp vụ. Handoff Accept đồng thời ghi SYSTEM vào transcript và sinh notification Customer qua consumer.
2. Ticket created sinh notification Customer theo owner; trường hợp chưa có Staff vẫn phải xét đường Customer độc lập với routing Staff. Producer/consumer dùng schemaVersion=1/version=0 cho TICKET_CREATED.
3. Staff gửi tin chưa đọc sinh STAFF_MESSAGE_UNREAD; Customer gửi tin sinh CUSTOMER_MESSAGE_UNREAD cho Staff có quyền. Theo phương án A ở N01, tin mới cùng chu kỳ chưa đọc chat cập nhật notification cũ, giữ id và bật lại isRead=false, dù chuông đã được đánh dấu đọc.
4. Đọc hội thoại cập nhật messages.read_at cho tin đối phương theo CUSTOMER_VISIBLE và quyền. Mốc tin đã đọc kết thúc chu kỳ tương ứng; cập nhật notification và outbox/invalidation phải xử lý đồng thời với tin mới, không nuốt thông báo cho tin sau mốc này.
5. Đọc từng notification hoặc read-all chỉ đổi Notification.isRead, không kết thúc chu kỳ chat. Retry event cũ không tự bật lại unread; consumer cần nhận diện tin mới và chu kỳ bền vững. Link target tiếp tục được API tài nguyên kiểm quyền.

WSS mang invalidation tối thiểu, không nội dung chat/PII. Client refetch REST, xử lý reconnect/response cũ và xóa state khi logout/đổi actor. Source badge hiện đếm các mục chưa đọc đã tải ở client; không công bố đó là tổng unread toàn DB khi còn page tiếp theo.

## 4. Cleanup và những điểm review

Policy đã duyệt ngày 13/11/2026: retention 30 ngày cho cả Customer và Staff, áp dụng notification đã đọc/chưa đọc. Phương án B đã duyệt: NotificationsService chạy cleanup khi Core khởi động và lặp mỗi 24 giờ (86_400_000 ms) bằng timer nội bộ; không dùng Worker cron hoặc scheduler cloud riêng. Source DELETE trên bảng notifications chung theo created_at, mỗi 86_400_000 ms và khi bootstrap; watermark không bị xóa theo notification.

Chu kỳ unread lưu trong `conversation_notification_states`. Tin mới hợp lệ giữ notification ID khi mục còn tồn tại và bật unread; đọc chuông không kết thúc chu kỳ. Đọc chat chốt watermark trong transaction. Retry hoặc event cũ sau cleanup không tái tạo notification. Event v2 xác định message/sequence hoặc mốc đã đọc; nguồn v1 reconciliation theo watermark.

Reconciliation v1 bỏ phần đã xử lý ngay trong truy vấn, lấy tin chưa đọc đầu tiên để giữ danh tính chu kỳ và mốc cuối để cập nhật watermark. Số truy vấn không tăng theo số tin trong lịch sử hoặc backlog.

Backfill nâng cấp giữ phần unread có event legacy đang chờ, tách notification của chu kỳ đã đọc và bảo toàn state runtime. Event v1 ở DLQ thuộc phần baseline được sửa sẽ trở lại hàng đợi; consumer vẫn kiểm quyền hiện hành. Kiểm nâng cấp: `node --test apps/core/test/notification-cycle-migration.test.cjs` trên host qua Docker.

Gap legacy đã PUBLISHED chỉ được phục hồi khi baseline chưa tiến lên, tin còn unread trong 30 ngày và không có notification tương ứng. Migration tạo reconciliation event v2 theo message/sequence, giữ event nguồn và không phát lại toàn bộ lịch sử. Web cập nhật trạng thái đọc của các trang cũ bằng read-state, chỉ catch-up tin mới, giữ vị trí cuộn và kiểm lại quyền mỗi request.

Notification đã đọc của chu kỳ cũ không chứng minh tin mới đã được thông báo. Khi có mốc đọc chat trước phần unread mới, recovery giữ mục cũ đã đọc và mở chu kỳ mới. Invalidation realtime được retry độc lập với dedup ghi DB; đọc chat cũng làm chuông refetch.

### Repair/replay Ticket event

Consumer tự sửa payload TICKET_CREATED cũ thiếu version khi audit tạo Ticket và snapshot xác nhận đủ bằng chứng. Version tạo luôn là 0, không lấy version hiện tại. Event không xác minh được tiếp tục báo lỗi/retry/DLQ.

Đưa một event PENDING/FAILED_DLQ đã xác minh về hàng đợi bằng ID cũ:

```powershell
docker compose exec -T core node dist/outbox/replay-ticket-event.js '<event-id>'
```

Lệnh giữ nguyên Ticket/event ID, từ chối event đang có lease; event PUBLISHED không phát lại. Worker retry và dedup theo event/recipient.

## 5. Test cases

Các ca dùng fixture synthetic. DTO/navigation/common read và Ticket recipient/repair thuộc Phase 3; chu kỳ unread và cleanup theo Phase 4.

| Mã | Ca | Kết quả mong đợi |
| --- | --- | --- |
| N02-T01 | List/keyset/read/read-all bằng C-A/C-B và role sai | Owner đúng, không lẫn cursor/recipient; DTO đúng contract |
| N02-T02 | Click notification, read từng mục/read-all | Navigate bằng target, state đúng response, refresh vẫn giữ read persisted |
| N02-T03 | Handoff Accept | Có SYSTEM trong chat và một notification Customer generic |
| N02-T04 | Tạo Ticket thủ công/draft, có hoặc không Staff | Ticket đã commit vẫn có Customer event đúng schema; không phụ thuộc quyền recipient Staff |
| N02-T05 | Customer/Staff: nhiều tin, mark-read/read-all rồi nhận thêm, đọc chat rồi nhận tin mới | Trước đọc chat: cùng id, tin mới bật unread; sau đọc chat: chu kỳ mới; đọc chuông không đổi Message.readAt |
| N02-T06 | Offline/reconnect/logout/revoke và response muộn | Refetch theo quyền, không khôi phục dữ liệu cũ hoặc lộ PII |
| N02-T07 | Customer/Staff, read/unread ở hai phía cutoff 30 ngày; lỗi cleanup | Cùng retention cho cả hai role, đúng cutoff; không làm mất Ticket/Message hoặc audit |
| N02-T08 | Keyboard/mobile, generic content và pagination | Popover/focus dùng được, badge theo phạm vi dữ liệu đã tải |
| N02-T09 | Fake timer: bootstrap, trước/đúng 24 giờ, restart và destroy | Cleanup một lần khi khởi động, không lặp mỗi giờ, lặp mỗi 24 giờ; destroy hủy timer |
| N02-T10 | Retry event sau đọc chuông/chat, restart consumer, tin mới đồng thời với đọc chat và sau cleanup | Retry không tái bật unread/tái tạo mục cũ; cùng chu kỳ không trùng dòng, tin sau mốc đọc vẫn được báo |
| N02-T11 | Read-state hai role, bigint, khoảng trống unread, mất quyền và lịch sử 1.000 tin | GET không ghi dữ liệu; không suy đã xem qua tin unread; resync không tải lại lịch sử, giữ draft/vị trí cuộn và xử lý 429/retry |
| N02-T12 | Event v1 hai role với 50.000 tin, có/chưa có watermark và backlog chưa đọc | Số truy vấn giới hạn; đúng chu kỳ, bigint, retry sau đọc chuông/cleanup và quyền hiện hành |
| N02-T13 | Catch-up hai role qua nhiều batch, 429/500/lỗi mạng, mất quyền và response muộn | Giữ tiến độ/cursor khi retry, không tải lại trang thành công; giữ draft/vị trí cuộn, xóa dữ liệu khi mất quyền |

Regression catch-up: [conversation-catchup.spec.mjs](../../../../../apps/web/tests/browser/conversation-catchup.spec.mjs).

## 6. Checklist

- [x] Center + chat, recipient và retention 30 ngày cho cả Customer/Staff đã được duyệt.
- [x] Source có schema/API/UI/read status/cleanup.
- [x] Đã duyệt gộp đến khi đọc chat; tin mới giữ id và bật lại unread trong cùng chu kỳ.
- [x] DTO/navigation/common read, Ticket recipient và repair/replay theo Phase 3.
- [x] Chu kỳ unread/watermark bền vững, retry/restart và read/send concurrency theo Phase 4.
- [x] Đã duyệt cleanup khi Core khởi động và mỗi 24 giờ bằng timer nội bộ.
- [x] Cleanup bootstrap/24 giờ, strict cutoff 30 ngày và phục hồi sau lỗi DB.
- [x] Kiểm synthetic API/DB/browser/realtime cho phạm vi Phase 3–4.
- [x] Read-state đúng quyền, không ghi dữ liệu; resync chỉ tải tin mới, không tăng request theo lịch sử đã mở.
