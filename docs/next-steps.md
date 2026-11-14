# Phạm vi hiện tại và hướng phát triển

Đồng bộ 06/11/2026 theo application main 05/11. [Agent Design](specifications/Agent_Design.md) là chuẩn nghiệp vụ Agent; [plan Agent/RAG](superpowers/plans/2026-10-31-agent-rag-implementation.md) là chuẩn triển khai. Tài liệu UI không tự thêm khả năng Agent hoặc biến proposal thành quyết định. [Tiến độ UI](ui/implementation-status.md), [Staff plans](ui/staff/plans/README.md) và [Customer plans](ui/customer/plans/README.md) ghi E/P theo chức năng; các kết quả kiểm thử có ngày thuộc đợt tương ứng, chưa chạy lại từ việc sửa Markdown.

## Trình tự rà soát đã thống nhất

Phần Application đã có source được đối chiếu và đặc tả tại [Spec sửa code Application](application-code-alignment-spec.md): hiện trạng, chênh lệch, thay đổi đích và test theo 6 phase. Spec chưa được thực thi, không bao gồm code Agent/Copilot. Trình tự giữ nguyên: chốt tài liệu → rà soát code → thống nhất kế hoạch → sửa và kiểm thử. Các task/gate Agent bên dưới tiếp tục theo phạm vi riêng.

## Đã có

- Core/Web/Docker gateway/PostgreSQL/MinIO, auth/session, tài khoản/hồ sơ, Staff assignment và tra cứu Customers.
- Staff Policies/Products/PDF, Inbox I01–I06: Direct, Customer consent, Staff Accept, lịch sử/gửi tin/realtime/handoff notification.
- Customer Home, Products, Policies/PDF theo ownership và nền chat hai đầu; dùng tài khoản được cấp sẵn, không tự đăng ký. Hồ sơ Customer chỉ đọc theo C08/PF01/PF02; Customer notification center theo phase sở hữu.
- Staff Ticket TK01–TK05 đã có read/Accept/status/UI/notification. Customer I07/T01/T02 đã có source hai luồng thủ công và draft Agent, tạo OPEN; cần sửa lỗi review và nghiệm thu tích hợp nguồn Agent.
- Corpus Markdown và thiết kế Agent đã có. Task 1 có contracts/schema/fixtures/tests để review G1, Task 5 có graph và unit tests với fake adapters. Source còn có Public RAG/adapter Gemini thử nghiệm và checkpointer PostgreSQL theo các mốc 3/4 của Agent README. Provider Gemini API cho model sinh/embedding đã chốt ngày 13/11/2026. Cặp model MVP đã chốt gemini-3.8-flash và gemini-embedding-2, 1536 chiều. HTTP/Core end-to-end, limits và nghiệm thu tiếp tục theo gates.

## Thứ tự tiếp theo

1. **G1 — review contracts:** đối chiếu schema/fixtures với Agent Design và API hội thoại hiện có; sửa hai điểm review về giới hạn thực thi và validation ngày/giờ trước khi đóng G1. Tên/DTO kỹ thuật đề xuất chưa tự thành API đã duyệt.
2. **G2/G3 — runtime protocol:** framework HTTP Starlette + uvicorn và profile LI-HMAC-SHA256-v1 đã chốt ngày 13/11/2026. Task 6 phía Agent có code trên `origin/agent/task-6-http-delivery` tại `5043e8d`, chưa merge main. Theo Tasks 2–4/6 hoàn thiện storage ownership, transaction/fencing, budget reservation, durable ACK/callback và recovery. Không dùng checkpoint hoặc Message JSON thay lifecycle/ledger; không tự dựng module/queue mới chỉ từ bản đồ file cũ.
3. **Phối hợp Core — Task 3:** ánh xạ contract Agent vào create/list/history/send/consent/Accept/fence/receipt đã có; giữ Core sở hữu quyền. Run metadata và Copilot linked-history snapshot là phần mới; route/module/DDL cuối phải qua review trong plan, không dựng lại chat App.
4. **Graph/context — Task 5:** Prepare → Agent → Execute tools → Finalize; bốn tool, một tool/vòng, context theo từng tin và budgets đã chốt. Copilot chỉ tra cứu, giải thích, tóm tắt; không soạn nháp Customer hoặc Use draft.
5. **Corpus/retrieval/evaluation — Tasks 7–9:** review nguồn/mapping G5, metadata parent–child/refs; hybrid FTS + pgvector + RRF đúng scope/version. Provider Gemini API đã chọn cho model sinh/embedding. Cặp model MVP đã chốt gemini-3.8-flash và gemini-embedding-2, 1536 chiều ngày 13/11/2026. Review limits, tham số retrieval, chi phí/quota và tiêu chí nghiệm thu theo G4 trước các phép chạy phụ thuộc.
6. **Tích hợp — Task 10:** kiểm quyền thật, FIFO/reopen/recovery/takeover, citations và Copilot internal qua Core. Ticket proposal-only tới khi G6 và I07 có phần triển khai xác nhận/Core commit; không coi proposal là Ticket đã tạo.

Đây là bản chỉ dẫn tới task/gate hiện có, không thay thứ tự phụ thuộc của plan hoặc tự cấp quyền chạy mọi task. Logout/hết phiên đã chốt B ngày 14/11, Core tiếp tục xử lý các yêu cầu đã nhận theo quyền hiện hành và người dùng login lại xem. Tích hợp session/service/run và tests còn P trong CH02-T08/CH03-T07/AU03-T05/CP04-T04, các phần G2/G3 khác tiếp tục để sau theo yêu cầu.

## Bảo vệ thông tin Customer

[Ma trận dữ liệu](configuration-and-data.md#customer-sensitive-data) giữ các quyết định và tiêu chí CU01/CU02. Code còn cần che mặc định email/phone, Hiện/Ẩn để liên hệ, search chỉ tên/mã và projection năm sinh/tỉnh-thành đã xác minh. Họ tên/mã Customer và policyNumber đầy đủ trong scope đã khớp source. Agent dùng system prompt và dữ liệu synthetic theo B, không thêm bộ lọc định danh bằng code.

Copilot xác định hợp đồng từ câu hỏi/lịch sử được phép, mơ hồ thì hỏi lại. Policy Lookup/PDF chỉ đọc. Không bổ sung ô chọn hợp đồng hoặc API lưu lựa chọn. CP01/CP04 sở hữu tích hợp và kiểm thử theo [quyết định chuẩn](specifications/Agent_Design.md#copilot-policy-selection).

## Phần policy/PDF đã có và còn lại

Staff lookup và Customer ownership list/detail/catalog/access/PDF đã có; [Staff policies](ui/staff/plans/05-policies-contract.md), [Customer policies](ui/customer/plans/04-policies-contract.md) và [documents](ui/customer/plans/05-documents-contract.md) sở hữu chi tiết. Quick lookup trong Inbox đã có PL05; mở PDF không tự đổi hợp đồng đang xét của Agent. Hợp đồng được xác định từ câu hỏi/lịch sử được phép theo B ngày 14/11.

- [x] **QA Staff local:** suite browser regression và gateway/Core/DB/MinIO E2E có trong repo cho Auth/Customers/Policies, Chromium/Firefox/WebKit; lỗi mạng/missing object/expiry/revoke theo test case phase. Runner tự dọn fixture/artifact; chưa tuyên bố cấu hình CI hoặc native PDF toolbar/zoom.

<a id="inbox-ticket-relocation"></a>
## Inbox/chat và Ticket

Lịch sử chat Core trong MVP đã chốt A ngày 14/11, giữ để xem lại và chưa tự xóa theo thời gian. CH01-T06 theo dõi hồi quy history/quyền khi mở cuộc mới và chạy Notification cleanup. Dữ liệu khôi phục Agent giữ trong MVP theo A ngày 14/11, log/audit/cache và production còn cần chốt. [Chính sách chuẩn](configuration-and-data.md#mvp-chat-history-retention).

Quyết định 14/11/2026 dùng New AI chat sau hỗ trợ Staff. Create/receipt và nút Web đã có, còn kiểm tích hợp Agent/Core với context/thread riêng và callback đúng cuộc. Cuộc cũ đọc/gửi theo trạng thái/grant hiện hành. CH01-T05, CH02-T05/T06 và I03-T06 theo dõi hồi quy, dừng nhắn không cần trạng thái Close hoặc command kết thúc. [Nghiệp vụ chuẩn](specifications/Agent_Design.md#new-ai-chat-after-staff).

Bản thử cũ đã được thay bởi [I01–I06](ui/staff/plans/03-inbox-contract.md). Assignment không cho xem chat AI riêng; pending chỉ metadata; Customer consent + Staff Accept mới mở toàn bộ lịch sử Customer-facing của chính cuộc. Handoff/Direct/Ticket là các nghiệp vụ riêng; Ticket không tạo transcript grant. Copilot dùng thread riêng và source view cố định theo từng câu hỏi Staff.

<a id="kế-hoạch-hôm-nay--03112026"></a>
## Các mốc nền đã hoàn tất

Ngày **29/10/2026** có fixture tham chiếu Markdown/JSON/15 đáp án; bootstrap hiện dùng [portfolio bốn hồ sơ riêng](../data/synthetic/manulife-demo-v1/README.md) từ `policies.json`, không nhân bản fixture cũ. Mỗi hồ sơ gắn đúng người/sản phẩm/điều khoản, không dùng bổ trợ DEMO-TITAN chưa ánh xạ. Chưa chunk, embedding hoặc chạy Agent/RAG từ bộ này; phí vẫn là dữ liệu thử chưa kiểm định thương mại.

[Retry phiên](ui/staff/plans/auth/03-session-lifecycle.md), [vòng đời Policy/PDF](ui/staff/plans/policies/04-viewer-lifecycle.md) và [Inbox](ui/staff/plans/03-inbox-contract.md) giữ chi tiết/bằng chứng của đợt 03–05/11. Các phase này là baseline để bảo trì, không là danh sách việc phải làm lại.

## Ngoài phần triển khai hiện tại

Staff chat chung không gắn Customer vẫn tạm hoãn. Guest/Lead, thêm Business Tools, tự host model, cache Private, queue mới, cloud sizing/HA–DR và di chuyển checkpoint DB thật giữ phạm vi riêng; không tự triển khai từ bản cập nhật tài liệu.
