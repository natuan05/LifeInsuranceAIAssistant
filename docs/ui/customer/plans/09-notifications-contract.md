# C09 — Customer notification center: chốt phạm vi riêng

Cập nhật **08/11/2026** · **Đã chốt triển khai center và message read status** · C09 · [Chung](00-customer-contract.md).

## Truy vết data model và vị trí code theo phase

Mỗi phase dưới đây có bảng cột/đọc–ghi/FK/version, migration, transaction và mức ảnh hưởng chi tiết; xem mục **Data model và phạm vi ảnh hưởng** và bảng **Vị trí code** trong phase. Hiện có file không đồng nghĩa mọi thay đổi dự kiến trong file đã được triển khai. Các phần P giữ P.

| Phase sở hữu | Bảng/dữ liệu chính và thao tác | Code cần rà từ root repo | Mức ảnh hưởng khi sửa |
| --- | --- | --- | --- |
| [N01 — Chốt Customer notification scope và recipient](notifications/01-scope-recipient-contract.md) | Customer notification recipient — P, chưa có schema (DDL dự kiến, không reuse recipient_staff_id); outbox_events (Thêm trong transaction nguồn; worker cập nhật trạng thái/lease) | [apps/core/prisma/schema.prisma](<../../../../apps/core/prisma/schema.prisma>); [apps/core/src/notifications/notifications.service.ts](<../../../../apps/core/src/notifications/notifications.service.ts>) | Cao — Migrations/index/check và Staff data |
| [N02 — Notification center tối thiểu, chỉ sau quyết định N01](notifications/02-conditional-center.md) | Customer notification recipient — P, chưa có schema (DDL dự kiến, không reuse recipient_staff_id); outbox_events (Thêm trong transaction nguồn; worker cập nhật trạng thái/lease) | [apps/core/prisma/schema.prisma](<../../../../apps/core/prisma/schema.prisma>); [apps/core/src/notifications/notifications.service.ts](<../../../../apps/core/src/notifications/notifications.service.ts>) | Cao — Migrations/index/check và Staff data |

Không tự áp dụng DDL khi triển khai UI, không biến model dự kiến thành hiện trạng, không reset seed/volume để né lỗi FK. Các dependency xuyên vai trò và operator xem [Data Model](../../../specifications/Data_Model.md#iii-bản-đồ-tác-động-khi-triển-khai-chức-năng).

## 1. Căn cứ và quyết định đã chốt (08/11/2026)

Theo quyết định ngày 08/11/2026, hệ thống **giữ cả hai cơ chế**:
1. **Thông báo trực tiếp trong chat**: Giữ nguyên tin nhắn realtime/SYSTEM I06 hiển thị ngay trong luồng hội thoại khi Staff tiếp nhận.
2. **Hộp thông báo bền vững (Quả chuông Notification Center)**: Lưu trữ trên Database và hiển thị trên popover quả chuông thanh toolbar của Customer Portal.

### Các quy tắc cốt lõi đã chốt:
- **Bộ 3 event tối thiểu phát sinh thông báo**:
  1. *Staff đã tiếp nhận hội thoại* (Staff accepted chat handoff).
  2. *Support Ticket đã được tạo thành công* (Ticket created).
  3. *Nhân viên đã gửi tin nhắn hỗ trợ mà khách hàng chưa đọc* (Staff sent message, Customer unread).
- **Người nhận (Recipient)**: Xác định chính xác theo `customerId` của khách hàng sở hữu sự kiện; tuyệt đối không để lộ hoặc phát chéo cho khách hàng khác.
- **Thời hạn lưu trữ (Retention)**: Lưu trữ trong **30 ngày**, hệ thống tự động dọn dẹp/xóa các bản ghi thông báo quá hạn khỏi database để tránh phình rác dữ liệu.
- **Nguyên tắc nội dung Generic (chống lộ bí mật / PII)**:
  - **Đúng (Generic được phép)**: Hiển thị thông tin chung chung, mã tham chiếu an toàn:
    - *"Phiếu hỗ trợ #TK-001 của bạn đã được tạo"*
    - *"Nhân viên đã tiếp nhận yêu cầu chat"*
    - *"Bạn có tin nhắn mới từ nhân viên hỗ trợ"*
  - **Sai (Nghiêm cấm)**: Tuyệt đối không bê nguyên văn nội dung tin nhắn chat riêng tư, số tiền bồi thường bảo hiểm, thông tin bệnh án, số CCCD/CMND vào thông báo.
- **Trạng thái đã xem tin nhắn (Message Read Status)**:
  - Bổ sung trường ghi nhận trạng thái đã đọc vào database bảng tin nhắn (`messages.read_at` / `is_read`) để đối phương (Staff/Customer) biết tin mình nhắn đã được xem (read receipts).
  - Đối với các tin nhắn chưa xem từ Staff, hệ thống hiển thị thông báo generic lên Quả chuông.

| Phase | Kết quả | Gate |
| --- | --- | --- |
| [N01](notifications/01-scope-recipient-contract.md) | Chốt phạm vi event, recipient customerId, retention 30 ngày, nội dung generic và message read status | Đã duyệt 08/11/2026 |
| [N02](notifications/02-conditional-center.md) | Đặc tả Core schema migration, API GET/POST read, producer outbox và đồng bộ UI | Sẵn sàng triển khai khi có yêu cầu code |

## 2. Phạm vi và triển khai UX

Đã triển khai thành phần Toolbar Notification Center popover trong `apps/web/src/components/customer-workspace.tsx`:
- Nút chuông thông báo trên thanh toolbar với badge đếm số lượng chưa đọc.
- Popover có các mục hiển thị trong phiên client. Mục mẫu về lịch phí/Claim không là dữ liệu nghiệp vụ đã được Core xác minh hoặc bằng chứng đã triển khai workflow đó.
- Nút "Mark all as read" và đánh dấu đã đọc trực tiếp trên từng mục.
- Toàn bộ giao diện popover thông báo sử dụng 100% tiếng Anh.

Không đưa read receipts/typing/unread counts vào Inbox Staff; không email/push provider hoặc SLA chưa đo. Model notification backend phía Core hiện dành cho Staff; notification popover phía Customer hiện quản trị trạng thái trong phiên client.

- [x] Toolbar Notification Center popover phía Customer đã triển khai trong shell H01 (quản lý trạng thái client).
- [x] N01/N02: Triển khai schema/migration lưu trữ persistent trên Core, API đọc/đánh dấu đọc, và worker tự động dọn rác 30 ngày theo quyết định 08/11/2026.
- [x] Schema/migration bổ sung trường trạng thái đã đọc (`read_at`) vào bảng `messages` phục vụ read receipt và kích hoạt thông báo tin nhắn chưa đọc.
- [x] Tích hợp WebSocket Realtime invalidation (`notifications-invalidated` -> `core:notifications-changed`) để cập nhật chuông thông báo trực tiếp mà không cần reload trang.
- [x] Tích hợp WebSocket Realtime invalidation (`chat-invalidated` -> `core:chat-changed`) hai chiều cho trạng thái đã xem tin nhắn (`read_at`) giữa Staff và Customer.

## Sự kiện đích đã chốt (Events)

1. **Staff Accept chat thành công**: Thông báo generic *"Nhân viên đã tiếp nhận yêu cầu chat"*, link tới cuộc trò chuyện; trong chat vẫn đồng thời hiển thị tin nhắn SYSTEM.
2. **Support Ticket được tạo thành công**: Thông báo generic *"Phiếu hỗ trợ #[ticketCode] của bạn đã được tạo"*, link tới chi tiết Ticket.
3. **Nhân viên gửi tin nhắn hỗ trợ mà khách hàng chưa đọc**: Khi Staff gửi tin nhắn mới và khách hàng chưa mở cuộc hội thoại, phát sinh thông báo generic *"Bạn có tin nhắn mới từ nhân viên hỗ trợ"*. Áp dụng quy tắc gộp: dù Staff gửi bao nhiêu tin nhắn chưa đọc thì trên Quả chuông của khách hàng cũng **chỉ hiển thị 1 thông báo duy nhất** và cập nhật lại thời gian mới nhất; chỉ gửi thông báo mới khi khách hàng đã đọc toàn bộ tin nhắn trước đó và Staff gửi thêm tin mới.
4. **Khách hàng gửi tin nhắn mà nhân viên chưa đọc (CUSTOMER_MESSAGE_UNREAD)**: Tương tự đối xứng phía Staff, khi Customer gửi tin nhắn mà Staff chưa mở cuộc hội thoại, Staff nhận thông báo generic *"Bạn có tin nhắn mới từ khách hàng"*. Dù khách gửi bao nhiêu tin chưa đọc thì chỉ có 1 thông báo chưa đọc cho cuộc trò chuyện đó và cập nhật lại thời gian; chỉ tạo thông báo mới khi Staff đã đọc các tin trước và khách gửi tin mới.

Mở/đánh dấu notification không tự Accept chat/Ticket hoặc mở rộng quyền. Payload tối thiểu, tránh transcript riêng; link tới cuộc/Ticket vẫn được Core kiểm gate/ownership.

## Checklist

- [x] Chốt quyết định phạm vi (giữ cả 2: trong chat + quả chuông; 3 event tối thiểu; retention 30 ngày; nội dung generic chống lộ PII; message read status).
- [x] Spec DDL schema migration (`Notification.recipient_customer_id` hoặc bảng `customer_notifications`, `Message.read_at`).
- [x] Triển khai API Core: `GET /customers/me/notifications` và `POST /customers/me/notifications/:id/read`.
- [x] Triển khai Outbox producer & Cron dọn dẹp thông báo cũ hơn 30 ngày.
- [x] Triển khai Realtime WebSocket sync cho Quả chuông Notification Center phía Customer.
- [x] Kết nối Web UI popover với REST API backend thay cho dữ liệu mẫu.
- [x] Quy tắc gộp thông báo tin nhắn chưa đọc (Single Active Notification) và cập nhật thời gian cho cả Staff & Customer.
