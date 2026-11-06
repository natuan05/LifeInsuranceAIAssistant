# C04 — My policies theo ownership

05/11/2026 · **Đã triển khai** · C04 · [Chung](00-customer-contract.md).

## 1. Căn cứ và baseline

FR-008/UC-007; CustomerProfile 1–N InsurancePolicy N–1 InsuranceProduct. Staff read/PDF đã chạy; Customer chưa có policy controller. `PolicyService` hiện bọc read Staff-only, dù catalog nội bộ có role Customer cho citations; không coi helper này là Customer public API đã có.

| Phase | Kết quả | Phụ thuộc |
| --- | --- | --- |
| [PO01](policies/01-owner-read-api.md) | List/detail chính owner, projection/parser dùng chung | Auth E, không cần Agent |
| [PO02](policies/02-policy-ui.md) | My policies/list/detail thông tin gọn | H01+PO01; PDF D01/D02 riêng |

## 2. Quy tắc dữ liệu và UI

Các field financial/date từ InsurancePolicy và snapshot whitelist, không trích PDF để giả summary. Null là chưa cung cấp, decimal string không mất chính xác; nextDueDate không phải lịch sử đã đóng phí. Product inactive không ẩn policy owner đang có. PDF chính là nội dung đầy đủ; thông tin cấu trúc thu gọn cho tra cứu nhanh, không một tab dài chồng card như bản thử.

Không thay `linkedPolicyId` cuộc chat khi mở policy; Hỏi về policy phụ thuộc CH02, không chặn PO01/PO02. Không mua/hủy/sửa hợp đồng, thanh toán hoặc tự cấp quyền qua customerId.

- [x] PO01 owner/negative tests, PO02 URL/state/accessibility pass.
- [x] D01/D02 mới đóng phần xem/tải file; list/detail thành công đáp ứng NFR-007.

## UX và baseline của chức năng

## Mục đích và thành phần dự kiến

Danh sách policy, sản phẩm/status/ngày hiệu lực, quyền lợi/sum assured và kỳ phí từ Core.

## Thao tác dự kiến

1. Mở My policies, chọn một policy theo id; một Customer có thể có nhiều policy.
2. Xem coverage/premium/next due date từ nguồn Core; null không mặc định 0 hoặc đã đóng phí.
3. Mở tài liệu đúng version hoặc Hỏi về policy này sau khi có chat/context contract.

## Phạm vi triển khai tiếp — 31/10/2026

Trang My policies cần list/detail từ DB và bản PDF hợp đồng chi tiết có sẵn trong object storage private. Thông tin nghiệp vụ trên web giúp đọc nhanh; phần đầy đủ đọc bằng viewer Xem PDF trong app, kèm nút Tải PDF đúng phiên bản. Không cần lưu toàn bộ văn bản PDF vào DB hoặc nhân đôi thành trang HTML chi tiết. Điều khoản/phụ lục là tài liệu liên quan riêng, không dùng PDF sản phẩm chung thay hợp đồng cá nhân.

Core xác minh Customer từ phiên và ownership ở mỗi API; không dùng API Staff hoặc ID do client gửi để tự cấp quyền. Chọn hợp đồng/tài liệu, xem/zoom/tải và retry không reload kiểu F5; giữ URL/back và focus phù hợp. Khi chưa có tài liệu vẫn xem thông tin hợp đồng và trạng thái chưa có PDF. Luồng Hỏi về policy này tiếp tục phụ thuộc chat/context, không chặn việc triển khai policy read/PDF.

Đặc tả tài liệu phía Customer ở [Xem/tải tài liệu](05-documents-contract.md#2-nguồn-và-phân-loại).

## Checklist còn lại

- [x] Duyệt API ownership list/detail Customer; không dùng Staff API thay quyền Customer.
- [x] UI list/detail, pagination/filter theo contract; loading/rỗng/lỗi/thu hồi quyền.
- [x] Tách policy đang xem với policy liên kết chat, liên kết PDF và context rõ ràng.
- [x] Xem PDF trong app và Tải PDF đúng version, cùng nguồn file với phía Staff, kiểm ownership khi cấp quyền truy cập.
- [x] Kiểm thử synthetic cô lập: khách không có/một/nhiều policy, field null và policy chưa có tài liệu; không thêm seed cá nhân vào bootstrap hoặc tài liệu chung.

Các phần dự kiến không phải contract đã duyệt; Core kiểm quyền, Agent không truy cập business DB. Thuật ngữ UI tiếng Anh dùng Policy.
