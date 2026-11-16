# Menu ứng dụng bảo hiểm nhân thọ — MVP v1

Đối chiếu code: **04/11/2026**. Đọc [thứ tự tài liệu](README.md) và [checklist tiến độ/gap](implementation-status.md) trước khi triển khai.

Phạm vi MVP dự kiến cho phép Customer xem sản phẩm, hợp đồng, quyền lợi, kỳ phí, tài liệu và sử dụng trợ lý hỗ trợ. Staff tra cứu khách được phân công, tiếp nhận yêu cầu và trao đổi với Customer.

UI đơn giản: menu, danh sách, trang chi tiết và khung chat. Trên điện thoại, menu thu gọn và nội dung xếp thành một cột.

Mỗi màn hình bên dưới liên kết tới một file khung trong `customer/` hoặc `staff/`, gồm: mục đích, thành phần hiển thị, chức năng/thao tác, trạng thái và checklist.

**Tiến độ theo application main 05/11:** Staff Auth/Customers/Products/Policies/Inbox I01–I06 và Ticket TK01–TK05 đã có; Customer Home/Products/Policies/PDF và chat shell đã có. Agent/Copilot và producer Ticket I07 còn phần triển khai/nghiệm thu riêng theo Agent Design + plan. Menu dưới là phạm vi chức năng; không suy toàn MVP hoàn tất từ UI. App Web dùng tiếng Anh.

## A. Customer

### Menu

```text
Trang chủ
Sản phẩm
Hợp đồng của tôi
  └── Chi tiết / Quyền lợi / Kỳ phí / Tài liệu
Trợ lý
  └── Chat / Lịch sử hội thoại
Yêu cầu hỗ trợ
Hồ sơ và tài khoản
```

Đăng nhập bằng tài khoản được cấp sẵn trước khi vào ứng dụng; Customer không tự đăng ký trong MVP theo FR-001 và quyết định 07/11/2026. Customer có chat/SYSTEM và Notification Center lưu DB theo phương án A; schema/API/UI đã có source, các lỗi review và kiểm chứng theo N01/N02.

### Các màn hình

| Mã | Màn hình | Chức năng và ý nghĩa | UI ở mức MVP |
| --- | --- | --- | --- |
| C01 | [Đăng nhập](customer/plans/01-auth-contract.md) | Truy cập tài khoản Customer bằng email và mật khẩu. | Form đăng nhập, hiện/ẩn mật khẩu, thông báo lỗi. Tái sử dụng trang hiện có. |
| C02 | [Trang chủ](customer/plans/02-home-contract.md) | Xem nhanh hợp đồng, kỳ phí sắp tới nếu có dữ liệu và Staff phụ trách. Có lối tắt đến các chức năng chính. | Vài thẻ thông tin và nút Xem hợp đồng, Hỏi trợ lý. |
| C03 | [Sản phẩm](customer/plans/03-products-contract.md) | Xem danh sách, mô tả, quyền lợi chung và tài liệu giới thiệu sản phẩm. Giúp khách tìm hiểu mà không cần chat. | Danh sách đơn giản; bấm vào xem chi tiết và PDF. |
| C04 | [Hợp đồng của tôi](customer/plans/04-policies-contract.md) | Xem số hợp đồng, sản phẩm, trạng thái, thời hạn, quyền lợi, phí mỗi kỳ và ngày đến hạn từ dữ liệu Core. | Danh sách hợp đồng → trang chi tiết chia thành các mục; có nút Xem tài liệu và Hỏi về hợp đồng này. |
| C05 | [Xem tài liệu](customer/plans/05-documents-contract.md) | Đọc/tải hợp đồng và điều khoản được cấp quyền, đúng phiên bản áp dụng. | Danh sách tài liệu trong chi tiết hợp đồng; mở PDF bằng trình xem có sẵn. |
| C06 | [Trợ lý và lịch sử chat](customer/plans/06-chat-contract.md) | Hỏi AI, xem nguồn/lịch sử; tạo Ticket từ tóm tắt AI hoặc yêu cầu Staff tiếp quản cuộc chat sau khi xác nhận. | Khung chat có nút Tạo yêu cầu hỗ trợ và Yêu cầu Staff; hiển thị AI đang hỗ trợ/Chờ Staff/Staff đang hỗ trợ. |
| C07 | [Yêu cầu hỗ trợ](customer/plans/07-tickets-contract.md) | Tạo thủ công hoặc xem/sửa/xác nhận draft Agent; theo dõi Ticket đã lưu. | Form thủ công, review/edit/confirm draft và own list/detail theo I07/T01/T02; tạo mới OPEN. |
| C08 | [Hồ sơ và tài khoản](customer/plans/08-profile-contract.md) | Xem thông tin cá nhân, Staff phụ trách, đổi mật khẩu và đăng xuất. | Trang thông tin và form đổi mật khẩu; tái sử dụng chức năng hiện có. |
| C09 | [Thông báo](customer/plans/09-notifications-contract.md) | Chat/SYSTEM và Notification Center, recipient Customer, trạng thái đọc, retention 30 ngày. | N01/N02 đã được duyệt; source có API/UI, còn review DTO/event/read-cycle/cleanup và tests. |

### Checklist triển khai

- [x] **C01 local:** Đăng nhập/phiên/điều hướng đúng role hiện có; menu MVP Customer vẫn chưa dựng.
- [ ] **C02:** Làm trang chủ với dữ liệu từ Core; có trạng thái chưa có hợp đồng/chưa có Staff.
- [ ] **C03:** Làm danh sách, chi tiết sản phẩm và liên kết tài liệu giới thiệu.
- [ ] **C04:** Làm danh sách/chi tiết hợp đồng, quyền lợi và thông tin kỳ phí theo quyền.
- [ ] **C05:** Mở/tải PDF đúng hợp đồng và phiên bản; xử lý tệp lỗi hoặc quyền xem hết hạn.
- [x] **C06 nền:** I03–I06 own conversations/history/Direct/handoff/send/realtime/SYSTEM; chưa Agent trả lời thật.
- [ ] **C06 tiếp:** CH01 layout mới, CH02/CH03 Agent/citations; không làm lại chat đang chạy.
- [ ] **C07:** Hai luồng thủ công và draft Agent, chỉnh sửa/xác nhận, own list/detail theo I07/T01/T02; Ticket mới OPEN.
- [x] **C08 local:** Hồ sơ/Staff phụ trách, account/password/logout hoạt động.
- [ ] **C08 UI:** Hiển thị hồ sơ chỉ đọc trong menu/style Customer MVP theo C08/PF02.
- [ ] **C09:** Hoàn thiện center + chat, generic content, persisted read/read-all và retention 30 ngày theo N01/N02; chạy hồi quy.

### Luồng hỗ trợ trong MVP

**Chat AI mới sau Staff — đã chốt 14/11/2026.** Customer chọn New AI chat để bắt đầu cuộc mới với context riêng. Cuộc cũ nằm trong lịch sử, đọc/gửi theo allowedActions Core. Dừng nhắn không tạo Close/nút kết thúc. New AI chat/create đã có, Agent/Core end-to-end còn P trong CH02/CH03. [Quyết định chuẩn](../specifications/Agent_Design.md#new-ai-chat-after-staff).

- **Từ chat:** Agent gợi ý tạo Ticket → Customer xem/sửa revision/xác nhận → mã Ticket sau Core commit; độc lập yêu cầu Staff.
- **Muốn nói chuyện với Staff:** Yêu cầu Staff → xác nhận chia sẻ toàn bộ lịch sử cuộc AI → request chờ nhận (không Ticket) → Staff Accept → đọc toàn bộ lịch sử Customer-facing và chat tiếp trong cùng cuộc. Trước Accept chỉ metadata yêu cầu.
- **Direct Staff:** Customer gửi trong cuộc trực tiếp đúng Staff; không đổi flag của AI cũ để bypass Accept. Form Ticket thủ công thuộc chức năng Tickets riêng của Customer theo T01/T02.
- Tạo Ticket chỉ ghi nhận yêu cầu; chỉ hiện Staff đang hỗ trợ sau khi tiếp quản thành công. Chưa có Staff phụ trách hoặc Staff không khả dụng thì thông báo rõ.

Ticket thủ công và draft Agent cùng thuộc phạm vi Customer đã duyệt 13/11, tạo mới OPEN. Customer notification đã có recipient/schema/API/UI trong source; N02 theo dõi các lỗi và tiêu chí còn cần kiểm chứng.

## B. Staff

[Chỉ mục và hiện trạng Staff](staff/README.md) · [Routes](staff/plans/00-staff-contract.md#điều-hướng) · [API E/P](staff/plans/00-staff-contract.md#api-theo-chức-năng) · [Gap](staff/plans/README.md#phần-còn-lại-theo-chức-năng).

### Menu hiện tại và menu đích

Đang dùng: Products, Customers, Policy Lookup, tài khoản và Inbox All/Requests/Active cùng chat/handoff notifications. Tickets còn khung; New legacy đã bỏ/mapping. Không có dashboard metrics riêng.

Thiết kế Inbox mới theo [inbox-plan.md](staff/plans/inbox/00-inbox-spec.md): All/Requests/Active, accordion tên-mã khách và tiêu đề/thời gian cuộc, search tự động/Enter, chat cuộn; không counts/AI/Closed filter. I01–I06 đã triển khai. Pending chỉ metadata; Accept mới toàn bộ lịch sử AI đã được Customer đồng ý chia sẻ.

| Mã | Chức năng | Trạng thái |
| --- | --- | --- |
| S01 | [Tài khoản](staff/plans/01-auth-contract.md) | Login/password/logout và sửa tên/phone đã nối; menu Personal information/Sign out |
| S02 | [Inbox/hàng đợi](staff/plans/03-inbox-contract.md) | I01–I06 API/UI/read/Accept/send/realtime; không counts |
| S03 | [Customers](staff/plans/02-customers-contract.md) | Hồ sơ/search/page/retry và hợp đồng/PDF đã nối; chưa link hỗ trợ theo khách |
| S04 | [Policy Lookup/PDF](staff/plans/05-policies-contract.md) | A14/A15/A16/A18/A20 và FE đã nối; Products P01–P03 đã có riêng; quick lookup/context Agent còn P |
| S05 | [Chat/Copilot](staff/plans/08-copilot-contract.md) | Chat hai đầu/SYSTEM/realtime đã có; Copilot/Agent còn kế hoạch |
| S06 | [Tickets](staff/plans/07-tickets-contract.md) | Trang riêng còn khung; chưa list/detail/accept |
| S07 | [Notifications](staff/plans/06-notifications-contract.md) | Handoff A27/A28/UI/outbox đã có; Ticket notification cùng I07 |

Customers không nhúng transcript/composer/Ticket list. Inbox nhóm nhiều cuộc theo khách; mỗi cuộc có trạng thái riêng. Ticket độc lập, có thể không chat. Policy đang mở không tự đổi linkedPolicy hoặc tiếp nhận cuộc.

## Các phần dùng chung

- [x] Auth/role/ownership/assignment cho API hiện có; Staff policy/PDF kiểm quyền/phiên bản khi cấp access.
- [x] Account/Customers/Policies có trạng thái tải/lỗi/retry; Customer profile chỉ đọc. Có regression FE Account/Customers; không đồng nghĩa E2E tích hợp.
- [x] Web dùng Tailwind, dữ liệu synthetic; không dựng kết quả Ticket/Claim từ mock.
- [x] Handoff consent/request/Accept riêng và notification sau commit, không Ticket; chat hai chiều/realtime/fence đã có.
- [ ] Kiểm chứng hai luồng Ticket: Customer gửi form thủ công hoặc xác nhận draft đã review, Core commit OPEN + snapshot/outbox atomic; tích hợp nguồn Agent theo I07.
- [x] Retry khôi phục phiên gọi API tại chỗ, không F5; regression Session đã có.
- [x] Realtime metadata giữ iframe/src PDF cùng file/version, clear khi mất quyền; 26 regression Policies.
- [ ] E2E tích hợp/CI/benchmark và native PDF verification còn thiếu.

## Thứ tự triển khai

Đã triển khai [Staff P01/P02/P03](staff/plans/04-products-contract.md). [Customer theo phase](customer/plans/README.md) còn riêng. Account/Customers/Policy/Inbox đã nối được giữ; Agent/Ticket và center Customer có gate riêng theo [tiến độ](implementation-status.md), [gap](staff/plans/README.md#phần-còn-lại-theo-chức-năng).
