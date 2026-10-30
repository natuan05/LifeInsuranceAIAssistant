# S04 — Tra cứu hợp đồng, sản phẩm và tài liệu

[Chỉ mục Staff](README.md) · [Tiến độ](../implementation-status.md) · [Bản đồ API](api-map.md) · [Khoảng trống](gap-review.md)

Đối chiếu 30/10/2026. Căn cứ: FR-008, UC-007, NFR-003/007; Data Model bảng 7–10. API P và đường dẫn UI chưa có chỉ là đề xuất.


## Hiện trạng 30/10/2026 — Khung UI; schema Policy đã chuẩn hóa, A14–20 chưa có

- [x] Policy Lookup/detail route, quick lookup panel và vùng policy trong hồ sơ.
- [x] Model InsurancePolicy/PolicyStatus/insurance_policies, quan hệ nhiều policy/Customer.
- [ ] List/detail/search/filter policy thực và source số liệu A14–16.
- [ ] Policy đang xem khác linkedPolicy của chat; UI chọn và contract đổi context chưa có.
- [ ] Products/documents/PDF/citations/version áp dụng A17–20.
- [ ] Chỉnh placeholder CCCD/phone và filter trạng thái từ mẫu sau khi chốt contract; hiện disabled.

Các phần yêu cầu bên dưới mô tả đích triển khai; chỉ các dòng `[x]` là đã làm.

## Thành phần

Giữ **Policy Lookup** toàn màn hình (danh sách → dossier), lookup nhanh bên phải chat và liên kết từ hồ sơ. Thêm chọn hợp đồng khi khách có nhiều hợp đồng; tab sản phẩm/điều khoản công khai; danh mục PDF hiển thị tiêu đề, loại, phiên bản áp dụng.

Chi tiết hợp đồng: policyNumber, sản phẩm, status, effectiveDate/expiryDate, sumAssured, premiumAmount/paymentFrequency/nextDueDate và benefitsSnapshot khi có. Không gọi thông tin kỳ phí hiện có là lịch sử giao dịch thanh toán. Thiếu dữ liệu không mặc định 0 hoặc “đã đóng phí”.

## Thao tác và API

| Thao tác | API |
| --- | --- |
| Từ Customer chọn hợp đồng | A14 P |
| Tìm/lọc hợp đồng trong assignment | A15 P; tìm CCCD/phone chưa được duyệt |
| Mở dossier / đổi hợp đồng trong chat | A16 P; giữ rõ hợp đồng đang xem với linkedPolicy của hội thoại |
| Xem sản phẩm/điều khoản chung | A17/A19 P |
| Chọn tài liệu riêng | A18 P; cặp document/version phù hợp hợp đồng |
| Mở/tải PDF hoặc nguồn trích dẫn | A20 P; kiểm lại quyền, cấp quyền có hạn, trang nguồn |

Không dùng PDF sản phẩm thay hợp đồng cá nhân. Không suy ra hạn mức còn lại/đã dùng hoặc beneficiary/bank account từ mock; cần nguồn API riêng được duyệt trước. Không upload/ingestion tài liệu ở MVP.

## Trạng thái riêng / checklist

- [ ] Chưa có hợp đồng, tài liệu/field null, tìm không thấy, PDF hỏng/không khả dụng.
- [ ] URL xem hết hạn xin lại đúng version; tài liệu bị thu hồi không tiếp tục hiển thị từ URL cũ như có quyền.
- [ ] Phân biệt nguồn Public với Private, version áp dụng với currentVersion; không log/lưu signed URL trong chat.

## Yêu cầu trạng thái khi triển khai đầy đủ

Đang tải, danh sách rỗng/không có kết quả, lỗi có nút thử lại. Phiên hết hạn chuyển đăng nhập; mất phân công/không còn quyền xóa dữ liệu riêng đang mở và tải lại scope. Không lấy quyền từ state client. Mọi dữ liệu mẫu phải có nhãn mô phỏng; chỉ báo thao tác thật thành công sau phản hồi Core.
