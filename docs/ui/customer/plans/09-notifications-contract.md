# C09 — Customer Notifications và trạng thái đọc

**Quyết định 08/11/2026, xác nhận phương án A ngày 13/11:** Customer nhận sự kiện trong chat và qua Notification Center lưu DB. Retention thông báo là 30 ngày cho cả Customer và Staff. [Chung](00-customer-contract.md).

## 1. Phạm vi

- Trong chat có realtime/SYSTEM khi Staff tiếp nhận và trạng thái đọc tin nhắn.
- Chuông Customer có danh sách thông báo persisted, badge unread và thao tác đọc từng mục/tất cả.
- Nội dung generic, target theo Customer owner. Xem notification không tự Accept chat/Ticket hoặc cấp transcript grant.
- Message.readAt và Notification.isRead theo hai thao tác riêng. Đọc hội thoại cập nhật tin nhắn và notification unread tương ứng; đánh dấu đọc chuông không tự đánh dấu đã xem transcript.

## 2. Sự kiện

| Sự kiện | Recipient/target |
| --- | --- |
| STAFF_ACCEPTED_HANDOFF | Customer của cuộc chat; target CONVERSATION, đồng thời có SYSTEM |
| SUPPORT_TICKET_CREATED | Customer sở hữu Ticket; target TICKET |
| STAFF_MESSAGE_UNREAD | Customer chưa đọc tin Staff; target CONVERSATION |
| CUSTOMER_MESSAGE_UNREAD | Staff có quyền đang nhận cuộc; nghiệp vụ đối xứng phía Staff |

Phương án A: thông báo tin nhắn gộp theo recipient/cuộc/kind đến khi người nhận đọc chat. Sau khi đọc chuông, tin mới cùng chu kỳ vẫn cập nhật mục cũ, giữ id và bật lại unread. Source hiện gộp theo isRead=false, còn cần sửa theo N01/N02. Nội dung chỉ gồm nhãn chung và mã tham chiếu an toàn, không raw chat/bệnh sử/CCCD/số tiền chi trả.

## 3. Phase, dữ liệu và source

| Phase | Trách nhiệm | Vị trí từ root repo |
| --- | --- | --- |
| [N01](notifications/01-scope-recipient-contract.md) | Event, recipient, schema và retention | `apps/core/prisma/schema.prisma`, notification/conversation/Ticket event services |
| [N02](notifications/02-conditional-center.md) | API, đọc tin, chuông/realtime, cleanup và tests | `apps/core/src/notifications/`, `apps/web/src/components/customer-workspace.tsx`, `lib/conversation-api.ts` |

Source có recipientCustomerId, messages.readAt và hai migration 202611080001/202611090001, cùng API/UI. Các lỗi DTO/event và tiêu chí chưa nghiệm thu được theo dõi tại N02. Mức ảnh hưởng cao ở quyền, dedup, transcript và notification hai role.

## 4. Retention và bảo vệ dữ liệu

Notification của cả Customer và Staff có created_at cũ hơn 30 ngày thuộc diện dọn dẹp, dù đã đọc hay chưa; không xóa Ticket/Message nguồn. Phương án B đã duyệt ngày 13/11/2026: NotificationsService dọn khi Core khởi động và mỗi 24 giờ bằng timer nội bộ. Source hiện vẫn lặp mỗi giờ; cần đổi interval và kiểm thử theo N02, chưa coi cleanup hằng ngày đã triển khai. Scheduled Task Execution cloud đã loại theo [Cloud Architecture](../../../specifications/Cloud_Architecture.md#scheduled-task-removal).

Payload generic và projection theo role được kiểm theo [ma trận dữ liệu](../../../configuration-and-data.md#customer-sensitive-data). Phần masking bổ sung còn P.

## 5. Checklist

- [x] Chat + Notification Center, retention 30 ngày cho cả Customer/Staff và nội dung generic đã được duyệt.
- [x] Tin mới giữ notification cũ trong chu kỳ chưa đọc chat và bật lại unread đã được duyệt.
- [x] Source có schema, API, UI, message read status và cleanup.
- [ ] Hoàn thiện các điểm review N02, kiểm recipient/dedup/retry và tương thích DTO.
- [ ] Chạy hồi quy API/DB/browser/realtime/retention trước nghiệm thu.
