# Phạm vi hiện tại và hướng phát triển

Đối chiếu **02/11/2026**. Chi tiết duy nhất về trạng thái màn hình và gap nằm ở [checklist UI](ui/implementation-status.md); đọc [chỉ mục UI](ui/README.md) theo thứ tự. Setup/vận hành ở [getting-started](getting-started.md), quyết định còn mở ở [source-review](source-review.md).

## Đã có

- [x] Compose Web/Core/Nginx/PostgreSQL/DbGate/MinIO private; migration/seed synthetic và operator local tách public app.
- [x] Auth/session/đổi password/logout, hồ sơ Customer/Staff contact và Staff assigned-customer list/detail/pagination.
- [x] Staff UI từ mẫu, Customers riêng, account page/menu, routes/deep link/shared layout; English/Lexend/fullscreen và dọn preview/dead UI.
- [x] InsurancePolicy/PolicyStatus/insurance_policies bằng migration mới.
- [x] WebSocket receive-only invalidation account/profile/assignment; REST resync/refresh nền. Chưa realtime chat/Ticket/notification.

## Staff Policy Lookup — đã triển khai 02/11/2026

A15 và FE Policy Lookup hai cột đã triển khai 02/11/2026. Phần đọc chi tiết/catalog, xem/tải PDF Staff và bootstrap hợp đồng đã có; không làm lại các phần này.

- [x] **Core A15:** `GET /api/v1/staff/policies` dùng session Staff và chỉ lấy hợp đồng của khách đang được phân công. Search số hợp đồng, tên/mã khách, mã/tên sản phẩm; lọc/count toàn tập đúng quyền trước phân trang, thứ tự ổn định. Không tìm CCCD/phone, không nhận actor/role từ client.
- [x] **Search/filter:** hỗ trợ All/Active/Lapsed/Matured/Pending đúng enum DB, page/pageSize và search; kiểm input, giới hạn và literal search theo baseline Customers. Clear search luôn có vị trí cố định. Chốt DTO/query trong API map trước code.
- [x] **FE hai cột:** trái là kết quả gồm số hợp đồng, khách hàng, sản phẩm, trạng thái và phân trang; phải tái sử dụng phần xem PDF chính, thông tin thu gọn, điều khoản/phụ lục và tải hiện có. Màn hình hẹp chuyển danh sách → chi tiết, có quay lại giữ trạng thái.
- [x] **Dọn UI mẫu:** bỏ Back to Inbox ở trang độc lập; đổi tiêu đề thành Policy Lookup; thay filter In-Force/Grace Period/Review và placeholder CCCD/phone bằng tiêu chí được hỗ trợ.
- [x] **Thu gọn cột kết quả:** icon trong ô tìm kiếm, icon mở lại ở mép khi đóng; không chữ Hide results, giữ nội dung nhập/bộ lọc/trang/hợp đồng. Header dossier gọn, không có Customer profile; PDF vừa chiều ngang.
- [x] **Điều hướng:** giữ search/status/page và lựa chọn hợp đồng khi mở/quay lại, hỗ trợ Back/Forward/deep link. Search/Clear/filter/phân trang/retry/chọn hợp đồng không reload document hay remount workspace. Không đưa returnTo dài hoặc signed URL lên URL ứng dụng.
- [x] **Trạng thái và kiểm chứng đã có:** loading/empty/error/retry, 10 Policy integration + 6 HTTP/realtime tests; browser smoke search/filter/phân trang/PDF/URL/keyboard/mobile và thu gọn cột kết quả.
- [ ] **QA còn lại:** browser E2E tự động trong repo/CI; lỗi mạng/storage/expiry và thu hồi quyền đầy đủ trên UI.

Nguồn chi tiết: [Staff policies](ui/staff/policies.md#kế-hoạch-tiếp-theo-policy-lookup-a15), [A15 trong API map](ui/staff/api-map.md), [checklist](ui/implementation-status.md). Chọn hợp đồng để xem không tự đổi linkedPolicy của chat; quick lookup trong Inbox và đổi ngữ cảnh chat làm sau khi có contract.

## Thứ tự tiếp theo đề xuất

1. **G05 — regression và copy:** Customers search toàn tập assignment/count/phân trang và Try again đã nối 31/10; còn browser regression search/URL/retry/realtime, copy/tooltip Policy Lookup/New. Không đưa lại nút Refresh trên header.
2. **G01/G02 — Policy Lookup/context:** A14/A16/A18/A20 Staff và seed đã có; A15/FE theo kế hoạch trên đã nối. Customer ownership và quick lookup/context còn thiếu. Tách policy đang xem với policy gắn hội thoại; contract đổi liên kết chưa có.
3. **G03 — product/document/PDF:** catalog, mapping policy–version áp dụng, quyền xem có hạn và citations. Không tự dùng currentVersion hoặc mở upload.
4. **G04 — Inbox/Ticket:** chốt New/filter, list/transcript/version/idempotency. Theo yêu cầu 31/10, hỗ trợ cả Customer chủ động yêu cầu Staff và Agent gợi ý được khách đồng ý/xác nhận gửi; Core commit Ticket+outbox rồi phát thông báo, Staff tiếp nhận và trả lời trong cùng cuộc, chặn Agent ghi/trả lời muộn. API A07–13/A21–23 và contract tạo/xác nhận Customer/Agent còn cần thiết kế. Xem [luồng chuyển sang Staff](ui/customer/chat.md#6-chuyển-từ-agent-sang-staff--yêu-cầu-31102026).
5. **G06/G07 — Agent và notifications:** actor/tool scope, retrieval/version, checkpoint bền vững, Copilot/history/summary; recipient Staff/Customer, outbox delivery/read/dedup/reconnect. Chưa chốt provider/model/queue/production transport.
6. **G08/G09 — hoàn thiện Customer portal và kiểm chứng:** menu/style mới trên các read API dùng chung; E2E được version/CI, keyboard/mobile có dữ liệu, concurrency và benchmark.

## Phần policy/PDF đã có và còn lại

- [x] MinIO private local, credential reader/writer tách quyền; Core đã nối SDK để cấp signed URL view/download Staff sau kiểm session/CSRF/assignment/phiên bản áp dụng, TTL mặc định 15 phút. Chưa dựng S3/cloud.
- [x] Bootstrap chung có 2 sản phẩm, 14 hợp đồng, 17 tài liệu/20 PDF version synthetic; chạy lại giữ dữ liệu đã sửa, kiểm checksum và phục hồi file fixture thiếu. Bộ mẫu riêng có sẵn được giữ.
- [x] Staff Customers → danh sách/chi tiết hợp đồng/catalog; PDF chính làm nội dung trung tâm, thông tin DB thu gọn, điều khoản/phụ lục tách riêng, xem/tải không reload.
- [x] Policy Lookup A15 và FE danh sách toàn tập assignment đã nối; browser regression tiếp tục ở mục QA.
- [ ] Customer ownership APIs và My policies/view/download; Product API A17/A19, citations theo trang; quick lookup/context chat theo contract riêng.
- [ ] Browser regression có thể chạy lại cho search/filter/deep link, revoke/expiry, storage lỗi, Range/download, retry và keyboard/mobile. Không coi các kiểm thử API/file là nghiệm thu toàn bộ UI.

Đặc tả dùng chung ở [C05 Policy/PDF](ui/customer/documents.md#hướng-triển-khai-policypdf-đã-thống-nhất--31102026); trạng thái chính xác ở [Staff policies](ui/staff/policies.md) và [checklist](ui/implementation-status.md). Cloud/RDS, SLO/sizing/HA/DR vẫn cần phạm vi riêng. Giữ Core sở hữu quyền/nghiệp vụ, dữ liệu synthetic và lịch sử migration.

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
