# C05 — Policy PDF: exact version và ownership

05/11/2026 · **Đã triển khai** · C05 · [Chung](00-customer-contract.md).

## Truy vết data model và vị trí code theo phase

Mỗi phase dưới đây có bảng cột/đọc–ghi/FK/version, migration, transaction và mức ảnh hưởng chi tiết; xem mục **Data model và phạm vi ảnh hưởng** và bảng **Vị trí code** trong phase. Hiện có file không đồng nghĩa mọi thay đổi dự kiến trong file đã được triển khai. Các phần P giữ P.

| Phase sở hữu | Bảng/dữ liệu chính và thao tác | Code cần rà từ root repo | Mức ảnh hưởng khi sửa |
| --- | --- | --- | --- |
| [D01 — Customer policy catalog và cấp quyền PDF](documents/01-owner-document-access.md) | insurance_policies + insurance_products (Đọc); documents + document_versions (Đọc); MinIO/S3 — ngoài PostgreSQL (Đọc/ký, không upload/overwrite) | [apps/core/src/policies/controllers/customer-policy.controller.ts](<../../../../apps/core/src/policies/controllers/customer-policy.controller.ts>); [apps/core/src/policies/services/policy.service.ts](<../../../../apps/core/src/policies/services/policy.service.ts>) | Cao — Customer PDF access |
| [D02 — Customer policy PDF và vòng đời viewer](documents/02-pdf-viewer-ui.md) | insurance_policies + insurance_products (Đọc); documents + document_versions (Đọc); MinIO/S3 — ngoài PostgreSQL (Đọc/ký, không upload/overwrite) | [apps/web/src/components/customer-policies.tsx](<../../../../apps/web/src/components/customer-policies.tsx>); [apps/web/src/components/signed-pdf-preview.tsx](<../../../../apps/web/src/components/signed-pdf-preview.tsx>) | Cao — Customer policy summary và document panel |

Không tự áp dụng DDL khi triển khai UI, không biến model dự kiến thành hiện trạng, không reset seed/volume để né lỗi FK. Các dependency xuyên vai trò và operator xem [Data Model](../../../specifications/Data_Model.md#iii-bản-đồ-tác-động-khi-triển-khai-chức-năng).

## 1. Căn cứ và baseline

FR-008/UC-007/NFR-007. MinIO private, reader credential, SDK, signed link và Staff catalog/view/download đã chạy; Customer sử dụng các endpoint owner riêng được kiểm soát quyền chặt chẽ.

| Phase | Kết quả | Phụ thuộc | Trạng thái |
| --- | --- | --- | --- |
| [D01](documents/01-owner-document-access.md) | Owner policy catalog + cấp link exact applied version | PO01/access helper, storage E | Đã triển khai |
| [D02](documents/02-pdf-viewer-ui.md) | PDF chính, supporting docs, download/lifecycle | H01+PO02+D01 | Đã triển khai |

## 2. Nguồn và phân loại

- Loại tài liệu `POLICY`, `POLICY_DRAFT`, `TERMS`, `PRODUCT_GUIDE`, `ENDORSEMENT` được xác định từ binding chính xác trong `InsurancePolicy.benefitsSnapshot.documents`.
- Không suy từ title hay đuôi file.
- Hợp đồng hiển thị bản PDF chính thức, danh mục điều khoản phụ lục kèm theo, và cho phép tải bản gốc về máy.

## 3. Checklist hoàn tất

- [x] D01: API catalog tài liệu và cấp quyền xem/tải theo hợp đồng sở hữu đã hoạt động trên Core.
- [x] D02: Giao diện viewer PDF trong `CustomerPolicies` tích hợp `SignedPdfPreview`, hỗ trợ xem inline và download attachment.
- [x] Quản lý vòng đời URL ký an toàn, tự động refresh link khi hết hạn, không lưu URL vào browser storage hay in ra log.
- [x] Đã kiểm chứng qua bộ kiểm thử tự động `customer-policies.spec.mjs` (5/5 tests pass).
