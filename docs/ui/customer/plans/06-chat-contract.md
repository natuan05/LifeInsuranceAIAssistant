# C06 — Conversations: giữ chat thật, tách nhánh Agent

04/11/2026 · **CH01–CH03 là kế hoạch mới** · C06 · [Chung](00-customer-contract.md).

## Truy vết data model và vị trí code theo phase

Mỗi phase dưới đây có bảng cột/đọc–ghi/FK/version, migration, transaction và mức ảnh hưởng chi tiết; xem mục **Data model và phạm vi ảnh hưởng** và bảng **Vị trí code** trong phase. Hiện có file không đồng nghĩa mọi thay đổi dự kiến trong file đã được triển khai. Các phần P giữ P.

| Phase sở hữu | Bảng/dữ liệu chính và thao tác | Code cần rà từ root repo | Mức ảnh hưởng khi sửa |
| --- | --- | --- | --- |
| [CH01 — Ghép Conversations UI trên I03–I06](chat/01-existing-chat-workspace.md) | staff_assignments + customer_profiles + staff_profiles (Đọc); conversations + conversation_handoffs (Đọc); messages (Đọc); conversations + messages + conversation_handoffs + conversation_command_receipts (Ghi gián tiếp qua I03/I05, không từ UI trực tiếp); outbox_events (Thêm trong transaction nguồn; worker cập nhật trạng thái/lease) | [apps/web/src/components/customer-conversations.tsx](<../../../../apps/web/src/components/customer-conversations.tsx>); [apps/web/src/components/customer-handoff-dialog.tsx](<../../../../apps/web/src/components/customer-handoff-dialog.tsx>) | Cao — Customer shell và Direct/AI tabs |
| [CH02 — Contract Core–Agent, durable turns và tool scope](chat/02-agent-boundary.md) | conversations + conversation_handoffs (Đọc); messages (Đọc); insurance_policies + insurance_products (Đọc); documents + document_versions (Đọc); Durable turn — P, chưa có bảng app (DDL và ghi dự kiến, chưa triển khai) | [apps/core/src/conversations/services/conversation-message.service.ts](<../../../../apps/core/src/conversations/services/conversation-message.service.ts>); [apps/core/src/conversations/services/conversation-access.service.ts](<../../../../apps/core/src/conversations/services/conversation-access.service.ts>) | Cao — SYSTEM/Customer/Staff append giữ semantics |
| [CH03 — AI answers, citations và lời gợi ý có xác nhận](chat/03-agent-answers-ui.md) | messages (Đọc); documents + document_versions (Đọc); Durable turn — P, chưa có bảng app (DDL và ghi dự kiến, chưa triển khai) | [apps/web/src/components/customer-conversations.tsx](<../../../../apps/web/src/components/customer-conversations.tsx>); [apps/web/src/components/conversation-transcript.tsx](<../../../../apps/web/src/components/conversation-transcript.tsx>) | Cao — Customer shell và Direct/AI tabs |

Không tự áp dụng DDL khi triển khai UI, không biến model dự kiến thành hiện trạng, không reset seed/volume để né lỗi FK. Các dependency xuyên vai trò và operator xem [Data Model](../../../specifications/Data_Model.md#iii-bản-đồ-tác-động-khi-triển-khai-chức-năng).

## 1. Baseline và yêu cầu

FR-005/006/011, NFR-001/002/003/005/008. I03–I06 đã có own conversations/history, Direct, consent/request/Accept, gửi chống trùng, realtime catch-up và SYSTEM tiếp nhận. Source `apps/agent` có graph, Public RAG/adapter Gemini thử nghiệm và checkpointer PostgreSQL theo Agent README. Provider Gemini API đã chốt cho MVP ngày 13/11/2026. Cặp model MVP đã chốt gemini-3.8-flash và gemini-embedding-2, 1536 chiều ngày 13/11/2026. HTTP/Core end-to-end, limits và nghiệm thu còn cần hoàn thiện. Không làm lại REST/chat từ đầu hoặc giả AI đã phản hồi.

| Phase | Kết quả | Gate |
| --- | --- | --- |
| [CH01](chat/01-existing-chat-workspace.md) | Đưa chat vào shell Customer mới (Đã triển khai) | H01; không Agent |
| [CH02](chat/02-agent-boundary.md) | Service identity, durable turns, tools/retrieval/fence và contract Agent | Review kiến trúc/migration trước nối LLM |
| [CH03](chat/03-agent-answers-ui.md) | Hiển thị tiến trình/answer/citations/gợi ý đã được Core cho phép | CH02+Agent thật, D01/D02 nếu mở policy PDF |

## 2. Quyết định phải giữ

**Logout/hết phiên — B đã chốt 14/11/2026.** Các yêu cầu AI Core đã nhận tiếp tục xử lý theo quyền tài khoản/tài nguyên hiện hành. UI phiên cũ xóa nội dung riêng, login lại cùng actor đọc history/current run bằng phiên mới. Tích hợp còn P trong CH02-T08/CH03-T07 và Auth. [Chính sách chuẩn](../../../specifications/Agent_Design.md#agent-logout-session-policy).

**Lịch sử MVP — A đã chốt 14/11/2026.** Giữ hội thoại/tin nhắn để Customer xem lại, chưa tự xóa theo thời gian. New AI chat tạo cuộc mới và lịch sử cũ vẫn đọc theo ownership/session, Staff đọc theo grant/phân công hiện hành. CH01-T06 kiểm hồi quy. [Chính sách chuẩn](../../../configuration-and-data.md#mvp-chat-history-retention).

**Lượt AI lỗi/quá hạn — A đã chốt 14/11/2026.** Core lưu FAILED và UI báo lỗi để Customer chủ động gửi lại/hỏi tiếp bằng tin mới. Lượt lỗi không tự chạy lại, reload/reconnect đối soát cùng run. Retry giao nhận theo ID/receipt và retry tạm thời trong request theo ngân sách hiện hành. Tích hợp/history/UI còn P trong CH02-T07/CH03-T06. [Quyết định chuẩn](../../../specifications/Agent_Design.md#failed-turn-policy).

**Chat mới sau Staff — đã chốt 14/11/2026.** Customer muốn hỏi AI sau khi trao đổi với Staff thì chủ động chọn New AI chat. Core tạo conversation mới qua luồng create hiện có, Agent dùng thread/context riêng của cuộc mới. Cuộc cũ nằm trong lịch sử, quyền đọc/gửi tiếp tục theo allowedActions và grant hiện hành. ConversationStatus giữ AI_ACTIVE/PENDING_HANDOFF/STAFF_ACTIVE. Dừng trao đổi sau khi đã hỗ trợ xong không tạo trạng thái Close hoặc command kết thúc, cũng không tự khóa composer thành chỉ đọc. New AI chat/create đã có, CH01 giữ hành vi này, CH02/CH03 còn kiểm context/callback và tích hợp Agent/Core. [Quyết định chuẩn](../../../specifications/Agent_Design.md#new-ai-chat-after-staff).

ConversationStatus chỉ AI_ACTIVE/PENDING_HANDOFF/STAFF_ACTIVE, không CLOSED. Customer có nhiều cuộc theo chủ đề/tên/thời gian, không unread/counts giả. Staff không xem AI riêng; request pending chỉ metadata Customer chia sẻ; sau consent toàn bộ lịch sử + Staff Accept mới toàn bộ Customer-visible trong chính cuộc. Direct có provenance riêng, không đổi flag của cuộc AI cũ. Ticket là nhánh I07, không hậu quả tự động của handoff hoặc SYSTEM.

CH02 hoàn thiện contract và tích hợp theo các quyết định đã chốt trong Agent Design, gồm HTTP + callback, Starlette + uvicorn, LI-HMAC-SHA256-v1 và Gemini API. Storage/fence và hosting cụ thể theo phần review G2/G3 hiện hành. Cần test Core với adapter giả trong harness rồi Agent thật, nghiệm thu FR-005 theo chứng cứ từng luồng.

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
