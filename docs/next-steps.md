# Phạm vi hiện tại và hướng phát triển

Đồng bộ 06/11/2026 theo application main 05/11. [Agent Design](specifications/Agent_Design.md) là chuẩn nghiệp vụ Agent; [plan Agent/RAG](superpowers/plans/2026-10-31-agent-rag-implementation.md) là chuẩn triển khai. Tài liệu UI không tự thêm khả năng Agent hoặc biến proposal thành quyết định. [Tiến độ UI](ui/implementation-status.md), [Staff plans](ui/staff/plans/README.md) và [Customer plans](ui/customer/plans/README.md) ghi E/P theo chức năng; các kết quả kiểm thử có ngày thuộc đợt tương ứng, chưa chạy lại từ việc sửa Markdown.

## Đã có

- Core/Web/Docker gateway/PostgreSQL/MinIO, auth/session, tài khoản/hồ sơ, Staff assignment và tra cứu Customers.
- Staff Policies/Products/PDF, Inbox I01–I06: Direct, Customer consent, Staff Accept, lịch sử/gửi tin/realtime/handoff notification.
- Customer Home, Products, Policies/PDF theo ownership và nền chat hai đầu; dùng tài khoản được cấp sẵn, không tự đăng ký. Profile edit/Customer notification center giữ trạng thái trong phase sở hữu.
- Staff Ticket TK01–TK05: read/Accept/status/UI/notification. Chưa có producer I07 từ đề xuất Agent + xác nhận Customer; không coi Ticket UI là E2E tạo Ticket.
- Corpus Markdown và thiết kế Agent đã có; Task 1 có contracts/schema/fixtures/tests để review G1. Task 5 có graph và unit tests với fake model/Core/retrieval/store sau review 07/11; chưa nghiệm thu HTTP/Core/provider/retrieval/checkpoint thật từ các test này.

## Thứ tự tiếp theo

1. **G1 — review contracts:** đối chiếu schema/fixtures với Agent Design và API hội thoại hiện có; sửa hai điểm review về giới hạn thực thi và validation ngày/giờ trước khi đóng G1. Tên/DTO kỹ thuật đề xuất chưa tự thành API đã duyệt.
2. **G2/G3 — runtime protocol:** theo Tasks 2–4/6 chốt storage ownership, transaction/fencing, budget reservation, durable ACK/callback và recovery. Không dùng checkpoint hoặc Message JSON thay lifecycle/ledger; không tự dựng module/queue mới chỉ từ bản đồ file cũ.
3. **Phối hợp Core — Task 3:** ánh xạ contract Agent vào create/list/history/send/consent/Accept/fence/receipt đã có; giữ Core sở hữu quyền. Run metadata và Copilot linked-history snapshot là phần mới; route/module/DDL cuối phải qua review trong plan, không dựng lại chat App.
4. **Graph/context — Task 5:** Prepare → Agent → Execute tools → Finalize; bốn tool, một tool/vòng, context theo từng tin và budgets đã chốt. Copilot chỉ tra cứu, giải thích, tóm tắt; không soạn nháp Customer hoặc Use draft.
5. **Corpus/retrieval/evaluation — Tasks 7–9:** review nguồn/mapping G5, metadata parent–child/refs; hybrid FTS + pgvector + RRF đúng scope/version. Chọn cấu hình thử model/embedding theo G4 trước API trả phí; không mặc định model/số chiều hoặc suy approval từ việc lưu Git.
6. **Tích hợp — Task 10:** kiểm quyền thật, FIFO/reopen/recovery/takeover, citations và Copilot internal qua Core. Ticket proposal-only tới khi G6 và I07 có phần triển khai xác nhận/Core commit; không coi proposal là Ticket đã tạo.

Đây là bản chỉ dẫn tới task/gate hiện có, không thay thứ tự phụ thuộc của plan hoặc tự cấp quyền chạy mọi task. Logout/hết phiên và retention còn mở theo G3; không chặn phần contracts/fakes độc lập.

## Chuẩn bị bảo vệ thông tin Customer — 12/11/2026

[Ma trận dữ liệu và tiêu chí nghiệm thu](configuration-and-data.md#customer-sensitive-data) là phần **P**, chưa thêm runtime masking. Chốt mức che theo vai trò/mục đích, search email/phone và quyền xem đầy đủ trước code. Thực hiện Core projection → CU01/CU02 và caller → Agent model/embedding/output boundary → hồi quy bằng dữ liệu synthetic. Phần Agent phối hợp gates G1–G4, không tự mở provider/corpus chưa được phép. Không sửa dữ liệu gốc/PDF, không reset DB hoặc coi prompt là redaction; [checklist](ui/implementation-status.md) giữ trạng thái chưa triển khai.

## Thiết kế, corpus và việc tiếp theo của Agent

MVP có [7 sản phẩm: 4 chính, 3 bổ trợ](specifications/Agent_Design.md#mvp-products). Corpus Public gồm 13 PDF/243 trang và Markdown tương ứng; [processing review](../data/public/manulife/processing-review.md) giữ nguồn/checksum/trạng thái duyệt, gồm lỗi UL049 trang 29. Cỡ chunk, caps expansion và ranking là tham số cần đo; indexer runtime khác quyền retrieval.

[Dữ liệu hợp đồng tối thiểu](specifications/Contract_Data_Design.md) dùng InsurancePolicy.productId và benefitsSnapshot với mã bổ trợ/mức đầy đủ; không thêm Party/Coverage/Binding chỉ để tra cứu. Danh sách chưa đầy đủ không chứng minh không tham gia. Chi tiết đọc toàn bộ hồ sơ hợp đồng được Core cấp đúng quyền/phiên bản, gồm phụ lục; không có ACL theo Điều.

[Fixture synthetic rút gọn](../data/synthetic/manulife-demo-v1/README.md) có bộ đáp án riêng, chưa ánh xạ hết rider thương mại. [Private demo đầy đủ](../data/private/manulife-demo-full-v1/README.md) được phép lưu Git nhưng vẫn synthetic=false, chưa human/RAG approval. Không tự seed/chunk/embed; PDF/bản thô/ảnh/định danh thật vẫn ngoài Git.

[Mở rộng data model dự kiến](specifications/Data_Model.md#iii-mở-rộng-agentrag-dự-kiến--chưa-là-schema-đã-triển-khai) tách Core run/attempt/event, Agent checkpoint/receipt/fence/ledger/outbound và metadata RAG. Chưa có DDL cuối thì giữ proposal, không tăng số bảng baseline.

## Phần policy/PDF đã có và còn lại

Staff lookup và Customer ownership list/detail/catalog/access/PDF đã có; [Staff policies](ui/staff/plans/05-policies-contract.md), [Customer policies](ui/customer/plans/04-policies-contract.md) và [documents](ui/customer/plans/05-documents-contract.md) sở hữu chi tiết. Quick lookup trong Inbox đã có PL05; mở PDF không tự đổi hợp đồng đang xét của Agent. Đổi linkedPolicy qua UI vẫn là mở rộng chưa chọn, không thay việc xác định hợp đồng trong hội thoại.

- [x] **QA Staff local:** suite browser regression và gateway/Core/DB/MinIO E2E có trong repo cho Auth/Customers/Policies, Chromium/Firefox/WebKit; lỗi mạng/missing object/expiry/revoke theo test case phase. Runner tự dọn fixture/artifact; chưa tuyên bố cấu hình CI hoặc native PDF toolbar/zoom.

<a id="inbox-ticket-relocation"></a>
## Inbox/chat và Ticket

Bản thử cũ đã được thay bởi [I01–I06](ui/staff/plans/03-inbox-contract.md). Assignment không cho xem chat AI riêng; pending chỉ metadata; Customer consent + Staff Accept mới mở toàn bộ lịch sử Customer-facing của chính cuộc. Handoff/Direct/Ticket là các nghiệp vụ riêng; Ticket không tạo transcript grant. Copilot dùng thread riêng và source view cố định theo từng câu hỏi Staff.

<a id="kế-hoạch-hôm-nay--03112026"></a>
## Các mốc nền đã hoàn tất

Ngày **29/10/2026** có fixture tham chiếu Markdown/JSON/15 đáp án; bootstrap hiện dùng [portfolio bốn hồ sơ riêng](../data/synthetic/manulife-demo-v1/README.md) từ `policies.json`, không nhân bản fixture cũ. Mỗi hồ sơ gắn đúng người/sản phẩm/điều khoản, không dùng bổ trợ DEMO-TITAN chưa ánh xạ. Chưa chunk, embedding hoặc chạy Agent/RAG từ bộ này; phí vẫn là dữ liệu thử chưa kiểm định thương mại.

[Retry phiên](ui/staff/plans/auth/03-session-lifecycle.md), [vòng đời Policy/PDF](ui/staff/plans/policies/04-viewer-lifecycle.md) và [Inbox](ui/staff/plans/03-inbox-contract.md) giữ chi tiết/bằng chứng của đợt 03–05/11. Các phase này là baseline để bảo trì, không là danh sách việc phải làm lại.

## Ngoài phần triển khai hiện tại

Staff chat chung không gắn Customer vẫn tạm hoãn. Guest/Lead, thêm Business Tools, tự host model, cache Private, queue mới, cloud sizing/HA–DR và di chuyển checkpoint DB thật giữ phạm vi riêng; không tự triển khai từ bản cập nhật tài liệu.
