# C02 — Workspace Customer và Home nhẹ

05/11/2026 · **Đã triển khai** · [Chung](00-customer-contract.md) · C02.

## Truy vết data model và vị trí code theo phase

Mỗi phase dưới đây có bảng cột/đọc–ghi/FK/version, migration, transaction và mức ảnh hưởng chi tiết; xem mục **Data model và phạm vi ảnh hưởng** và bảng **Vị trí code** trong phase. Hiện có file không đồng nghĩa mọi thay đổi dự kiến trong file đã được triển khai. Các phần P giữ P.

| Phase sở hữu | Bảng/dữ liệu chính và thao tác | Code cần rà từ root repo | Mức ảnh hưởng khi sửa |
| --- | --- | --- | --- |
| [H01 — Shell, routes và chuyển tiếp giao diện hiện có](home/01-shell-navigation.md) | users + customer_profiles (Đọc own profile); staff_assignments + customer_profiles + staff_profiles (Đọc) | [apps/web/src/components/customer-workspace.tsx](<../../../../apps/web/src/components/customer-workspace.tsx>); [apps/web/src/components/customer-header.tsx](<../../../../apps/web/src/components/customer-header.tsx>) | Trung bình — Home/Products/Policies/Conversations/Tickets/Account |
| [H02 — Home từ nguồn dữ liệu có thật](home/02-home-composition.md) | insurance_policies + insurance_products (Đọc); users + customer_profiles (Đọc own profile); staff_assignments + customer_profiles + staff_profiles (Đọc) | [apps/web/src/components/customer-home.tsx](<../../../../apps/web/src/components/customer-home.tsx>); [apps/web/src/components/customer-workspace.tsx](<../../../../apps/web/src/components/customer-workspace.tsx>) | Trung bình — Không đổi model tiền/ngày |

Không tự áp dụng DDL khi triển khai UI, không biến model dự kiến thành hiện trạng, không reset seed/volume để né lỗi FK. Các dependency xuyên vai trò và operator xem [Data Model](../../../specifications/Data_Model.md#iii-bản-đồ-tác-động-khi-triển-khai-chức-năng).

## 1. Căn cứ và giới hạn

Home/dashboard là cách tổ chức UX cho FR-002/008, không một FR Must về metrics. Không tạo counts/summary endpoint hoặc bịa dữ liệu để có dashboard. Giữ profile/contact/chat/account thật, rồi thêm lối vào chức năng đã hoàn tất.

## 2. Phase

| Phase | Kết quả | Gate |
| --- | --- | --- |
| [H01](home/01-shell-navigation.md) | Customer shell/menu/routes, legacy link và auth state | Chat/profile/account không mất |
| [H02](home/02-home-composition.md) | Home gọn từ dữ liệu đã có, shortcut tới feature thật | H01; policy/product shortcut chỉ khi route chạy |

## 3. Contract và nghiệm thu

Không API mới cho H01/H02. H01 dùng auth hiện có và adapter route, H02 GET `/customers/me`; đọc owner policy API PO01 để hiển thị số lượng hợp đồng hiệu lực và tổng giá trị bảo vệ thực tế (tính từ sumAssured của các hợp đồng ACTIVE, không bịa số liệu). Lịch đóng phí lấy từ nextDueDate đã lưu. Notification center trong toolbar popover hỗ trợ đếm chưa đọc và đánh dấu đọc.

- [x] H01: shell điều hướng sidebar desktop/drawer mobile, thanh toolbar, account menu popover (`CustomerAccountMenu`), notifications center.
- [x] H02: Home bố cục rõ ràng: Hero banner, tổng giá trị bảo vệ thực tế, lối tắt dịch vụ nhanh, danh sách giải pháp nổi bật và thẻ Assigned Support Staff (tiêu đề đen tiêu chuẩn, bỏ nhãn thừa). Bỏ card Paperless Policy tĩnh theo yêu cầu UX.
- [x] DOM/keyboard/mobile/no-F5 và gateway E2E theo phase; 100% tiếng Anh nhất quán.

## UX và baseline của chức năng

## Mục đích và thành phần dự kiến

Xem nhanh policy/kỳ phí từ Core, Staff phụ trách và lối tắt policy/trợ lý.

## Thao tác dự kiến

1. Từ menu mở Home; dùng GET own profile/contact và lối tắt tới route đã triển khai. Không cần API summary/counts riêng để dựng dashboard.
2. Bấm policy mở chi tiết đúng id; kỳ phí không có dữ liệu không chuyển thành đã thanh toán.
3. Mở Conversations trên chat I03–I06 đang có; AI trả lời/context Agent thật ở nhánh CH02/CH03.

- [x] Hồ sơ/Staff contact hiện có qua C08.
- [x] Tích hợp portfolio overview từ PO01 policies thật và liên kết Products thật.

## Checklist còn lại

- [x] Shell H01 và Home H02 gọn từ dữ liệu thật; không charts/metrics hoặc endpoint tổng quan thừa.
- [x] Loading/rỗng/lỗi; chưa có policy/Staff vẫn sử dụng các phần được phép.
- [x] Lối tắt policy/chat và menu Customer mới.
- [x] Phân biệt rõ title browser giữa Customer Portal (`AegisLife · Customer Portal`) và Staff Portal.
