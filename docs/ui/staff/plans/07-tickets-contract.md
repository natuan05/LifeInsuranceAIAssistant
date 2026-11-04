# S06 — Ticket hỗ trợ

[Chỉ mục](../README.md) · [Spec chat](inbox/00-inbox-spec.md#9-tickets-và-thông-tin-phụ-trong-đợt-làm-lại) · [API](00-staff-contract.md#api-theo-chức-năng) · [Thông báo](06-notifications-contract.md)

Đối chiếu **03/11/2026**. A21–23/UI nghiệp vụ chưa có; runtime chỉ khung. Đợt hiện tại tách Ticket rõ khỏi chat/handoff.

## Ranh giới đã chốt

- Ticket là nhánh **Agent gợi ý tạo → Customer xem/xác nhận → Core tạo**. Yêu cầu Staff/Direct/Accept chat không bắt buộc và không tự tạo Ticket.
- TicketStatus OPEN/ASSIGNED/IN_PROGRESS/RESOLVED/CLOSED là trạng thái Ticket. Chat không có nghiệp vụ Closed; ConversationStatus đã bỏ CLOSED qua migration mới, không thay TicketStatus.
- Ticket có thể liên kết Conversation hoặc không; đọc/accept/close Ticket không tự cấp quyền transcript, nhận chat hoặc thay mode chat. Biết conversationId vẫn phải Direct/Accept gate ở Core.
- Tickets là trang riêng; không nhét list vào accordion chat/Customers. Form Ticket thủ công của kế hoạch MVP cũ để backlog riêng, không triển khai trong đợt Inbox đang chốt.

## Model và contract còn thiếu

Schema có title/aiSummary/extractedDetails/idempotencyKey/confirmedAt và các liên kết, chưa có contract content/source/version đủ cho toàn workflow. AI summary không phải nguyên văn đã xác nhận. Actor/ownership/xác nhận/chống trùng và Ticket+outbox atomic do Core thực thi, chỉ báo thành công sau commit. Delivery lỗi không xóa Ticket.

MVP chưa có resolve/hoàn tất/phản hồi/Claim/payment. Giữ enum RESOLVED/CLOSED không đồng nghĩa đã có UI/API đóng Ticket hoặc được phép dùng để đóng chat.

## Checklist

- [x] Ghi ranh giới Ticket khác yêu cầu Staff/quyền chat.
- [x] Có kế hoạch AI draft/confirmation/content/source/version/idempotency ở I07; các đề xuất vẫn cần review trước code, chưa có runtime.
- [ ] A21/A22 list/detail đúng quyền, URL/error/retry không F5.
- [ ] A23 accept Ticket độc lập, không tạo chat grant; lifecycle/notification theo contract riêng.
- [ ] Test Ticket link không bypass Accept transcript; delivery/retry an toàn.

## Kế hoạch Staff trước Agent — nguồn contract Staff hiện hành

Nhánh đọc/tiếp nhận **có thể triển khai trước Agent** theo [TK01](tickets/01-scope-model-contract.md) → [TK02 read](tickets/02-staff-read-api.md) → [TK03 accept](tickets/03-accept-command.md) → [TK04 UI](tickets/04-list-detail-ui.md) → [TK05 events](tickets/05-notification-events.md). Tất cả còn P, chưa API/code mới. Quyền đề xuất mặc định active assignment **và** Ticket recipient chính Staff; không unassigned/global OPEN queue. Gate scope/version/legacy phải review TK01 trước code.

Schema SupportTicket hiện không có version/updatedAt/confirmedContent/sourceDraftId. TK01 đề xuất thêm version bằng migration mới trước accept; immutable confirmed snapshot/draft do I07 sau này. Legacy confirmedAt không chứng minh aiSummary/extractedDetails là nguyên văn Customer xác nhận: detail ghi LEGACY_UNVERIFIED và confirmedContent=null, không backfill giả.

Nguồn tạo Ticket từ Agent/Customer confirmation vẫn do [I07](tickets/06-agent-confirmation.md) cùng Customer T01/T02 sở hữu. Không endpoint tạo Ticket giả, không nhét seed cá nhân vào bootstrap; fixture test không chứng minh Agent. SRS ngoài phạm vi workflow xử lý→hoàn tất→phản hồi, vì vậy không bổ sung close/resolve API.

## API và routes của chức năng

Bảng truy vết Axx được chuyển từ tài liệu tổng hợp; E/P giữ theo runtime, DTO/quyền/luồng/test chi tiết do các phase của chức năng sở hữu. Không thêm endpoint từ việc gom tài liệu.

| ID | Method/path | Phạm vi |
| --- | --- | --- |
| A21 P | GET /staff/tickets | List/filter/search/scope độc lập, [TK01/TK02](tickets/02-staff-read-api.md), P; scope/version/legacy review TK01 |
| A22 P | GET /staff/tickets/:ticketId | [TK02](tickets/02-staff-read-api.md): nội dung legacy/confirmed phân biệt, quyền Ticket/link chat riêng |
| A23 P | POST /staff/tickets/:ticketId/accept | [TK03](tickets/03-accept-command.md): version/atomic/reconcile; không cấp grant transcript hoặc thay A11 |

| Route | Trạng thái |
| --- | --- |
| /staff/tickets | **Khung**, TK02/TK04 chưa nối |
| /staff/tickets/:ticketId | **Khung**, TK02/TK03/TK04 chưa nối |

## Phần còn lại theo chức năng

| ID | Phần còn lại | Phase sở hữu |
| --- | --- | --- |
| G04 | Inbox I01–I06 E; Staff Tickets A21–23/UI chưa có | [TK01–05](07-tickets-contract.md) làm trước Agent với scope/legacy/version; I07 tạo Ticket riêng |
