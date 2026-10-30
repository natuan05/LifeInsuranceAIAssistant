# Menu ứng dụng bảo hiểm nhân thọ — MVP v1

Đối chiếu code: **30/10/2026**. Đọc [thứ tự tài liệu](README.md) và [checklist tiến độ/gap](implementation-status.md) trước khi triển khai.

Phạm vi MVP dự kiến cho phép Customer xem sản phẩm, hợp đồng, quyền lợi, kỳ phí, tài liệu và sử dụng trợ lý hỗ trợ. Staff tra cứu khách được phân công, tiếp nhận yêu cầu và trao đổi với Customer.

UI đơn giản: menu, danh sách, trang chi tiết và khung chat. Trên điện thoại, menu thu gọn và nội dung xếp thành một cột.

Mỗi màn hình bên dưới liên kết tới một file khung trong `customer/` hoặc `staff/`, gồm: mục đích, thành phần hiển thị, chức năng/thao tác, trạng thái và checklist.

**Tiến độ:** Auth/account/profile local đã nối API; Staff Customers có list/detail/pagination, còn thiếu search. Inbox/Policy Lookup/Ticket có route và khung UI; Copilot và thông báo chưa có nghiệp vụ. Menu dưới là phạm vi đích, chưa phải toàn bộ menu đang chạy. App Web hiển thị tiếng Anh; tài liệu diễn giải tiếng Việt.

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

Đăng nhập trước khi vào ứng dụng. MVP sử dụng tài khoản được cấp theo cách vận hành local hiện tại. Chuông thông báo dự kiến đặt trên header; chưa có UI/API notification Customer.

### Các màn hình

| Mã | Màn hình | Chức năng và ý nghĩa | UI ở mức MVP |
| --- | --- | --- | --- |
| C01 | [Đăng nhập](customer/login.md) | Truy cập tài khoản Customer bằng email và mật khẩu. | Form đăng nhập, hiện/ẩn mật khẩu, thông báo lỗi. Tái sử dụng trang hiện có. |
| C02 | [Trang chủ](customer/home.md) | Xem nhanh hợp đồng, kỳ phí sắp tới nếu có dữ liệu và Staff phụ trách. Có lối tắt đến các chức năng chính. | Vài thẻ thông tin và nút Xem hợp đồng, Hỏi trợ lý. |
| C03 | [Sản phẩm](customer/products.md) | Xem danh sách, mô tả, quyền lợi chung và tài liệu giới thiệu sản phẩm. Giúp khách tìm hiểu mà không cần chat. | Danh sách đơn giản; bấm vào xem chi tiết và PDF. |
| C04 | [Hợp đồng của tôi](customer/contracts.md) | Xem số hợp đồng, sản phẩm, trạng thái, thời hạn, quyền lợi, phí mỗi kỳ và ngày đến hạn từ dữ liệu Core. | Danh sách hợp đồng → trang chi tiết chia thành các mục; có nút Xem tài liệu và Hỏi về hợp đồng này. |
| C05 | [Xem tài liệu](customer/documents.md) | Đọc/tải hợp đồng và điều khoản được cấp quyền, đúng phiên bản áp dụng. | Danh sách tài liệu trong chi tiết hợp đồng; mở PDF bằng trình xem có sẵn. |
| C06 | [Trợ lý và lịch sử chat](customer/chat.md) | Hỏi AI, xem nguồn/lịch sử; tạo Ticket từ tóm tắt AI hoặc yêu cầu Staff tiếp quản cuộc chat sau khi xác nhận. | Khung chat có nút Tạo yêu cầu hỗ trợ và Yêu cầu Staff; hiển thị AI đang hỗ trợ/Chờ Staff/Staff đang hỗ trợ. |
| C07 | [Yêu cầu hỗ trợ](customer/tickets.md) | Tự điền Ticket hoặc xem lại bản AI tóm tắt rồi xác nhận gửi; theo dõi yêu cầu đã lưu. | Danh sách, nút Tạo yêu cầu mới, form đơn giản và chi tiết Ticket. |
| C08 | [Hồ sơ và tài khoản](customer/profile.md) | Xem thông tin cá nhân, Staff phụ trách, đổi mật khẩu và đăng xuất. | Trang thông tin và form đổi mật khẩu; tái sử dụng chức năng hiện có. |
| C09 | [Thông báo](customer/notifications.md) | Biết Ticket đã được ghi nhận, Staff đã tiếp nhận hoặc có tin nhắn Staff chưa đọc. | Chuông có số chưa đọc, danh sách thông báo và liên kết mở Ticket/cuộc chat. |

### Checklist triển khai

- [x] **C01 local:** Đăng nhập/phiên/điều hướng đúng role hiện có; menu MVP Customer vẫn chưa dựng.
- [ ] **C02:** Làm trang chủ với dữ liệu từ Core; có trạng thái chưa có hợp đồng/chưa có Staff.
- [ ] **C03:** Làm danh sách, chi tiết sản phẩm và liên kết tài liệu giới thiệu.
- [ ] **C04:** Làm danh sách/chi tiết hợp đồng, quyền lợi và thông tin kỳ phí theo quyền.
- [ ] **C05:** Mở/tải PDF đúng hợp đồng và phiên bản; xử lý tệp lỗi hoặc quyền xem hết hạn.
- [ ] **C06:** Làm chat, lịch sử, nút tạo Ticket bằng tóm tắt AI và nút yêu cầu Staff tiếp quản.
- [ ] **C07:** Làm form tạo Ticket thủ công, xem trước/xác nhận, danh sách và chi tiết; không phụ thuộc AI để gửi form.
- [x] **C08 local:** Hồ sơ/Staff phụ trách, account/password/logout hoạt động.
- [ ] **C08 UI:** Ghép vào menu/style Customer MVP mới; chưa có sửa hồ sơ.
- [ ] **C09:** Làm chuông, thông báo cho Customer, đọc/chưa đọc và mở đúng Ticket/cuộc chat.

### Luồng hỗ trợ trong MVP

- **Từ chat:** Tạo yêu cầu hỗ trợ → AI tóm tắt → Customer xem/sửa → xác nhận gửi → hiện mã Ticket sau khi Core lưu.
- **Muốn nói chuyện với Staff:** Yêu cầu Staff → xem/xác nhận Ticket gắn với cuộc chat → chờ Staff → Staff tiếp nhận → chat trực tiếp trong cùng cuộc trò chuyện. Nếu đã có yêu cầu đang chờ cho lần chuyển giao này thì mở lại yêu cầu đó.
- **Tạo bằng tay:** Yêu cầu hỗ trợ → Tạo yêu cầu mới → điền tiêu đề, nội dung, hợp đồng liên quan nếu có → xem lại/xác nhận → gửi. Không bắt buộc có cuộc chat hay AI tóm tắt.
- Tạo Ticket chỉ ghi nhận yêu cầu; chỉ hiện Staff đang hỗ trợ sau khi tiếp quản thành công. Chưa có Staff phụ trách hoặc Staff không khả dụng thì thông báo rõ.

Tạo Ticket thủ công và thông báo Customer là phần bổ sung cho kế hoạch MVP trong trao đổi này; chưa có implementation. Notification hiện tại chỉ có người nhận Staff, cần bổ sung quyền/người nhận Customer trước khi triển khai.

## B. Staff

Đối chiếu chi tiết ngày **30/10/2026** theo giao diện Staff mẫu và đặc tả nguồn: [Chỉ mục màn hình Staff](staff/README.md) · [Bản đồ API hiện có/đề xuất](staff/api-map.md) · [Chức năng thiếu và điểm cần chốt](staff/gap-review.md).

Staff đã chuyển bố cục HTML/CSS mẫu sang React/Tailwind fullscreen, có [routes list/detail](staff/routes.md), rail và menu tài khoản. Các chức năng có API hiện có được đánh dấu bên dưới; A07–28 vẫn đề xuất. Customer management tách khỏi Inbox; cột trái chat là danh sách hội thoại. Bản preview và fixture nghiệp vụ đã bỏ.

### Menu

```text
Tổng quan
Khách hàng được phân công
  └── Hồ sơ / Hợp đồng / Tài liệu / Lịch sử trao đổi
Hội thoại
  └── Chat với Customer + Copilot bên cạnh
Ticket hỗ trợ
Tài khoản
```

Chuông thông báo là phần chưa triển khai. Panel Copilot đã có khung trong Inbox, chưa có API/Agent; không nằm trong trang Customers.

### Các màn hình

| Mã | Màn hình | Chức năng và ý nghĩa | UI ở mức MVP |
| --- | --- | --- | --- |
| S01 | [Đăng nhập và tài khoản](staff/account.md) | Đăng nhập Staff, xem thông tin tài khoản, đổi mật khẩu và đăng xuất. | Tái sử dụng các trang hiện có; bổ sung menu Staff. |
| S02 | [Tổng quan](staff/home.md) | Xem nhanh Ticket và hội thoại cần tiếp nhận trong phạm vi phân công. | Hai danh sách ngắn, bấm để mở công việc. |
| S03 | [Khách hàng](staff/customers.md) | Xem danh sách, tìm khách được phân công và mở hồ sơ để nắm thông tin. | Bảng có phân trang/tìm kiếm; trang hoặc vùng chi tiết hồ sơ. |
| S04 | [Hợp đồng và tài liệu của khách](staff/contracts.md) | Tra cứu hợp đồng, quyền lợi, kỳ phí và PDF để hỗ trợ Customer bằng thông tin có nguồn. | Các mục trong hồ sơ khách; danh sách → chi tiết; mở PDF như phía Customer. |
| S05 | [Hội thoại và Copilot](staff/conversations.md) | Tiếp nhận yêu cầu chuyển giao hoặc chủ động tiếp quản theo quyền; chat trực tiếp, dùng Copilot tóm tắt/tìm nguồn. | Chat và Copilot bên cạnh; nút Tiếp nhận/Tiếp quản và Tóm tắt hội thoại. |
| S06 | [Ticket hỗ trợ](staff/tickets.md) | Xem Ticket do khách tự nhập hoặc xác nhận từ AI; tiếp nhận theo quyền, mở chat nếu được liên kết. | Bảng → chi tiết; phân biệt nội dung khách xác nhận với tóm tắt AI. |
| S07 | [Thông báo](staff/notifications.md) | Biết có Ticket mới, yêu cầu chuyển giao hoặc tin Customer chưa đọc thuộc phạm vi hỗ trợ. | Chuông có số chưa đọc, danh sách và liên kết mở công việc. |

### Checklist triển khai

- [x] **S01:** Login/account/password/logout đã nối API; popover chỉ Personal information và Sign out, trang account cùng style Staff.
- [ ] **S02:** Làm danh sách việc cần tiếp nhận, chỉ lấy trong phạm vi được phép.
- [x] **S03 cơ bản:** List/detail/profile theo assignment, phân trang URL 10/trang và bố cục ưu tiên policy.
- [ ] **S03 còn thiếu:** Search toàn tập, retry lỗi list và policy thật.
- [ ] **S04:** Bổ sung hợp đồng, quyền lợi, kỳ phí và tài liệu vào hồ sơ khách.
- [ ] **S05:** Làm nút tiếp nhận/tiếp quản, chat trực tiếp, lịch sử và nút tóm tắt qua Copilot đúng ngữ cảnh Customer.
- [ ] **S06:** Làm danh sách/chi tiết Ticket và tiếp nhận hội thoại; MVP dừng ở xem, theo dõi, tiếp nhận.
- [ ] **S07:** Làm chuông, thông báo Ticket/chuyển giao/tin chưa đọc, chống trùng và mở đúng công việc.

## Các phần dùng chung

- [x] Auth/profile/Customers đã có loading/rỗng/lỗi; session/realtime local đã ghép.
- [ ] Hoàn thiện retry list Customers và trạng thái nghiệp vụ cho các module chưa nối API.
- [x] Core API đã có kiểm phiên/role/ownership hoặc assignment cho dữ liệu hồ sơ.
- [ ] Mở rộng quyền tương ứng policy/document/chat/Ticket/tools; Agent phải gọi Business API, không truy cập business DB.
- [ ] Tài liệu và câu trả lời AI dùng đúng quyền/phiên bản, có nguồn; thiếu căn cứ thì thông báo và đề nghị Staff hỗ trợ.
- [ ] Hội thoại và trạng thái Agent được lưu bền vững; checkpoint tách khỏi ghi nghiệp vụ.
- [ ] Ticket cần xác nhận hợp lệ; Core chống trùng, lưu Ticket cùng outbox và chỉ báo thành công sau khi lưu. Lỗi thông báo không làm mất Ticket.
- [ ] Staff tiếp quản thì Core chặn thao tác ghi từ Agent đang chạy.
- [x] Dữ liệu dev/UI hiện tại chỉ synthetic; không dựng Ticket/Claim thành công từ fixture.
- [ ] Giữ quy tắc synthetic/quyền/log tối thiểu trong các module triển khai tiếp.

## Thứ tự triển khai

1. **App tra cứu cơ bản:** Menu, trang chủ, sản phẩm, hợp đồng, quyền lợi, kỳ phí và PDF; tái sử dụng tài khoản/hồ sơ.
2. **Trợ lý:** Chat Customer, nguồn trích dẫn, lịch sử và Copilot cho Staff.
3. **Chuyển giao hỗ trợ:** Ticket từ AI hoặc form thủ công, xác nhận gửi, Staff tiếp nhận/tiếp quản và chuông thông báo cho cả hai bên.

Tham chiếu: [SRS](../specifications/Requirement.md), [kiến trúc](../architecture.md), [các điểm cần chốt](../source-review.md). Chi tiết kỹ thuật giữ trong các tài liệu này.
