# C06 — Conversations: giữ chat thật, tách nhánh Agent

04/11/2026 · **CH01–CH03 là kế hoạch mới** · C06 · [Chung](00-customer-contract.md).

## Truy vết data model và vị trí code theo phase

| Phase sở hữu | Bảng/dữ liệu chính và thao tác | Code cần rà từ root repo | Mức ảnh hưởng khi sửa |
| --- | --- | --- | --- |
| [CH01 — Ghép Conversations UI trên I03–I06](chat/01-existing-chat-workspace.md) | staff_assignments + customer_profiles + staff_profiles (Đọc); conversations + conversation_handoffs (Đọc); messages (Đọc); conversations + messages + conversation_handoffs + conversation_command_receipts (Ghi gián tiếp qua I03/I05, không từ UI trực tiếp); outbox_events (Thêm trong transaction nguồn; worker cập nhật trạng thái/lease) | [apps/web/src/components/customer-conversations.tsx](<../../../../apps/web/src/components/customer-conversations.tsx>); [apps/web/src/components/customer-handoff-dialog.tsx](<../../../../apps/web/src/components/customer-handoff-dialog.tsx>) | Cao — Customer shell và Direct/AI tabs |
| [CH02 — Contract Core–Agent, durable turns và tool scope](chat/02-agent-boundary.md) | conversations + conversation_handoffs (Đọc); messages (Đọc); insurance_policies + insurance_products (Đọc); documents + document_versions (Đọc); Durable turn — P, chưa có bảng app (DDL và ghi dự kiến, chưa triển khai) | [apps/core/src/conversations/services/conversation-message.service.ts](<../../../../apps/core/src/conversations/services/conversation-message.service.ts>); [apps/core/src/conversations/services/conversation-access.service.ts](<../../../../apps/core/src/conversations/services/conversation-access.service.ts>) | Cao — SYSTEM/Customer/Staff append giữ semantics |
| [CH03 — AI answers, citations và lời gợi ý có xác nhận](chat/03-agent-answers-ui.md) | messages (Đọc); documents + document_versions (Đọc); Durable turn — P, chưa có bảng app (DDL và ghi dự kiến, chưa triển khai) | [apps/web/src/components/customer-conversations.tsx](<../../../../apps/web/src/components/customer-conversations.tsx>); [apps/web/src/components/conversation-transcript.tsx](<../../../../apps/web/src/components/conversation-transcript.tsx>) | Cao — Customer shell và Direct/AI tabs |

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

**Thiết kế 23/11, chưa triển khai.** Staff phụ trách xem được toàn bộ lịch sử Customer-facing và có thể Takeover khi AI đang hỗ trợ. Customer tiếp tục trong cùng cuộc sau Takeover. Runtime hiện tại vẫn mở transcript Staff sau Direct hoặc consent + Accept. [Đặc tả Inbox](../../staff/plans/inbox/00-inbox-spec.md).

CH02 hoàn thiện contract và tích hợp theo các quyết định đã chốt trong Agent Design, gồm HTTP + callback, Starlette + uvicorn, LI-HMAC-SHA256-v1 và Gemini API. Storage/fence và hosting cụ thể theo phần review G2/G3 hiện hành. Cần test Core với adapter giả trong harness rồi Agent thật, nghiệm thu FR-005 theo chứng cứ từng luồng.

- [x] CH01 giữ quyền/nháp/reconcile/realtime I03–I06, giao diện 100% tiếng Anh, tối ưu header và composer.
- [ ] CH02 boundary/security/durability được chốt và kiểm chứng riêng.
- [ ] CH03 nguồn/citation/handoff/Ticket-gate/no-F5 tests; FR-005 không xong chỉ vì gửi được tin.

## UX và baseline của chức năng

## 1. Mục đích

Customer chat với AI, nhắn trực tiếp Staff hoặc yêu cầu Staff hỗ trợ trong cuộc hiện tại. Tiêu đề giúp nhận biết cuộc chat; đổi chủ đề trong tin nhắn vẫn giữ cùng cuộc.

## 2. Ba luồng độc lập

| Luồng | Customer thao tác | Kết quả đích |
| --- | --- | --- |
| Chat AI | Chat với AI | Staff đang phụ trách xem được transcript và có thể chủ động Takeover. Customer thấy thông báo tiếp quản và chat tiếp trong cùng cuộc |
| Nhắn trực tiếp Staff | Gửi tới Staff hợp lệ trong cuộc Direct | Staff đọc và trả lời theo quyền cuộc trực tiếp |
| Yêu cầu Staff hỗ trợ | Gửi yêu cầu hoặc đồng ý với đề xuất của Agent | Customer xác nhận nội dung gửi, Core ghi PENDING_HANDOFF, Staff Accept để trả lời trong cùng cuộc |

## 3. Ticket là nhánh riêng

Agent có thể gợi ý **tạo Ticket**, Customer xem/sửa nội dung và xác nhận; Core kiểm ownership/confirmation/chống trùng, ghi Ticket + outbox atomic rồi mới trả mã Ticket. Gợi ý hoặc bản nháp chưa phải Ticket đã lưu. Xem [Tickets](07-tickets-contract.md).

Yêu cầu Staff/Direct/Accept chat không tự tạo Ticket; Customer xác nhận Ticket không tự cho phép Staff đọc toàn bộ chat AI. Ticket có thể liên kết conversation nhưng link/assignee không mở chat gate. Form Ticket thủ công đã có trong Application, độc lập với tích hợp đề xuất Agent còn P.

## 4. Trạng thái chat và riêng tư

AI_ACTIVE hiển thị AI đang hỗ trợ. PENDING_HANDOFF hiển thị đang chờ Staff. STAFF_ACTIVE hiển thị người đang hỗ trợ sau Direct, Accept hoặc Takeover. Core fence Agent từ lúc commit yêu cầu Customer hoặc Takeover theo từng luồng.

Khi Staff chỉ mở xem cuộc đang do AI hỗ trợ, Customer vẫn thấy “Đang được AI hỗ trợ”.

Nếu đổi Staff sau khi cuộc đã được tiếp quản, Customer nhận thông báo trong ứng dụng dẫn về cùng cuộc chat và thấy đang chờ Staff mới. Customer vẫn xem lịch sử, ô gửi tạm khóa và AI vẫn dừng. Khi Staff mới Takeover thành công, tin SYSTEM xác nhận đã tiếp quản và Customer gửi tiếp trong cùng cuộc. [Đặc tả Inbox](../../staff/plans/inbox/00-inbox-spec.md#4-quyền-và-hành-vi-trạng-thái)

Khi xác nhận gửi yêu cầu, Customer được báo trước rằng yêu cầu đang chờ sẽ đi theo Staff phụ trách. Nếu đổi Staff trước Accept, Customer nhận thông báo yêu cầu đã chuyển sang Staff mới, vẫn thấy đang chờ nhân viên tiếp nhận và không cần gửi lại. AI vẫn dừng trong lúc chờ.

Customer chỉ thấy dấu Đã đọc cập nhật khi Staff mở cuộc với quyền trả lời hiện hành. Việc Staff xem lịch sử trước Accept hoặc Takeover không đổi dấu Đã đọc.

ConversationStatus đã bỏ CLOSED qua migration 202611030001_remove_conversation_closed. Customer Support CLOSED cũ về AI_ACTIVE/controller NULL và có audit, giữ lịch sử/liên kết/thời gian; không tự tạo consent/Accept hoặc quyền Staff. Copilot CLOSED chưa review sẽ chặn migration và rollback. TicketStatus.CLOSED là miền khác, không đổi trong đợt này.

## 5. Thành phần UI và kiểm thử cần có

Danh sách có tiêu đề và thời gian. Transcript hiển thị nhãn AI/Staff và context tài liệu đúng quyền. Customer thấy thông tin Staff phụ trách có thể đọc và tiếp quản cuộc chat. “Yêu cầu Staff” và “Tạo Ticket” có bước xác nhận riêng.

- [ ] Theo thiết kế 23/11, Staff phụ trách đọc được từ tin đầu tiên và theo dõi tin mới trong AI_ACTIVE/PENDING_HANDOFF. Staff ngoài phân công bị chặn.
- [x] Direct đúng người nhận, không đổi flag của AI cũ để mở quyền.
- [ ] Theo thiết kế 23/11, Customer thấy chuyển quyền trong cùng cuộc. Staff gửi được sau Takeover/Accept commit; callback AI muộn bị chặn.
- [x] Ticket/xác nhận/gửi lại không tự mở chat hoặc tạo Ticket khi chỉ yêu cầu Staff.
- [x] Mất mạng/không Staff/reassignment có trạng thái rõ; cursor/nháp/retry không F5 hoặc trùng tin.

<a id="6-chuyển-từ-agent-sang-staff--yêu-cầu-31102026"></a>
## 6. Chuyển từ Agent sang Staff — thiết kế 23/11/2026

1. Customer bấm Request Staff support hoặc chọn PROPOSE_HANDOFF. Dialog hiển thị nội dung yêu cầu để Customer xem, sửa và xác nhận gửi. Runtime hiện dùng nội dung nhập tay; chuẩn bị subject/reason bằng AI còn P. [CH02](chat/02-agent-boundary.md) · [CH03](chat/03-agent-answers-ui.md)
2. Core kiểm phiên/ownership/nội dung/consent/version/idempotency, ghi handoff request/PENDING_HANDOFF và sự kiện thông báo bền vững. **Không tạo SupportTicket hoặc mã Ticket** ở luồng này.
3. Sau commit hiển thị đang chờ Staff. Staff phụ trách thấy thông tin yêu cầu và đọc được lịch sử từ tin đầu tiên.
4. Staff Accept; Core kiểm lại assignment, request và version rồi ghi acceptance, controller, STAFF_ACTIVE và sự kiện cùng transaction. Staff gửi được sau commit.
5. Với cuộc AI_ACTIVE, Staff phụ trách có thể Takeover trực tiếp. Customer thấy SYSTEM tiếp quản và tiếp tục chat trong cùng conversationId. Core chặn kết quả AI đến sau mốc chuyển quyền.

Retry hai điểm bắt đầu/timeout phải dùng cùng khóa và tra kết quả, không tạo nhiều request/notification. Thiếu Staff/delivery lỗi không báo đã tiếp nhận hoặc xóa yêu cầu đã commit. Routing/reassignment/consent và endpoint đã theo I01/I03/I05; I06 đã giao realtime/notification handoff local.

Baseline I05 dùng `/customer?conversationId=<uuid>`. Nháp và key gửi tách theo actor/cuộc, ACK/realtime cập nhật nền. Dialog hiện yêu cầu xác nhận chia sẻ lịch sử; khi triển khai thiết kế 23/11, nội dung xác nhận chuyển sang việc gửi yêu cầu và nội dung kèm theo.

Bổ sung kế hoạch 04/11: sau Staff Accept thành công sẽ có tin SYSTEM trong chính transcript thông báo đã tiếp nhận và sẽ phản hồi sớm nhất, lưu bền vững một lần mỗi handoff; đã triển khai ở I06. Nội dung AI Copilot của Staff là nội bộ, Customer chỉ thấy câu trả lời Staff tự duyệt và Send. Không mở đợt sửa bố cục Customer từ yêu cầu này.
