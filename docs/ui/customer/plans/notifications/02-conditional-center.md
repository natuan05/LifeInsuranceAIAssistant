# N02 — Notification Center, API và message read status

**Phương án A đã duyệt:** persisted center và chat/realtime, retention 30 ngày theo [N01](01-scope-recipient-contract.md). [C09](../09-notifications-contract.md).

## 1. Source và phạm vi ảnh hưởng

| Vị trí từ root repo | Trách nhiệm |
| --- | --- |
| [customer-notifications.controller.ts](../../../../../apps/core/src/notifications/customer-notifications.controller.ts) | Own list/read/read-all |
| [notifications.service.ts](../../../../../apps/core/src/notifications/notifications.service.ts) | Projection/recipient, keyset, mutation và cleanup |
| [common-conversation.controller.ts](../../../../../apps/core/src/conversations/controllers/common-conversation.controller.ts) | Mark conversation read |
| [conversation-message.service.ts](../../../../../apps/core/src/conversations/services/conversation-message.service.ts) | Message.readAt và notification unread tương ứng |
| [customer-workspace.tsx](../../../../../apps/web/src/components/customer-workspace.tsx) | Chuông, unread badge và popover |
| [conversation-api.ts](../../../../../apps/web/src/lib/conversation-api.ts) | DTO/request wrappers, được re-export qua notification-api.ts |
| [realtime.service.ts](../../../../../apps/core/src/realtime/realtime.service.ts) | Invalidation đúng recipient |

Schema/migrations theo N01 đã có trong source. N02 tác động cao tới permissions, event retry, read status, projection cả hai role và state browser. Masking thêm theo [ma trận dữ liệu](../../../../configuration-and-data.md#customer-sensitive-data) còn P.

## 2. API và DTO cần thống nhất

Prefix `/api/v1`. Bảng theo response Core hiện tại để đồng bộ client/Swagger/tests.

| API | Response |
| --- | --- |
| GET /customers/me/notifications?limit=20&cursor=... | `{items:[{id,kind,title,body,isRead,createdAt,target:{type,id}}],pageInfo:{hasMore,nextCursor}}` |
| POST /customers/me/notifications/:notificationId/read | `{id,isRead:true}` |
| POST /customers/me/notifications/read-all | `{success:true,count:number}` |
| POST /conversations/:conversationId/read | `{success:true,readAt:string}` |

GET dùng keyset createdAt DESC/id DESC, limit 1–50 và cursor theo actor. Customer chỉ list/read notification của chính mình. Mutation theo session/CSRF/Origin, body notification read/read-all là object rỗng. Role-specific conversation read routes nếu được dùng phải cùng service và kiểm transcript/owner tương ứng.

`target` là DTO thống nhất cho navigation; single-read trả object phẳng, read-all dùng `count`. Source Web còn khai báo `link`, single-read bọc `notification` và read-all `markedCount`; cần sửa client/consumer cho khớp Core và chạy network regression. Không đánh dấu đã hoàn tất từ việc có file wrapper.

## 3. Producer, consumer và trạng thái đọc

1. Business transaction ghi event cùng nghiệp vụ. Handoff Accept đồng thời ghi SYSTEM vào transcript và sinh notification Customer qua consumer.
2. Ticket created sinh notification Customer theo owner; trường hợp chưa có Staff vẫn phải xét đường Customer độc lập với routing Staff. Producer và consumer cần thống nhất schemaVersion/version.
3. Staff gửi tin chưa đọc sinh STAFF_MESSAGE_UNREAD; Customer gửi tin sinh CUSTOMER_MESSAGE_UNREAD cho Staff có quyền. Theo phương án A ở N01, tin mới cùng chu kỳ chưa đọc chat cập nhật notification cũ, giữ id và bật lại isRead=false, dù chuông đã được đánh dấu đọc.
4. Đọc hội thoại cập nhật messages.read_at cho tin đối phương theo CUSTOMER_VISIBLE và quyền. Mốc tin đã đọc kết thúc chu kỳ tương ứng; cập nhật notification và outbox/invalidation phải xử lý đồng thời với tin mới, không nuốt thông báo cho tin sau mốc này.
5. Đọc từng notification hoặc read-all chỉ đổi Notification.isRead, không kết thúc chu kỳ chat. Retry event cũ không tự bật lại unread; consumer cần nhận diện tin mới và chu kỳ bền vững. Link target tiếp tục được API tài nguyên kiểm quyền.

WSS mang invalidation tối thiểu, không nội dung chat/PII. Client refetch REST, xử lý reconnect/response cũ và xóa state khi logout/đổi actor. Source badge hiện đếm các mục chưa đọc đã tải ở client; không công bố đó là tổng unread toàn DB khi còn page tiếp theo.

## 4. Cleanup và những điểm review

Policy đã duyệt ngày 13/11/2026: retention 30 ngày cho cả Customer và Staff, áp dụng notification đã đọc/chưa đọc. Phương án B đã duyệt: NotificationsService chạy cleanup khi Core khởi động và lặp mỗi 24 giờ (86_400_000 ms) bằng timer nội bộ; không dùng Worker cron hoặc scheduler cloud riêng. Source hiện DELETE trên bảng notifications chung theo created_at, đúng scope nhưng interval còn 3_600_000 ms (mỗi giờ); cần đổi và kiểm thử trước nghiệm thu.

Các điểm source còn cần kiểm chứng/sửa:

- DTO Core/Web lệch như mục 2, target navigation và update state sau read/read-all.
- Ticket event producer Customer hiện thiếu version mà consumer yêu cầu; nhánh consumer đang return sớm khi Ticket chưa có assignedStaffId, có thể bỏ qua notification Customer.
- Consumer hiện lọc isRead=false để tìm mục gộp, nên sau mark-read/read-all có thể tạo dòng mới. Cần nhận diện chu kỳ theo mốc đọc chat, tái dùng id và bật unread chỉ khi có tin mới. Thiết kế persistence/constraint cụ thể còn phải rà schema; nếu cần DDL thì thêm migration riêng, không coi đã triển khai.
- Recheck target scope, nội dung generic và xử lý nguồn bị xóa/quyền đã đổi trước navigation.
- Đổi interval cleanup từ mỗi giờ sang mỗi 24 giờ tại NotificationsService, giữ cleanup khi bootstrap và hủy timer khi destroy. Kiểm cutoff cho cả Customer/Staff và read/unread, lỗi DB/restart; bảo toàn Ticket/Message và audit nguồn.

## 5. Test cases

Các ca API/DB/browser/realtime dưới đây dùng fixture synthetic, chưa chạy lại trong lần đồng bộ tài liệu.

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

## 6. Checklist

- [x] Center + chat, recipient và retention 30 ngày cho cả Customer/Staff đã được duyệt.
- [x] Source có schema/API/UI/read status/cleanup.
- [x] Đã duyệt gộp đến khi đọc chat; tin mới giữ id và bật lại unread trong cùng chu kỳ.
- [ ] Hoàn thiện DTO/event và nhận diện chu kỳ bền vững; kiểm N02-T05/T10 và các điểm review tại mục 4.
- [x] Đã duyệt cleanup khi Core khởi động và mỗi 24 giờ bằng timer nội bộ.
- [ ] Đổi interval trong source và kiểm retention/timer theo N02-T07/T09.
- [ ] Chạy hồi quy synthetic API/DB/browser/realtime trước nghiệm thu.
