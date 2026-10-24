# Kiến trúc nền

Đối chiếu ngày 24/10/2026. Đây là ranh giới để phát triển tiếp, chưa phải thiết kế API hoặc triển khai hoàn chỉnh. Xem [nguồn và trạng thái quyết định](source-review.md).

## Phân chia trách nhiệm

| Phần | Sở hữu | Không được vượt ranh giới |
| --- | --- | --- |
| Web | Customer Portal, Staff Workspace và tương tác người dùng | Không tự cấp quyền, truy cập DB hoặc gọi Agent trực tiếp |
| Core | Danh tính ứng dụng, authorization, business, hội thoại, Ticket và quyền tài liệu | Không ủy thác quyết định quyền hoặc giao dịch cho LLM |
| Agent | Điều phối LangGraph, retrieval, gọi tool và tổng hợp bằng chứng | Không truy cập business DB; không tự mở rộng quyền |
| Retrieval trong Agent | Tìm Public/Private trong phạm vi được cấp | Không tự xác định ownership hoặc trả chunk ngoài quyền |

Frontend → Core → Agent là đường điều phối dự kiến. Agent → Business API của Core là đường truy cập nghiệp vụ. Giao thức cụ thể chưa chốt.

## Quyền và bằng chứng

- Danh tính lấy từ phiên đã xác thực. Core kiểm tra quyền ở từng API/tool call; Customer theo ownership, Staff theo phân công hiện hành.
- Core cấp phạm vi tài liệu và phiên bản. Retrieval áp dụng phạm vi trước khi trả bằng chứng, kể cả khi mở rộng ngữ cảnh hoặc thử lại.
- Thiếu quyền hoặc không xác minh được thì không truy xuất Private. Cách phân biệt lỗi quyền, scope rỗng và không đủ bằng chứng cần chuẩn hóa trong contract.
- Khi mở PDF, Core kiểm tra lại quyền và cấp quyền xem có hạn cho đúng phiên bản. Không lưu URL đã ký vào tin nhắn.
- Bằng chứng sản phẩm công khai giải thích quy tắc chung. Thông tin cá nhân phải dựa trên hợp đồng đúng phiên bản và dữ liệu Core đã xác thực.
- Thiếu căn cứ thì hỏi lại hoặc chuyển Staff. AI không phê duyệt Claim, cam kết chi trả hoặc tự tính số liệu nghiệp vụ.

## Trạng thái và thao tác ghi

- Core giữ lịch sử hội thoại và trạng thái tiếp quản. Agent giữ trạng thái graph bền vững để có thể tiếp tục sau gián đoạn.
- Quyền đọc RAG và quyền ghi checkpoint phải tách khỏi quyền business. Backend lưu checkpoint, schema, role và quy tắc lưu/xóa chưa chốt.
- Phiên Runtime không thay thế checkpoint bền vững. Cần chốt ánh xạ actor/hội thoại/thread và hành vi resume khi quyền hoặc người tiếp quản thay đổi.
- Agent chỉ đề xuất Ticket. Core phải xác minh xác nhận hợp lệ gắn với nội dung được duyệt, kiểm tra quyền và chống trùng trước khi ghi.
- Theo SRS UC-005, Ticket và outbox được ghi cùng giao dịch; chỉ báo thành công sau commit. Thông báo lỗi không làm mất Ticket đã lưu. Queue và cách phát lại còn cần thiết kế.
- Staff tiếp quản phải ngăn thao tác ghi từ Agent đang chạy dở. Cơ chế xử lý đồng thời còn mở; không dựa riêng vào việc hủy giao diện chat.

## Lưu trữ và triển khai

PostgreSQL + pgvector dùng local trước. Một instance với phân quyền logic là hướng tham chiếu; chưa tạo schema hoặc migration. PDF và index được chuẩn bị ngoài ứng dụng, dùng dữ liệu riêng giả lập.

AWS đã chọn. RDS, ECS + EC2 và AgentCore Runtime là hướng triển khai, chưa phải tài nguyên đã dựng. Redis/BullMQ đang được cân nhắc. Model, embedding và tự host chưa chốt.

Roadmap mở rộng là kịch bản thiết kế, không phải kết quả benchmark hoặc cam kết SLO. Đợt này không dựng topology production.

Nguồn kỹ thuật đã đọc: [LangGraph persistence](https://docs.langchain.com/oss/python/langgraph/persistence) phân biệt checkpoint theo thread với bộ nhớ dùng qua nhiều thread; [AgentCore sessions](https://docs.aws.amazon.com/bedrock-agentcore/latest/devguide/runtime-sessions.html) mô tả vòng đời môi trường phiên. Các nguồn này không tự quyết định backend checkpoint cho dự án.
