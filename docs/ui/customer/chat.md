# C06 — Trợ lý và lịch sử chat

[Quay lại menu](../menu.md) · [Tiến độ và gap](../implementation-status.md)

> Phạm vi UI cho MVP; chưa phải chức năng đã triển khai.

Đối chiếu 30/10/2026: chưa có UI/API nghiệp vụ tương ứng. WebSocket hiện có chỉ invalidation account/profile/assignment; không hoàn thành chat, Ticket hoặc notification. Các bước dưới là phạm vi dự kiến.

## 1. Mục đích

Hỏi AI về sản phẩm/hợp đồng, xem nguồn, xem lại trao đổi và chat với Staff khi được tiếp nhận.

## 2. Thành phần hiển thị

- Danh sách hội thoại, khung tin nhắn, ô nhập và nút Gửi.
- Nhãn người gửi AI/Staff, nguồn trích dẫn và hợp đồng đang hỏi nếu có.
- Hai nút: **Tạo yêu cầu hỗ trợ** và **Yêu cầu Staff**.
- Bản xem trước Ticket gồm tiêu đề, nội dung tóm tắt, hợp đồng liên quan; cho sửa, xác nhận gửi hoặc quay lại.
- Chuông thông báo trên header; xem [Thông báo](notifications.md).

## 3. Chức năng và thao tác

| Thao tác | Kết quả |
| --- | --- |
| Gửi tin nhắn | AI trả lời có nguồn hoặc Staff trả lời khi đã tiếp quản. |
| Tạo yêu cầu hỗ trợ | Agent tóm tắt phần chat liên quan thành bản nháp; Customer xem/sửa và xác nhận trước khi Core tạo Ticket. |
| Yêu cầu Staff | Chuẩn bị cùng bản nháp để xác nhận, liên kết cuộc chat và gửi yêu cầu tiếp quản sau khi lưu. Ticket đã chờ cho lần chuyển giao này thì mở lại, không tạo thêm. |
| Xác nhận gửi | Chỉ hiện mã Ticket sau khi Core lưu; tạo Ticket không đồng nghĩa Staff đã nhận chat. |
| Quay lại bản nháp | Chưa gửi Ticket, tiếp tục chat hoặc sửa nội dung. |
| Mở lịch sử/nguồn | Xem lại hội thoại hoặc mở đúng tài liệu được cấp quyền. |

Nếu AI tóm tắt lỗi, Customer có thể tự điền nội dung để tiếp tục xác nhận gửi. Luồng tạo bằng tay xem tại [Yêu cầu hỗ trợ](tickets.md). Khi nội dung bản nháp thay đổi, phải xác nhận lại nội dung mới.

## 4. Trạng thái

- **AI đang hỗ trợ:** Gửi câu hỏi và sử dụng hai nút hỗ trợ.
- **Chờ Staff:** Hiện mã yêu cầu và trạng thái chờ, không báo Staff đang chat.
- **Staff đang hỗ trợ:** Hiện tên Staff; AI dừng trả lời Customer và Core chặn Agent ghi nghiệp vụ. Copilot nội bộ vẫn dùng theo quyền.
- **Chưa có Staff/Staff không khả dụng:** Nêu rõ chưa thể tiếp quản; Ticket đã lưu vẫn xem được.
- **AI lỗi/mất kết nối/gửi chưa rõ kết quả:** Giữ nội dung để thử lại, tra cứu yêu cầu cũ trước khi tạo lại.

Quy tắc AI có tiếp tục trả lời trong lúc chờ Staff cần chốt trước khi triển khai; UI luôn thể hiện đúng người đang hỗ trợ.

## 5. Checklist

- [ ] Có hai nút hỗ trợ, tóm tắt AI và bản xem trước sửa được.
- [ ] Xác nhận hợp lệ, chống trùng và báo mã Ticket sau khi lưu.
- [ ] Tiếp quản trong cùng hội thoại, hiển thị đúng người đang hỗ trợ.
- [ ] Tóm tắt lỗi vẫn cho tự nhập; xử lý mất mạng và Staff không khả dụng.

## 6. Chuyển từ Agent sang Staff — yêu cầu 31/10/2026

Đây là yêu cầu đã xác nhận bổ sung, chưa có UI/API triển khai. Hai điểm bắt đầu dùng chung một luồng tiếp nhận:

| Điểm bắt đầu | Customer thao tác | Kết quả trước khi xác nhận gửi |
| --- | --- | --- |
| Customer chủ động cần người hỗ trợ | Chọn Yêu cầu Staff bất cứ khi nào cần trong cuộc đang được Agent hỗ trợ | Chuẩn bị bản xem lại yêu cầu; không bắt buộc Agent đề xuất trước |
| Agent chưa giải quyết được hoặc vượt phạm vi | Agent gợi ý Staff hỗ trợ, khách chọn đồng ý hoặc tiếp tục với Agent | Đồng ý mở bản xem lại nội dung; từ chối không tạo Ticket, outbox hoặc notification |

Luồng chung:

1. Hiển thị nội dung sẽ gửi cho Staff, hội thoại và hợp đồng liên quan nếu có; Customer được sửa và xác nhận. Nếu màn hình gợi ý đã hiển thị đầy đủ nội dung đó thì một thao tác Đồng ý và gửi có thể là xác nhận cuối; không bắt khách xác nhận lặp lại cùng nội dung. Cách xác nhận cụ thể cần được contract Core hỗ trợ.
2. Core lấy Customer từ phiên, kiểm ownership, xác nhận gắn đúng nội dung/hội thoại và chống trùng. Đồng ý do LLM suy đoán từ lịch sử không thay xác nhận có thể kiểm chứng; nội dung đã sửa cần xác nhận lại.
3. Agent gọi tool/Business API của Core sau khi có xác nhận; Customer chủ động vẫn có đường gửi yêu cầu bằng tay nếu Agent lỗi. Core lưu Ticket và outbox thông báo cùng giao dịch bền vững. Việc ghi trạng thái PENDING_HANDOFF phải nhất quán với Ticket và phiên bản hội thoại; chi tiết transaction/version cần chốt trước code.
4. Chỉ sau commit, Customer thấy mã Ticket và Chờ Staff. Core chọn recipient theo quyền/phân công hiện hành và phát thông báo bất đồng bộ; Agent không truy cập DB, không tự chọn Staff từ prompt và không trực tiếp phát thông báo.
5. Staff đọc thông báo/Requests, xem ngữ cảnh rồi tiếp nhận. Sau khi Core xác nhận tiếp nhận, cuộc chuyển STAFF_ACTIVE, hiển thị Staff đang hỗ trợ; hai bên tiếp tục trong cùng conversationId và xem được lịch sử trước chuyển giao theo quyền.
6. Staff trả lời trực tiếp bằng quyền gửi tin được Core xác minh. Agent không tiếp tục phát câu trả lời cho Customer sau khi Staff đã tiếp quản; cần chặn cả kết quả Agent đang chạy dở và thao tác ghi nghiệp vụ. Copilot nội bộ của Staff vẫn là luồng riêng.

Nếu đã có yêu cầu chờ cho cùng lần chuyển giao, mở lại trạng thái/Ticket hiện hữu; double-click, retry hoặc cả hai điểm bắt đầu cùng lúc không tạo thêm Ticket/thông báo. Timeout phải tra trạng thái bằng khóa gửi cũ trước khi retry. Không tự coi mọi Ticket của Customer là cùng một yêu cầu.

Nếu Staff offline, chưa có phân công hoặc không khả dụng, không hứa đã có người nhận. Yêu cầu đã lưu vẫn được theo dõi; chính sách recipient dự phòng/định tuyến lại, thời gian chờ và Agent có tiếp tục trả lời trong lúc PENDING_HANDOFF vẫn cần chốt. Lỗi phát notification không xóa Ticket hoặc báo ngược rằng lưu yêu cầu đã thất bại.

### Checklist nghiệm thu chuyển sang Staff

- [ ] Customer chủ động yêu cầu và Agent gợi ý đều đi tới cùng luồng xem lại/xác nhận gửi.
- [ ] Khách từ chối/chưa xác nhận: không có Ticket, handoff hoặc notification mới.
- [ ] Ticket/outbox chỉ ghi khi Core xác minh xác nhận hợp lệ; mã Ticket chỉ hiện sau commit.
- [ ] Hai điểm bắt đầu đồng thời, double-click và timeout/retry không tạo trùng.
- [ ] Staff nhận thông báo đúng quyền, tiếp nhận rồi trả lời trong cùng cuộc; mở notification không tự tiếp nhận.
- [ ] Khi STAFF_ACTIVE, Agent đang chạy dở không gửi thêm câu trả lời hoặc ghi nghiệp vụ; Staff/Copilot vẫn kiểm scope.
- [ ] Staff không khả dụng, thay phân công, mất mạng và delivery lỗi đều có trạng thái khôi phục; không rò transcript giữa khách.

