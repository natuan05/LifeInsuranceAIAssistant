# Bộ tài liệu Manulife

Cập nhật **28/10/2026**: **13 PDF, 243 trang, 7 nhóm sản phẩm**; gồm 8 bản điều khoản (226 trang) và 5 ImportantNote (17 trang).

Đây là bộ nguồn Public cho **7 sản phẩm MVP: 4 chính và 3 bổ trợ**, theo [danh sách chuẩn](../../../docs/specifications/Agent_Design.md#mvp-products). Hai bản TnC Xanh Ước Mơ là hai lựa chọn của một sản phẩm; không tính thành hai sản phẩm.

- [Kết quả hiệu đính, kiểm tra và vấn đề còn mở](processing-review.md).
- [Manifest nguồn, đầu ra và từng trang](../manifest-manulife-text.json).
- [Workflow đang áp dụng](../../../docs/document-processing-workflow.md).
- Đã có đủ 13 Markdown, gồm hai ImportantNote trước đây cần đọc ảnh. Trạng thái là AI đã kiểm tra, chưa được người duyệt nghiệp vụ xác nhận; chưa chia chunk/embedding.
- TnC UL049 có câu nguồn bị ngắt tại PDF trang 29, đã đánh dấu trong bản trích và manifest.

## Danh sách bản trích

### DuPhongXanh

| Tài liệu | Trang PDF | Trạng thái |
| --- | ---: | --- |
| [MC-2025-Full-TnC-BW](text/DuPhongXanh/MC-2025-Full-TnC-BW.md) | 13 | AI đã kiểm tra; chờ người duyệt |
| [MC25-ImportantNote](text/DuPhongXanh/MC25-ImportantNote.md) | 2 | AI đã kiểm tra; chờ người duyệt |

### HanhTrinhHanhPhuc_GiaTangBaoVe

| Tài liệu | Trang PDF | Trạng thái |
| --- | ---: | --- |
| [Quy tắc và điều khoản Hành Trình Hạnh Phúc – Gia Tăng Bảo Vệ](text/HanhTrinhHanhPhuc_GiaTangBaoVe/Quy-tac-va-dieu-khoan-hanh-trinh-hanh-phuc-gia-tang-bao-ve.md) | 25 | AI đọc ảnh và kiểm tra; chờ người duyệt |

### HoVeXanh

| Tài liệu | Trang PDF | Trạng thái |
| --- | ---: | --- |
| [ADD2025-ImportantNote](text/HoVeXanh/ADD2025-ImportantNote.md) | 2 | AI đã kiểm tra; chờ người duyệt |
| [Quy-tac-dieu-kien-va-dieu-khoan-HoVeXanh](text/HoVeXanh/Quy-tac-dieu-kien-va-dieu-khoan-HoVeXanh.md) | 14 | AI đã kiểm tra; chờ người duyệt |

### LaChanXanh

| Tài liệu | Trang PDF | Trạng thái |
| --- | ---: | --- |
| [CI25-ImportantNote](text/LaChanXanh/CI25-ImportantNote.md) | 3 | AI đã kiểm tra; chờ người duyệt |
| [Dieu_kien_va_dieu_khoan_san_pham_la_chan_xanh](text/LaChanXanh/Dieu_kien_va_dieu_khoan_san_pham_la_chan_xanh.md) | 48 | AI đã kiểm tra; chờ người duyệt |

### XanhPhuQuy

| Tài liệu | Trang PDF | Trạng thái |
| --- | ---: | --- |
| [XanhPhuQuy_ImportantNote](text/XanhPhuQuy/XanhPhuQuy_ImportantNote.md) | 6 | AI đã kiểm tra; chờ người duyệt |
| [XanhPhuQuy_TnC](text/XanhPhuQuy/XanhPhuQuy_TnC.md) | 31 | AI đã kiểm tra; chờ người duyệt |

### XanhTuongLai

| Tài liệu | Trang PDF | Trạng thái |
| --- | ---: | --- |
| [Full-TnC-2025-ILP](text/XanhTuongLai/Full-TnC-2025-ILP.md) | 34 | AI đã kiểm tra; chờ người duyệt |

### XanhUocMo

| Tài liệu | Trang PDF | Trạng thái |
| --- | ---: | --- |
| [Full-TnC-UL049](text/XanhUocMo/Full-TnC-UL049.md) | 30 | AI đã kiểm tra; nguồn bị ngắt p29 |
| [Full-TnC-ULP50](text/XanhUocMo/Full-TnC-ULP50.md) | 31 | AI đã kiểm tra; chờ người duyệt |
| [VIE_ULP25-ImportantNote](text/XanhUocMo/VIE_ULP25-ImportantNote.md) | 4 | AI đã kiểm tra; chờ người duyệt |

## Nguồn và lịch sử

PDF gốc ở `C:\Users\Admin\Documents\TaiLieuManulife`, ngoài Git; checksum 12 file cũ giữ nguyên; PDF bổ sung được ghi checksum riêng trong manifest. Giữ riêng hai lựa chọn TnC Xanh Ước Mơ.

Ngày 28/10/2026 đã loại 20 Markdown theo bộ PDF người dùng rút gọn. Bản thử brochure cũ ở `.local/archive/manulife-prune-2026-10-28/`, ngoài corpus/Git. Bản chữ trước hiệu đính được giữ trong `.local/research/manulife-processing-2026-10-28/baseline/`.

Hợp đồng Private được xử lý riêng trong `.local/private/manulife/`, không thuộc danh mục Public này. Không tự đưa điều khoản bổ trợ nhúng trong hợp đồng vào corpus Public hoặc tăng số sản phẩm MVP.
