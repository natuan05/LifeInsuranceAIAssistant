# S05 — Hội thoại, tiếp quản, lịch sử và Copilot

[Chỉ mục Staff](README.md) · [Tiến độ](../implementation-status.md) · [Bản đồ API](api-map.md) · [Khoảng trống](gap-review.md)

Đối chiếu 30/10/2026. Căn cứ: FR-006/007/011/012; UC-006; NFR-001/003/005. API P và đường dẫn UI chưa có chỉ là đề xuất.


## Hiện trạng 30/10/2026 — Khung UI; A08–13/A24–26 chưa có

- [x] Inbox/detail routes và khung danh sách/chat/rail/panel theo mẫu.
- [x] Rail active đi theo Case Details/Copilot/Quick Policy Lookup, panel đóng/mở được.
- [x] Không dựng transcript giả; composer/takeover/templates disabled.
- [ ] Queue/transcript/messages/history/read marker từ Core.
- [ ] Takeover/send/idempotency/version và chặn Agent ghi khi takeover.
- [ ] Header Customer/policy context, Copilot history/summary/citations/checkpoint.

Các phần yêu cầu bên dưới mô tả đích triển khai; chỉ các dòng `[x]` là đã làm.

## Thành phần

Giữ bố cục mẫu: hàng đợi → transcript → rail → Case Details/Copilot/quick lookup. Header có Customer, conversationId, hợp đồng ngữ cảnh, trạng thái và Staff đang điều khiển; không hard-code một khách chỉ có một hội thoại. Lịch sử gần đây mở đúng cuộc, có thời gian/người gửi; CLOSED chỉ đọc.

Composer: text, Send, Enter gửi/Shift+Enter xuống dòng, trạng thái gửi. Templates chỉ điền nháp; icon đính kèm chưa có nghiệp vụ upload. Nội dung Markdown/template phải render an toàn, không thực thi HTML tùy ý từ người dùng/AI.

## Thao tác và API

| Thao tác | API / quy tắc |
| --- | --- |
| Chọn/khôi phục hội thoại | A08–10 P; tải lịch sử phân trang, phân biệt CUSTOMER/STAFF/AI_AGENT/SYSTEM |
| Tiếp nhận handoff đang chờ | A11 P; có Ticket thì kiểm liên kết và nhất quán với A23 |
| Chủ động takeover AI_ACTIVE | A11 P, FR-006; không bắt buộc tạo Ticket mới |
| Gửi tin | A12 P, chỉ khi Core xác nhận quyền điều khiển; không dùng toggle boolean local |
| Đọc transcript | A13 P, mốc tin đọc khác notification |
| Mở Copilot/khôi phục trao đổi nội bộ | A24 P, neo Customer/conversation, hợp đồng được phép |
| Hỏi AI / prompt chips | A25 P; câu trả lời, citations, lỗi/thiếu bằng chứng |
| Tóm tắt hội thoại | A26 P; hiển thị generatedAt/mốc transcript, không sửa Ticket đã xác nhận |
| Chèn gợi ý | Chỉ chèn nháp composer; Staff kiểm tra rồi gửi qua A12, không tự gửi |
| Mở nguồn | A20 P, đúng document/version/page và kiểm lại quyền |

Core chặn Agent đang chạy ghi nghiệp vụ khi Staff takeover; Copilot nội bộ có thể tiếp tục theo quyền. Kết quả summary/AI không phải quyết định Claim. Không triển khai “trả lại AI”, Dismiss, đóng chat hoặc chuyển Staff từ nút mock khi chưa chốt workflow.

## Luồng tiếp nhận và trả lời Customer yêu cầu hỗ trợ

Bổ sung yêu cầu 31/10/2026, **chưa triển khai**: yêu cầu chờ có thể do Customer chủ động chọn Yêu cầu Staff hoặc do Agent đề xuất và Customer đồng ý/xác nhận gửi. Hai nhánh dùng cùng quy tắc [Customer chat](../customer/chat.md#6-chuyển-từ-agent-sang-staff--yêu-cầu-31102026); Staff không tạo Ticket thay khách từ một gợi ý chưa được xác nhận.

1. Staff nhận thông báo/hàng đợi Requests theo scope, mở đúng conversationId và Ticket liên kết, đọc lịch sử AI–Customer và nội dung khách đã duyệt.
2. Mở xem hoặc đánh dấu notification đã đọc không tự nhận công việc. Staff chọn tiếp nhận qua A11; nếu có Ticket thì kết quả phải nhất quán với A23, không có tình trạng nhận Ticket nhưng không có quyền chat.
3. Chỉ khi Core trả trạng thái/quyền điều khiển mới, mở composer cho Staff. Tin trả lời qua A12 được lưu thành Message STAFF, Customer nhận trong chính hội thoại đó; gửi lại sau timeout không tạo tin trùng.
4. Core chặn câu trả lời Agent còn chạy dở và thao tác ghi sau khi Staff tiếp quản. Hai Staff cùng nhận hoặc assignment thay đổi phải kiểm phiên bản/quyền tại thời điểm ghi; client không tự bật quyền bằng state.

- [ ] Kiểm thử cả nguồn Customer chủ động và Agent gợi ý được khách đồng ý.
- [ ] Mở từ notification, Requests và lịch sử theo khách đều trỏ đúng cuộc, kiểm lại quyền.
- [ ] Tiếp nhận rồi Staff trả lời, Customer thấy tin và nhãn Staff; lịch sử cũ giữ nguyên.
- [ ] Khách từ chối gợi ý không tạo công việc; yêu cầu trùng không thêm Ticket/thông báo.
- [ ] Không có câu trả lời Agent muộn sau tiếp quản; race giữa nhận Ticket/takeover/gửi tin được xử lý ở Core.

## Checklist trạng thái hội thoại

- [ ] AI_ACTIVE/PENDING_HANDOFF/STAFF_ACTIVE/CLOSED rõ; trạng thái pending thao tác tách khỏi trạng thái nghiệp vụ.
- [ ] Hai Staff tranh chấp hoặc version stale: không gửi/nhận lạc quan; tải lại actor, trạng thái và quyền từ Core.
- [ ] Gửi lỗi/timeout hiển thị chưa rõ kết quả; reconcile/idempotency trước retry; không làm mất bản nháp khi còn quyền.
- [ ] Copilot lỗi vẫn đọc chat/gửi trực tiếp nếu có quyền. Đổi khách tách lịch sử AI và scope, không hiện kết quả Private cũ.
- [ ] Nguồn thiếu/lỗi/hết quyền có trạng thái riêng; không biến thành “không có quyền lợi”.

## Yêu cầu trạng thái khi triển khai đầy đủ

Đang tải, danh sách rỗng/không có kết quả, lỗi có nút thử lại. Phiên hết hạn chuyển đăng nhập; mất phân công/không còn quyền xóa dữ liệu riêng đang mở và tải lại scope. Không lấy quyền từ state client. Mọi dữ liệu mẫu phải có nhãn mô phỏng; chỉ báo thao tác thật thành công sau phản hồi Core.
