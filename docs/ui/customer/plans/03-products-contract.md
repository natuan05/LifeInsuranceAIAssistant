# C03 — Customer Products

05/11/2026 · **Đã triển khai** · C03 · [Chung](00-customer-contract.md).

## 1. Căn cứ và owner

FR-008: tra cứu sản phẩm/tài liệu bằng tay. InsuranceProduct chỉ có name/code/summary/isActive; nội dung đầy đủ đọc từ PDF PUBLIC đã công bố, không giả pricing/benefit data. Core dùng chung do [Staff P01/P02](../../staff/plans/04-products-contract.md) sở hữu; Customer dùng chung các endpoint catalog và document access đã được kiểm thử chặt chẽ.

Phạm vi dùng chung: catalog active, tên/mã/summary từ DB và nội dung tài liệu đầy đủ trong PDF PUBLIC cho hai role đã đăng nhập; dùng `currentVersion` công bố, không thay applied version của hợp đồng.

| Phase | Phạm vi | Trạng thái |
| --- | --- | --- |
| [PR01](products/01-catalog-ui.md) | List/search/detail Customer | Đã triển khai |
| [PR02](products/02-product-documents-ui.md) | Catalog PDF PUBLIC, xem/tải | Đã triển khai |

## 2. Contract và gate

A17/P01 và A19/access/P02 dùng chung cho cả hai role. PR01/PR02 Customer UI đã hoàn tất triển khai:
- Danh sách giải pháp bảo hiểm với ô tìm kiếm theo tên hoặc mã sản phẩm.
- Cơ chế xem chi tiết sản phẩm (`View Details`): Người dùng bấm vào nút *View Details* hoặc bấm trực tiếp vào thẻ sản phẩm để mở màn hình chi tiết giải pháp kèm nút quay lại *← Back to Solutions*.
- Không bắt buộc luồng chat: Bỏ nút *Request Quote from Advisor →* tự động chuyển tab chat; khách hàng chủ động vào tab Conversations khi cần trò chuyện với AI/Staff.
- Tích hợp tài liệu điều khoản chính thức (`PR02`): Tải tài liệu qua `readProductDocuments`, chọn phiên bản tài liệu và nhúng `SignedPdfPreview` cho phép xem PDF trực tiếp và tải về an toàn.

- [x] PR01/PR02 thật, keyboard/mobile/errors và no-F5 pass.
- [x] Shared endpoint permission test cả hai role; Customer UI dùng đúng quyền của Customer session.
- [x] Giao diện 100% tiếng Anh nhất quán.

## 3. Checklist đã hoàn thành

- [x] P01: API catalog/search/page/detail dùng chung đã test Core/gateway.
- [x] P02: tài liệu PUBLIC/current-version/access gate đã kiểm Core/MinIO/gateway.
- [x] UI danh sách giải pháp, tìm kiếm, xem chi tiết và nút Back to Solutions.
- [x] Xem tài liệu PDF trực tiếp trong portal và tải PDF về máy.
- [x] Tách biệt rõ giữa xem danh mục giải pháp và luồng chat tư vấn theo yêu cầu người dùng.
