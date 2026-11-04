# C03 — Customer Products

04/11/2026 · **Chưa triển khai** · C03 · [Chung](00-customer-contract.md).

## 1. Căn cứ và owner

FR-008: tra cứu sản phẩm/tài liệu bằng tay. InsuranceProduct chỉ có name/code/summary/isActive; nội dung đầy đủ đọc từ PDF PUBLIC đã công bố, không giả pricing/benefit data. Core dùng chung do [Staff P01/P02](../../staff/plans/04-products-contract.md) sở hữu; Customer không mở một bộ catalog/access endpoint khác.

Phạm vi dùng chung đã được người dùng chốt **04/11/2026** tại contract Staff: catalog active, tên/mã/summary từ DB và nội dung đầy đủ trong PDF PUBLIC cho hai role đã đăng nhập; dùng currentVersion công bố, không thay applied version của hợp đồng. Chưa thêm bảng quyền lợi/bảng giá. Đây là quyết định nghiệp vụ; API/UI Customer vẫn chưa triển khai.

| Phase | Phạm vi | Cần trước |
| --- | --- | --- |
| [PR01](products/01-catalog-ui.md) | List/search/detail Customer | H01 và Staff P01 |
| [PR02](products/02-product-documents-ui.md) | Catalog PDF PUBLIC, xem/tải | PR01 và Staff P02; dùng lifecycle viewer D02 |

## 2. Contract và gate

A17/P01 và A19/access/P02 đã E và được test cho cả hai role; PR01/PR02 Customer UI chưa triển khai. Product active catalog không thay policy cá nhân; người xem product không được cấp PRIVATE_POLICY. Không mua/đăng ký hợp đồng, calculator, chat context hoặc gợi ý Agent trong phase này. Viewer lifecycle có thể hoàn thiện trước C05 ownership API vì nguồn PUBLIC độc lập; không chờ Agent.

- [ ] PR01/PR02 thật, keyboard/mobile/errors và no-F5 pass.
- [ ] Shared endpoint permission test cả hai role; Customer UI không dùng Staff policy quyền.
- [ ] FR-008 vẫn ghi phần Customer policy/PDF riêng nếu chưa xong C04/C05.

## UX và baseline của chức năng

## Mục đích và thành phần dự kiến

Danh sách/chi tiết name/code/summary và tài liệu PUBLIC có phiên bản. Model chưa có bảng quyền lợi/giá sản phẩm; quyền lợi/điều khoản đầy đủ đọc trong PDF đã phát hành, không giả cấu trúc từ summary hoặc trích PDF để lấp dữ liệu.

## Thao tác dự kiến

1. Mở Products, tìm/chọn sản phẩm trong catalog được Core cung cấp.
2. A17 list/detail và A19/access PUBLIC current version đã E cho hai role đã đăng nhập; chưa nút UI runtime.
3. Nội dung công khai không tự xác nhận quyền lợi của policy cá nhân.

## Checklist còn lại

- [x] P01: API catalog/search/page/detail dùng chung đã test Core/gateway; chưa UI.
- [x] P02: tài liệu PUBLIC/current-version/access gate đã kiểm Core/MinIO/gateway; UI PR01/PR02 còn riêng.
- [ ] Danh sách/chi tiết/PDF, loading/rỗng/lỗi và xử lý tài liệu không khả dụng.
- [ ] Phân biệt Public với Private, mở tài liệu đúng version.

Các phần dự kiến không phải contract đã duyệt; Core kiểm quyền, Agent không truy cập business DB. Thuật ngữ UI tiếng Anh dùng Policy.
