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

## Trạng thái riêng / checklist

- [ ] AI_ACTIVE/PENDING_HANDOFF/STAFF_ACTIVE/CLOSED rõ; trạng thái pending thao tác tách khỏi trạng thái nghiệp vụ.
- [ ] Hai Staff tranh chấp hoặc version stale: không gửi/nhận lạc quan; tải lại actor, trạng thái và quyền từ Core.
- [ ] Gửi lỗi/timeout hiển thị chưa rõ kết quả; reconcile/idempotency trước retry; không làm mất bản nháp khi còn quyền.
- [ ] Copilot lỗi vẫn đọc chat/gửi trực tiếp nếu có quyền. Đổi khách tách lịch sử AI và scope, không hiện kết quả Private cũ.
- [ ] Nguồn thiếu/lỗi/hết quyền có trạng thái riêng; không biến thành “không có quyền lợi”.

## Yêu cầu trạng thái khi triển khai đầy đủ

Đang tải, danh sách rỗng/không có kết quả, lỗi có nút thử lại. Phiên hết hạn chuyển đăng nhập; mất phân công/không còn quyền xóa dữ liệu riêng đang mở và tải lại scope. Không lấy quyền từ state client. Mọi dữ liệu mẫu phải có nhãn mô phỏng; chỉ báo thao tác thật thành công sau phản hồi Core.
