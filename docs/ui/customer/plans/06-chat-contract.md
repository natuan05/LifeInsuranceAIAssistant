# C06 — Conversations: giữ chat thật, tách nhánh Agent

04/11/2026 · **CH01–CH03 là kế hoạch mới** · C06 · [Chung](00-customer-contract.md).

## 1. Baseline và yêu cầu

FR-005/006/011, NFR-001/002/003/005/008. I03–I06 đã có own conversations/history, Direct, consent/request/Accept, gửi chống trùng, realtime catch-up và SYSTEM tiếp nhận. `apps/agent` vẫn placeholder, chưa provider/transport/checkpoint/runtime. Không làm lại REST/chat từ đầu hoặc giả AI đã phản hồi.

| Phase | Kết quả | Gate |
| --- | --- | --- |
| [CH01](chat/01-existing-chat-workspace.md) | Đưa chat vào shell Customer mới (Đã triển khai) | H01; không Agent |
| [CH02](chat/02-agent-boundary.md) | Service identity, durable turns, tools/retrieval/fence và contract Agent | Review kiến trúc/migration trước nối LLM |
| [CH03](chat/03-agent-answers-ui.md) | Hiển thị tiến trình/answer/citations/gợi ý đã được Core cho phép | CH02+Agent thật, D01/D02 nếu mở policy PDF |

## 2. Quyết định phải giữ

ConversationStatus chỉ AI_ACTIVE/PENDING_HANDOFF/STAFF_ACTIVE, không CLOSED. Customer có nhiều cuộc theo chủ đề/tên/thời gian, không unread/counts giả. Staff không xem AI riêng; request pending chỉ metadata Customer chia sẻ; sau consent toàn bộ lịch sử + Staff Accept mới toàn bộ Customer-visible trong chính cuộc. Direct có provenance riêng, không đổi flag của cuộc AI cũ. Ticket là nhánh I07, không hậu quả tự động của handoff hoặc SYSTEM.

CH02 là phase phân tích kỹ thuật/contract và triển khai nền sau khi quyết định được ghi lại; không tự chọn AgentCore/provider/HTTPframework/checkpoint từ đề xuất ADR. Cần test Core với adapter giả trong harness rồi Agent thật; không lấy mock answer làm FR-005 đã đạt.

- [x] CH01 giữ quyền/nháp/reconcile/realtime I03–I06, giao diện 100% tiếng Anh, tối ưu header và composer.
- [ ] CH02 boundary/security/durability được chốt và kiểm chứng riêng.
- [ ] CH03 nguồn/citation/handoff/Ticket-gate/no-F5 tests; FR-005 không xong chỉ vì gửi được tin.

## UX và baseline của chức năng

## 1. Mục đích

Customer chat riêng với AI, nhắn trực tiếp Staff hoặc đồng ý chuyển một cuộc AI cho Staff. Mỗi cuộc là một luồng nhiều tin giống ChatGPT; tiêu đề giúp nhận biết, đổi chủ đề không tự tạo cuộc mới.

## 2. Ba luồng độc lập

| Luồng | Customer thao tác | Kết quả đích |
| --- | --- | --- |
| AI riêng | Chat với AI | Staff không thấy list/subject/preview/transcript chỉ vì phụ trách Customer |
| Nhắn trực tiếp Staff | Gửi tới Staff hợp lệ trong cuộc Direct | Staff đọc/trả lời theo quyền cuộc trực tiếp; không biến AI thread cũ thành Direct để bypass Accept |
| Chuyển AI sang Staff | Yêu cầu Staff hoặc đồng ý gợi ý chuyển Staff | Xác nhận chia sẻ toàn bộ lịch sử cuộc này → pending metadata → Staff Accept → cùng conversationId, toàn bộ lịch sử Customer-facing |

## 3. Ticket là nhánh riêng

Agent có thể gợi ý **tạo Ticket**, Customer xem/sửa nội dung và xác nhận; Core kiểm ownership/confirmation/chống trùng, ghi Ticket + outbox atomic rồi mới trả mã Ticket. Gợi ý hoặc bản nháp chưa phải Ticket đã lưu. Xem [Tickets](07-tickets-contract.md).

Yêu cầu Staff/Direct/Accept chat không tự tạo Ticket; Customer xác nhận Ticket không tự cho phép Staff đọc toàn bộ chat AI. Ticket có thể liên kết conversation nhưng link/assignee không mở chat gate. Form Ticket thủ công thuộc backlog cũ, không phải phần triển khai Inbox hiện tại.

## 4. Trạng thái chat và riêng tư

AI_ACTIVE: AI hỗ trợ riêng. PENDING_HANDOFF: chờ Staff nhận, không báo đã có người đang chat. STAFF_ACTIVE: Direct hoặc chuyển giao đã được nhận hợp lệ, Staff trả lời; Agent không ghi muộn sau Accept. AI writer bị fence ngay từ request commit; chưa nối Agent runtime.

ConversationStatus đã bỏ CLOSED qua migration 202611030001_remove_conversation_closed. Customer Support CLOSED cũ về AI_ACTIVE/controller NULL và có audit, giữ lịch sử/liên kết/thời gian; không tự tạo consent/Accept hoặc quyền Staff. Copilot CLOSED chưa review sẽ chặn migration và rollback. TicketStatus.CLOSED là miền khác, không đổi trong đợt này.

## 5. Thành phần UI và kiểm thử cần có

Danh sách tiêu đề/thời gian, transcript cuộn, nhãn AI/Staff, composer và context tài liệu đúng quyền. Hành động “Yêu cầu Staff” tách “Tạo Ticket” theo gợi ý Agent. Chia sẻ lịch sử phải hiển thị rõ trước khi Customer đồng ý; không tự gửi raw tool/Copilot/internal data cho Staff.

- [x] AI riêng không xuất hiện trong API/event/search Staff.
- [x] Direct đúng người nhận, không đổi flag của AI cũ để mở quyền.
- [x] Pending Staff không đọc được tin/preview; sau Accept tải được lịch sử cả trước chuyển giao.
- [x] Ticket/xác nhận/gửi lại không tự mở chat hoặc tạo Ticket khi chỉ yêu cầu Staff.
- [x] Mất mạng/không Staff/reassignment có trạng thái rõ; cursor/nháp/retry không F5 hoặc trùng tin.

<a id="6-chuyển-từ-agent-sang-staff--yêu-cầu-31102026"></a>
## 6. Chuyển từ Agent sang Staff — cập nhật 03/11/2026

1. Customer chủ động yêu cầu hoặc đồng ý với gợi ý chuyển từ Agent. UI nói rõ Staff sau khi nhận được xem **toàn bộ lịch sử Customer-facing của chính cuộc này**, gồm phần đã trao đổi với AI; Customer xác nhận chia sẻ. Không coi LLM suy đoán đồng ý là consent.
2. Core kiểm phiên/ownership/nội dung/consent/version/idempotency, ghi handoff request/PENDING_HANDOFF và sự kiện thông báo bền vững. **Không tạo SupportTicket hoặc mã Ticket** ở luồng này.
3. Sau commit hiển thị đang chờ Staff. Trước Accept, Staff chỉ thấy tên/mã khách, yêu cầu Customer đã đồng ý chia sẻ và thời gian; không transcript/preview AI, summary riêng hoặc số tin.
4. Staff Accept; Core recheck assignment/request/consent/version, ghi acceptance/controller/STAFF_ACTIVE/grant + sự kiện atomic. Chỉ sau commit mới cho Staff gọi API tin nhắn.
5. Staff đọc toàn bộ lịch sử Customer-facing trước và sau Accept bằng cursor, đúng cùng conversationId; không kéo Copilot/raw tool/ghi chú nội bộ hay các cuộc AI khác của khách.
6. Hai bên tiếp tục trong cuộc; Core chặn Agent ghi muộn. Direct/Accept/Ticket là các quan hệ riêng, không tự thực thi lẫn nhau.

Retry hai điểm bắt đầu/timeout phải dùng cùng khóa và tra kết quả, không tạo nhiều request/notification. Thiếu Staff/delivery lỗi không báo đã tiếp nhận hoặc xóa yêu cầu đã commit. Routing/reassignment/consent và endpoint đã theo I01/I03/I05; I06 đã giao realtime/notification handoff local.

I05 dùng `/customer?conversationId=<uuid>`; nháp/key gửi chỉ trong bộ nhớ theo actor/cuộc. Transcript đã bỏ Refresh messages; ACK/realtime cập nhật nền. Customer Refresh conversations nếu source còn có chỉ tải lại vùng, không khẳng định đã bỏ ngoài scope Staff. Chưa delivered/read, attachments hoặc AI tự trả lời. Dialog hiển thị scope toàn bộ lịch sử và yêu cầu bấm xác nhận; Cancel/Escape không tạo request.

Bổ sung kế hoạch 04/11: sau Staff Accept thành công sẽ có tin SYSTEM trong chính transcript thông báo đã tiếp nhận và sẽ phản hồi sớm nhất, lưu bền vững một lần mỗi handoff; đã triển khai ở I06. Nội dung AI Copilot của Staff là nội bộ, Customer chỉ thấy câu trả lời Staff tự duyệt và Send. Không mở đợt sửa bố cục Customer từ yêu cầu này.
