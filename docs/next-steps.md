# Phạm vi hiện tại và hướng phát triển

Đối chiếu **04/11/2026**. Trạng thái màn hình ở [checklist UI](ui/implementation-status.md), gap G01–G10 ở [Staff gap-review](ui/staff/plans/README.md#phần-còn-lại-theo-chức-năng); đọc [chỉ mục UI](ui/README.md) theo thứ tự. Setup/vận hành ở [getting-started](getting-started.md), quyết định còn mở ở [source-review](source-review.md).

## Thứ tự tiếp theo — 04/11/2026

1. **Staff không Agent:** Auth/Customers/Policies/Products/Inbox I01–I06/handoff notifications đã E. TK01 nền scope/version/legacy và TK02 A21/A22 read đã có;44 tests TK02+regression pass. TK03 A23 Accept đã có; TK04 UI đã nối; [TK05](ui/staff/plans/tickets/05-notification-events.md) notification/realtime đã có,69 Core/migration tests và browser hai tab pass; I07 producer/xác nhận còn P.
2. **Đợt Customer sau:** [H01 rồi từng chức năng](ui/customer/plans/README.md), giữ auth/chat/shared APIs đang chạy; chưa triển khai đợt này.
3. **Đợt Agent riêng:** [CP01–CP04](ui/staff/plans/08-copilot-contract.md), I07 trusted draft/confirmation và Customer CH02/CH03/T01/T02. Không fake Agent để lấp Ticket và không tự commit/push.

Docs UI đã hợp nhất màn hình/API/routes/gap vào contract/phases theo chức năng. [Staff plans](ui/staff/plans/README.md) và [Customer plans](ui/customer/plans/README.md) là đầu mối triển khai, không còn ba file tổng hợp song song ở Staff. Các mốc bên dưới là lịch sử, không dùng chúng đưa phần đã E về backlog.


## Đã có

- [x] Compose Web/Core/Nginx/PostgreSQL/DbGate/MinIO private; migration/seed synthetic và operator local tách public app.
- [x] Auth/session/đổi password/logout, hồ sơ Customer/Staff contact và Staff assigned-customer list/detail/pagination.
- [x] Staff UI từ mẫu, Customers riêng, account page/menu, routes/deep link/shared layout; English/Lexend/fullscreen và dọn preview/dead UI.
- [x] InsurancePolicy/PolicyStatus/insurance_policies bằng migration mới.
- [x] WebSocket receive-only invalidation account/profile/assignment; REST resync/refresh nền. I06 đã có realtime chat/notification handoff local; Ticket riêng.

## Staff Policy Lookup — đã triển khai 02/11/2026

A15 và FE Policy Lookup hai cột đã triển khai 02/11/2026. Phần đọc chi tiết/catalog, xem/tải PDF Staff và bootstrap hợp đồng đã có; không làm lại các phần này.

- [x] **Core A15:** `GET /api/v1/staff/policies` dùng session Staff và chỉ lấy hợp đồng của khách đang được phân công. Search số hợp đồng, tên/mã khách, mã/tên sản phẩm; lọc/count toàn tập đúng quyền trước phân trang, thứ tự ổn định. Không tìm CCCD/phone, không nhận actor/role từ client.
- [x] **Search/filter:** hỗ trợ All/Active/Lapsed/Matured/Pending đúng enum DB, page/pageSize và search; kiểm input, giới hạn và literal search theo baseline Customers. Clear search luôn có vị trí cố định. DTO/query đã triển khai, contract tại Staff policies.
- [x] **FE hai cột:** trái là kết quả gồm số hợp đồng, khách hàng, sản phẩm, trạng thái và phân trang; phải tái sử dụng phần xem PDF chính, thông tin thu gọn, điều khoản/phụ lục và tải hiện có. Màn hình hẹp chuyển danh sách → chi tiết, có quay lại giữ trạng thái.
- [x] **Dọn UI mẫu:** bỏ Back to Inbox ở trang độc lập; đổi tiêu đề thành Policy Lookup; thay filter In-Force/Grace Period/Review và placeholder CCCD/phone bằng tiêu chí được hỗ trợ.
- [x] **Thu gọn cột kết quả:** icon trong ô tìm kiếm, icon mở lại ở mép khi đóng; không chữ Hide results, giữ nội dung nhập/bộ lọc/trang/hợp đồng. Header dossier gọn, không có Customer profile; PDF vừa chiều ngang.
- [x] **Điều hướng:** giữ search/status/page và lựa chọn hợp đồng khi mở/quay lại, hỗ trợ Back/Forward/deep link. Search/Clear/filter/phân trang/retry/chọn hợp đồng không reload document hay remount workspace. Không đưa returnTo dài hoặc signed URL lên URL ứng dụng.
- [x] **Trạng thái và kiểm chứng đã có:** loading/empty/error/retry, 10 Policy integration + 6 HTTP/realtime tests; browser smoke search/filter/phân trang/PDF/URL/keyboard/mobile và thu gọn cột kết quả.
- [ ] **QA còn lại:** browser E2E tự động trong repo/CI; lỗi mạng/storage/expiry và thu hồi quyền đầy đủ trên UI.

Nguồn chi tiết: [Staff policies](ui/staff/plans/05-policies-contract.md#policy-lookup), [A15 trong API map](ui/staff/plans/00-staff-contract.md#api-theo-chức-năng), [checklist](ui/implementation-status.md). Chọn hợp đồng để xem không tự đổi linkedPolicy của chat; quick lookup trong Inbox và đổi ngữ cảnh chat làm sau khi có contract.

<a id="inbox-ticket-relocation"></a>
## Inbox/chat — đã gỡ bản thử, lập kế hoạch lại 03/11/2026

Theo yêu cầu người dùng, bản API/UI Inbox/Ticket vừa thử đã được gỡ. Không dùng kết quả test cũ làm nghiệm thu thiết kế mới.

Nguồn kế hoạch chi tiết: [inbox-plan.md](ui/staff/plans/inbox/00-inbox-spec.md). Bao gồm enum thực tế, All/Requests/Active, accordion tên-mã/tiêu đề/thời gian không counts, search tên-mã, chat cuộn, gate Direct/Accept và toàn bộ lịch sử Customer-facing sau Accept; schema/API vẫn chưa triển khai.

- [x] Gỡ implementation Inbox/Ticket cũ, cập nhật tài liệu.
- [x] Tạo kế hoạch chi tiết theo yêu cầu; chưa code thay thế.
- [x] Chốt filter/quyền/bỏ counts/Closed chat đích và ranh giới Ticket trong tài liệu.
- [ ] Viết/review các kế hoạch triển khai nhỏ trước migration/API.
- [ ] Read API/group/cursor rồi FE chat đúng bố cục, review trước phase ghi.
- [ ] Takeover/send/reconcile, Customer hai đầu và realtime; không coi composer disabled là chat đã xong.
- [ ] Tickets/panel phụ theo phase riêng sau khi chốt workflow.

## Kế hoạch hôm nay — 03/11/2026

Đề xuất phạm vi **hai bản sửa + một checkpoint chốt Inbox**, thực hiện tuần tự. Việc 01/02 đã triển khai và kiểm chứng; việc 03 đã cập nhật quyết định, chưa viết các file triển khai nhỏ hoặc code Inbox.

| Thứ tự | Việc và kế hoạch chi tiết | Kết quả cần có | Ước lượng chia buổi |
| --- | --- | --- | --- |
| 01 | [Retry khôi phục phiên](ui/staff/plans/auth/03-session-lifecycle.md) | Try again refetch tại chỗ, không F5; giữ role/next, chống request trùng/cũ; regression liên quan pass | 1–2 giờ |
| 02 | [Refresh Policy/PDF](ui/staff/plans/policies/04-viewer-lifecycle.md) | Cùng quyền/version không tháo viewer hoặc đổi src do realtime; expiry/revoke/version đổi vẫn đúng; regression liên quan pass | 2–3 giờ |
| 03 | [Chốt Inbox đợt đầu](ui/staff/plans/03-inbox-contract.md) | Review UX/API/data/read milestone, cập nhật inbox-plan.md; đủ cơ sở làm A08–10 và FE chat sau đó | 45–90 phút |

Ước lượng để giới hạn phạm vi, không là cam kết hoàn tất. Việc 01/02 phải đạt gate trước khi mở việc tiếp theo; nếu thiếu thời gian, chuyển việc 03 sang buổi sau. Không đánh dấu chat đã hoạt động từ việc chốt tài liệu.

- [x] 01: retry phiên không F5; đã tối ưu focus/visibility 30 giây, ready không gọi thừa, invalidation/expiry kiểm ngay. Bản FE mới qua lint/typecheck/Docker và 78 ca browser liên quan; xem Account và kết quả việc 01.
- [x] 02: giữ vòng đời PDF khi realtime, quyền/expiry đúng; Web lint/typecheck/Docker và 69 ca browser pass, thêm 3 ca tăng tải kiểm lại pass; chi tiết trong kết quả việc 02.
- [x] 03: cập nhật các quyết định người dùng chốt về filter/gate/lịch sử/counts/Closed/Ticket.
- [x] 03: viết [bảy phase triển khai Inbox](ui/staff/plans/03-inbox-contract.md), mỗi phase có API/luồng/test/vị trí code.
- [x] I01 model/quyền/legacy/receipt/sequence/reassignment đã triển khai 04/11, migration và test pass.
- [x] I02 A08/A09 read metadata/search/cursor đã triển khai/kiểm chứng 04/11, chưa nối UI.
- [x] I03 Customer entry/handoff/Accept/transcript/lookup đã deploy, 23 ca workflow pass.
- [x] I04 giao diện Staff Inbox/accordion/request/Accept/chat cuộn đã nối và kiểm chứng browser/gateway.
- [x] I05 gửi tin và UI Customer chat đã nối/kiểm chứng.
- [x] 04/11: người dùng xác nhận các chức năng I04/I05 còn lại test tay pass.
- [x] I06-A: tin SYSTEM trong chat sau Staff Accept, atomic/idempotent; [chi tiết](ui/staff/plans/inbox/06-realtime-routing.md).
- [x] I06-B: realtime và routing events.
- [ ] C01: AI Copilot riêng cho Staff theo panel mẫu, hỏi/tóm tắt/gợi ý trả lời/citations; [kế hoạch](ui/staff/plans/08-copilot-contract.md#c01--kế-hoạch-ai-copilot-riêng-cho-staff). Chốt Agent/checkpoint trước code, không sửa thêm UI Customer ở mốc này.

Đã bỏ enum ConversationStatus.CLOSED bằng migration riêng; giữ TicketStatus.CLOSED, lịch sử và audit dữ liệu cũ. I01 model quyền đã có từ 04/11; I02 read metadata/search/cursor đã có; I03 transcript/Accept/Customer entry đã có; I05 đã triển khai public send/Customer UI; I06 notification handoff đã có; chưa triển khai Ticket/Copilot, Product API, Customer Policy/PDF, cloud hoặc chuẩn hóa schema JSON tài liệu. Những phần đó vẫn nằm trong backlog, không bị loại bỏ khỏi yêu cầu.

## Sau phạm vi hôm nay

1. Theo [các phần Inbox](ui/staff/plans/03-inbox-contract.md): I01 model/quyền → I02 read metadata → I03 Customer entry/handoff/Accept/history → I04 Staff UI → I05 send/Customer UI → I06 realtime → I07 Ticket riêng. Bảy tài liệu đã viết; review từng phần trước code, không mở transcript tạm khi chưa Accept.
2. Chốt workflow request/consent/Accept/send/reconcile và Agent fence; Customer hai đầu/realtime. Ticket do Agent gợi ý/Customer xác nhận và Ticket+outbox là nhánh riêng, không tự tạo khi yêu cầu Staff. Notification/read markers/Copilot theo phần riêng.
3. Các phần song song chưa mở hôm nay: Product A17/A19, Customer ownership Policy/PDF, citations, quick lookup/chat linkedPolicy; Customer portal và E2E/CI/benchmark. Chi tiết/điều kiện đóng tại [G01–G10](ui/staff/plans/README.md#phần-còn-lại-theo-chức-năng), không làm lại Staff policy/PDF đã nối.

## Phần policy/PDF đã có và còn lại

- [x] MinIO private local, credential reader/writer tách quyền; Core đã nối SDK để cấp signed URL view/download Staff sau kiểm session/CSRF/assignment/phiên bản áp dụng, TTL mặc định 15 phút. Chưa dựng S3/cloud.
- [x] Bootstrap chung có 2 sản phẩm, 14 hợp đồng, 17 tài liệu/20 PDF version synthetic; chạy lại giữ dữ liệu đã sửa, kiểm checksum và phục hồi file fixture thiếu. Bộ mẫu riêng có sẵn được giữ.
- [x] Staff Customers → danh sách/chi tiết hợp đồng/catalog; PDF chính làm nội dung trung tâm, thông tin DB thu gọn, điều khoản/phụ lục tách riêng, xem/tải không reload.
- [x] Policy Lookup A15 và FE danh sách toàn tập assignment đã nối; browser regression tiếp tục ở mục QA.
- [x] Product API A17/P01 list/detail Core/gateway; UI chưa làm.
- [x] Product A19/access/P02 Core/MinIO/gateway; UI chưa làm.
- [ ] Customer ownership APIs và My policies/view/download; Customer Products UI, citations theo trang; quick lookup/context chat theo contract riêng.
- [ ] Browser regression có thể chạy lại cho search/filter/deep link, revoke/expiry, storage lỗi, Range/download, retry và keyboard/mobile. Không coi các kiểm thử API/file là nghiệm thu toàn bộ UI.

Đặc tả dùng chung ở [C05 Policy/PDF](ui/customer/plans/05-documents-contract.md#hướng-triển-khai-policypdf-đã-thống-nhất--31102026); trạng thái chính xác ở [Staff policies](ui/staff/plans/05-policies-contract.md) và [checklist](ui/implementation-status.md). Cloud/RDS, SLO/sizing/HA/DR vẫn cần phạm vi riêng. Giữ Core sở hữu quyền/nghiệp vụ, dữ liệu synthetic và lịch sử migration.

## Thiết kế, corpus và việc tiếp theo của Agent

Ngày **31/10/2026** đã tổng hợp [thiết kế Agent/RAG hiện hành](specifications/Agent_Design.md#design-overview). Graph, tool, context, hybrid retrieval, giao tiếp và yêu cầu checkpoint đã có hướng thống nhất; không cần brainstorm lại vì chưa có code. Phần Agent dừng ở tài liệu và kế hoạch; chưa triển khai runtime/retrieval/chunks/embedding. Phần app đã có các API và seed theo baseline ở trên.

Phạm vi sản phẩm MVP đã chốt ngày **28/10/2026**: **7 sản phẩm, gồm 4 chính và 3 bổ trợ**; xem [danh sách chuẩn](specifications/Agent_Design.md#mvp-products). Corpus Public có đủ 13 Markdown Public/243 trang, đã kiểm tra bằng AI; [báo cáo xử lý](../data/public/manulife/processing-review.md) ghi trạng thái duyệt và lỗi nguồn UL049 trang 29.

Đã bổ sung điều khoản Hành Trình Hạnh Phúc – Gia Tăng Bảo Vệ (25 trang scan). [Bản hợp đồng 65 trang đã khử định danh có dữ liệu demo](../data/private/manulife-demo-full-v1/README.md) được người dùng cho phép lưu Git ngày 03/11/2026; chưa duyệt cho RAG. PDF/bản thô/ảnh vẫn ngoài Git.

Sản phẩm chính/bổ trợ đã tham gia lấy theo từng hợp đồng Private; không cần ma trận ghép chung. Được [tra toàn bộ hồ sơ hợp đồng đã cấp quyền](specifications/Agent_Design.md#whole-contract-retrieval), gồm phụ lục/tài liệu kèm theo; không cần ma trận quyền theo từng Điều. Retrieval chỉ chọn đoạn liên quan vào context.

**Đã chốt ngày 30/10/2026:** [dữ liệu hợp đồng tối thiểu](specifications/Contract_Data_Design.md) giữ sản phẩm chính và danh sách mã bổ trợ/mức đầy đủ trong các trường hiện có; chi tiết còn lại dùng RAG. Hai tool đọc, lỗi/retry và giới hạn thử nghiệm đã thống nhất trong thiết kế Agent; schema local chưa thay đổi theo thiết kế này.

Chat chung cho Staff không gắn Customer **tạm hoãn theo người dùng ngày 28/10/2026**, do khác biệt tài liệu và ảnh hưởng schema/UI. Giữ phạm vi local hiện tại để tiếp tục thiết kế Agent/RAG; không sửa schema/UI hoặc coi yêu cầu chat chung đã bị loại bỏ.

## Công việc tiếp theo

1. **Review một bản thiết kế tổng thể:** đọc [bản tổng hợp](specifications/Agent_Design.md#design-overview), chỉ bổ sung quyết định thực sự thiếu. Không yêu cầu người dùng chọn từng tên trường/mã lỗi.
2. **Hoàn thiện một gói đặc tả thực thi:** state/contracts, API/tool, đồng bộ lịch sử, HMAC, điều phối và bảo vệ checkpoint/giao kết quả. Người thực hiện tự đề xuất chi tiết thông thường, review cơ chế cạnh tranh/khôi phục trước khi triển khai phần đó. Chưa chọn cơ chế khóa/queue từ bước này.
3. **Chọn những phần còn mở trước khi dùng:** provider/model sinh và embedding trong hướng Managed Model API đã chọn; xác nhận Ticket; chính sách phiên/tiếp quản và lưu/xóa dữ liệu. Xem [phân loại đầy đủ](specifications/Agent_Design.md#remaining-work). Không cản đặc tả phần độc lập chỉ vì chưa chọn hết.
4. **Chuẩn bị phép thử khi được yêu cầu triển khai:** hoàn thiện fixture/mapping và corpus được duyệt, dùng cùng bộ câu hỏi để đo chunk/search/reranker/context và hiệu chỉnh giới hạn. API Core và Agent có thể phát triển theo contracts/mocks synthetic; tích hợp phải kiểm quyền thật.

Đã chọn parent–child và tham chiếu chéo; cỡ chunk/giới hạn mở rộng/tham số ranking cần đo, không phải kiến trúc chưa chọn. Lỗi nguồn UL049 trang 29 và duyệt nghiệp vụ corpus vẫn được theo dõi tại báo cáo xử lý. Chưa tạo chunks/embeddings hoặc nạp database. RDS, triển khai cloud, sizing/HA–DR, tự host và queue mới để giai đoạn có yêu cầu tương ứng.

Ngày **29/10/2026** đã có [hợp đồng synthetic](../data/synthetic/manulife-demo-v1/README.md) được viết mới theo bố cục trường thông tin đã tham khảo: Markdown, JSON, manifest và 15 đáp án đối chiếu. Đã kiểm tra nhất quán tĩnh; chưa seed, chunk, embedding hoặc chạy Agent/RAG. Phí/quyền lợi bổ trợ demo chỉ là dữ liệu thử, chưa ánh xạ sản phẩm thương mại hoặc kiểm định định phí.
