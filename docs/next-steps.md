# Phạm vi hiện tại và hướng phát triển

Đối chiếu **31/10/2026**. Chi tiết duy nhất về trạng thái màn hình và gap nằm ở [checklist UI](ui/implementation-status.md); đọc [chỉ mục UI](ui/README.md) theo thứ tự. Setup/vận hành ở [getting-started](getting-started.md), quyết định còn mở ở [source-review](source-review.md).

## Đã có

- [x] Compose Web/Core/Nginx/PostgreSQL/DbGate/MinIO private; migration/seed synthetic và operator local tách public app.
- [x] Auth/session/đổi password/logout, hồ sơ Customer/Staff contact và Staff assigned-customer list/detail/pagination.
- [x] Staff UI từ mẫu, Customers riêng, account page/menu, routes/deep link/shared layout; English/Lexend/fullscreen và dọn preview/dead UI.
- [x] InsurancePolicy/PolicyStatus/insurance_policies bằng migration mới.
- [x] WebSocket receive-only invalidation account/profile/assignment; REST resync/refresh nền. Chưa realtime chat/Ticket/notification.

## Ưu tiên tiếp theo đã chốt: Staff Policy Lookup

Đây là kế hoạch tiếp theo, **chưa triển khai A15**. Phần đọc chi tiết/catalog, xem/tải PDF Staff và bootstrap hợp đồng đã có; không làm lại các phần này.

- [ ] **Core A15:** `GET /api/v1/staff/policies` dùng session Staff và chỉ lấy hợp đồng của khách đang được phân công. Search số hợp đồng, tên/mã khách, mã/tên sản phẩm; lọc/count toàn tập đúng quyền trước phân trang, thứ tự ổn định. Không tìm CCCD/phone, không nhận actor/role từ client.
- [ ] **Search/filter:** hỗ trợ All/Active/Lapsed/Matured/Pending đúng enum DB, page/pageSize và search; kiểm input, giới hạn và literal search theo baseline Customers. Clear search luôn có vị trí cố định. Chốt DTO/query trong API map trước code.
- [ ] **FE hai cột:** trái là kết quả gồm số hợp đồng, khách hàng, sản phẩm, trạng thái và phân trang; phải tái sử dụng phần xem PDF chính, thông tin thu gọn, điều khoản/phụ lục và tải hiện có. Màn hình hẹp chuyển danh sách → chi tiết, có quay lại giữ trạng thái.
- [ ] **Dọn UI mẫu:** bỏ Back to Inbox ở trang độc lập; đổi tiêu đề thành Policy Lookup; thay filter In-Force/Grace Period/Review và placeholder CCCD/phone bằng tiêu chí được hỗ trợ.
- [ ] **Điều hướng:** giữ search/status/page và lựa chọn hợp đồng khi mở/quay lại, hỗ trợ Back/Forward/deep link. Search/Clear/filter/phân trang/retry/chọn hợp đồng không reload document hay remount workspace. Không đưa returnTo dài hoặc signed URL lên URL ứng dụng.
- [ ] **Trạng thái và QA:** loading, rỗng/không kết quả, lỗi/retry riêng; khóa/thu hồi phiên/chuyển phân công phải xóa nội dung ngoài quyền. Kiểm search toàn tập, lọc trước count/phân trang, không lộ hợp đồng Staff khác, null/thiếu PDF, URL và keyboard/mobile. Tiếp tục Tailwind, không chụp screenshot ở trạng thái pass, không tạo report mới.

Nguồn chi tiết: [Staff policies](ui/staff/policies.md#kế-hoạch-tiếp-theo-policy-lookup-a15), [A15 trong API map](ui/staff/api-map.md), [checklist](ui/implementation-status.md). Chọn hợp đồng để xem không tự đổi linkedPolicy của chat; quick lookup trong Inbox và đổi ngữ cảnh chat làm sau khi có contract.

## Thứ tự tiếp theo đề xuất

1. **G05 — regression và copy:** Customers search toàn tập assignment/count/phân trang và Try again đã nối 31/10; còn browser regression search/URL/retry/realtime, copy/tooltip Policy Lookup/New. Không đưa lại nút Refresh trên header.
2. **G01/G02 — Policy Lookup/context:** A14/A16/A18/A20 Staff và seed đã có; ưu tiên A15/FE theo kế hoạch trên. Customer ownership còn thiếu. Tách policy đang xem với policy gắn hội thoại; contract đổi liên kết chưa có.
3. **G03 — product/document/PDF:** catalog, mapping policy–version áp dụng, quyền xem có hạn và citations. Không tự dùng currentVersion hoặc mở upload.
4. **G04 — Inbox/Ticket:** chốt New/filter, list/transcript/version/idempotency. Theo yêu cầu 31/10, hỗ trợ cả Customer chủ động yêu cầu Staff và Agent gợi ý được khách đồng ý/xác nhận gửi; Core commit Ticket+outbox rồi phát thông báo, Staff tiếp nhận và trả lời trong cùng cuộc, chặn Agent ghi/trả lời muộn. API A07–13/A21–23 và contract tạo/xác nhận Customer/Agent còn cần thiết kế. Xem [luồng chuyển sang Staff](ui/customer/chat.md#6-chuyển-từ-agent-sang-staff--yêu-cầu-31102026).
5. **G06/G07 — Agent và notifications:** actor/tool scope, retrieval/version, checkpoint bền vững, Copilot/history/summary; recipient Staff/Customer, outbox delivery/read/dedup/reconnect. Chưa chốt provider/model/queue/production transport.
6. **G08/G09 — hoàn thiện Customer portal và kiểm chứng:** menu/style mới trên các read API dùng chung; E2E được version/CI, keyboard/mobile có dữ liệu, concurrency và benchmark.

## Phần policy/PDF đã có và còn lại

- [x] MinIO private local, credential reader/writer tách quyền; Core đã nối SDK để cấp signed URL view/download Staff sau kiểm session/CSRF/assignment/phiên bản áp dụng, TTL mặc định 15 phút. Chưa dựng S3/cloud.
- [x] Bootstrap chung có 2 sản phẩm, 14 hợp đồng, 17 tài liệu/20 PDF version synthetic; chạy lại giữ dữ liệu đã sửa, kiểm checksum và phục hồi file fixture thiếu. Bộ mẫu riêng có sẵn được giữ.
- [x] Staff Customers → danh sách/chi tiết hợp đồng/catalog; PDF chính làm nội dung trung tâm, thông tin DB thu gọn, điều khoản/phụ lục tách riêng, xem/tải không reload.
- [ ] Policy Lookup A15 và danh sách toàn tập assignment: ưu tiên ngay theo kế hoạch trên.
- [ ] Customer ownership APIs và My policies/view/download; Product API A17/A19, citations theo trang; quick lookup/context chat theo contract riêng.
- [ ] Browser regression có thể chạy lại cho search/filter/deep link, revoke/expiry, storage lỗi, Range/download, retry và keyboard/mobile. Không coi các kiểm thử API/file là nghiệm thu toàn bộ UI.

Đặc tả dùng chung ở [C05 Policy/PDF](ui/customer/documents.md#hướng-triển-khai-policypdf-đã-thống-nhất--31102026); trạng thái chính xác ở [Staff policies](ui/staff/policies.md) và [checklist](ui/implementation-status.md). Cloud/RDS, SLO/sizing/HA/DR vẫn cần phạm vi riêng. Giữ Core sở hữu quyền/nghiệp vụ, dữ liệu synthetic và lịch sử migration.
