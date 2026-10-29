---
document_id: DOC-SYN-CONTRACT-001
document_version: synthetic-v1
fixture_id: SYN-CONTRACT-001
synthetic: true
access_scope: PRIVATE_POLICY
owner_customer_ref: CUS-SYN-001
as_of_date: 2026-10-01
created_date: 2026-10-29
document_format: markdown
original_pdf_page_mapping: false
---

# Hợp đồng SYN-POL-2024-0001 — DỮ LIỆU GIẢ LẬP

> Hồ sơ thử nghiệm được viết mới theo bố cục trường thông tin của khung đã ẩn. Tất cả nhân vật, định danh, ngày cá nhân, số tiền, lịch sử và điều kiện nội trú demo được sinh cho mẫu này. Không phải hợp đồng Manulife phát hành, báo giá hoặc kết quả thẩm định; không có hiệu lực pháp lý.

Đây là bản Markdown gọn để tra cứu. Mốc mục `syn-*` thuộc bản synthetic này; không dùng làm số trang PDF của hợp đồng thật. [Dữ liệu đối chiếu](contract.json) giữ cùng phiên bản.

<a id="syn-persons"></a>
## 1. Các bên và người được bảo hiểm

| Vai trò | Mã người | Tên giả lập | Ngày sinh | Tuổi lúc bắt đầu / tại mốc đối chiếu |
| --- | --- | --- | --- | --- |
| Bên mua; người thụ hưởng | SYN-PER-001 | Khách hàng Demo An | 1987-07-01 | 37 / 39 |
| Người được bảo hiểm chính; bổ trợ A | SYN-PER-002 | Người được bảo hiểm Demo Bình | 2011-07-01 | 13 / 15 |
| Người được bảo hiểm bổ trợ B | SYN-PER-003 | Người được bảo hiểm Demo Chi | 2015-07-01 | 9 / 11 |

Tài khoản chủ sở hữu dự kiến: `CUS-SYN-001`; nhân viên được phân công trong kịch bản: `STF-SYN-001` — Nhân viên Demo Minh. Đây là mã tham chiếu fixture, chưa tạo tài khoản hoặc assignment trong ứng dụng.

Liên hệ bên mua: `demo.an@example.invalid`; địa chỉ “Địa chỉ giả lập AN-001, Khu Demo; không có địa điểm thực”. Giấy tờ dùng mã `SYN-ID-*`; không có CCCD, số điện thoại hoặc tài khoản ngân hàng hợp lệ. Demo An là mẹ của Demo Bình; Demo Chi là em của Demo Bình. Quan hệ và tên đều giả lập.

<a id="syn-schedule"></a>
## 2. Trang hợp đồng

| Trường | Giá trị giả lập |
| --- | --- |
| Số hợp đồng | SYN-POL-2024-0001 |
| Ngày ký | 2024-06-20 |
| Ngày cấp / hiệu lực | 2024-07-01 |
| Ngày bàn giao | 2024-07-05 |
| Ngày đáo hạn | 2111-07-01 |
| Thời hạn hợp đồng | 87 năm; Demo Bình đạt 100 tuổi tại ngày đáo hạn trong kịch bản |
| Thời hạn đóng phí dự kiến | 20 năm |
| Định kỳ | Nửa năm, ngày 01/01 và 01/07 |
| Sản phẩm chính | Hành Trình Hạnh Phúc – Gia Tăng Bảo Vệ; quyền lợi cơ bản |
| Người được bảo hiểm chính | SYN-PER-002 — Demo Bình |
| Số tiền bảo hiểm chính | 750.000.000 đồng |
| Trạng thái tại 2026-10-01 | ACTIVE; khai báo từ snapshot nghiệp vụ giả lập |

Ngày đáo hạn, thời hạn và mức phí được đặt cho kịch bản; chưa được kiểm tra bằng bộ quy tắc nhận bảo hiểm hoặc định phí của hãng.

<a id="syn-benefits"></a>
## 3. Quyền lợi và phí

| Hạng mục | Người được bảo hiểm | Mã quyền lợi | Số tiền / hạn mức | Phí nửa năm | Phí quy năm |
| --- | --- | --- | --- | --- | --- |
| Chính | Demo Bình | PUB-HTHP-GTBV-V2 | STBH 750.000.000 đồng | 6.000.000 đồng | 12.000.000 đồng |
| Quyền lợi nội trú DEMO-TITAN A | Người được bảo hiểm Demo Bình | SYN-BEN-001 | Hạn mức 240.000.000 đồng/năm hợp đồng | 1.200.000 đồng | 2.400.000 đồng |
| Quyền lợi nội trú DEMO-TITAN B | Người được bảo hiểm Demo Chi | SYN-BEN-002 | Hạn mức 180.000.000 đồng/năm hợp đồng | 900.000 đồng | 1.800.000 đồng |
| **Tổng** | | | Không cộng STBH chính với hạn mức nội trú thành số tiền chi trả | **8.100.000 đồng** | **16.200.000 đồng** |

Hai quyền lợi nội trú demo mô phỏng phần bổ trợ của khung. Nhãn `DEMO-TITAN` và các mức dưới đây do fixture tự đặt; `catalog_product_id=null`, chưa ánh xạ sang sản phẩm bổ trợ thương mại. Không thêm chúng vào danh mục 7 sản phẩm MVP, không suy ra khả năng ghép hoặc mức phí thực tế.

| Quy tắc nội trú demo | SYN-BEN-001 — Demo Bình | SYN-BEN-002 — Demo Chi |
| --- | --- | --- |
| Thời gian hiệu lực theo kịch bản | 2024-07-01 đến 2044-07-01 | 2024-07-01 đến 2044-07-01 |
| Hạn mức mỗi năm hợp đồng | 240.000.000 đồng | 180.000.000 đồng |
| Trần phòng mỗi ngày | 1.200.000 đồng | 900.000 đồng |
| Số ngày phòng tối đa mỗi năm hợp đồng | 30 ngày | 30 ngày |
| Chờ bệnh thông thường | 45 ngày; mốc kết thúc chờ 2024-08-15 | 45 ngày; mốc kết thúc chờ 2024-08-15 |
| Chờ tai nạn theo quy tắc demo | 0 ngày | 0 ngày |

Mốc kết thúc chờ được quy ước bằng ngày bắt đầu cộng số ngày chờ trong fixture. Hạn mức năm tính theo năm hợp đồng bắt đầu ngày 01/07. Trần/phạm vi trên chỉ phục vụ kiểm thử đọc dữ liệu; không thay kết luận chi trả cho một hồ sơ.

<a id="syn-premiums"></a>
## 4. Lịch đóng phí

| Kỳ đến hạn / ngày đóng | Mã biên nhận giả | Phí chính | Phí bổ trợ | Tổng đã đóng |
| --- | --- | --- | --- | --- |
| 2024-07-01 | SYN-RCPT-001 | 6.000.000 đồng | 2.100.000 đồng | 8.100.000 đồng |
| 2025-01-01 | SYN-RCPT-002 | 6.000.000 đồng | 2.100.000 đồng | 8.100.000 đồng |
| 2025-07-01 | SYN-RCPT-003 | 6.000.000 đồng | 2.100.000 đồng | 8.100.000 đồng |
| 2026-01-01 | SYN-RCPT-004 | 6.000.000 đồng | 2.100.000 đồng | 8.100.000 đồng |
| 2026-07-01 | SYN-RCPT-005 | 6.000.000 đồng | 2.100.000 đồng | 8.100.000 đồng |
| **Cộng 5 kỳ** | | **30.000.000 đồng** | **10.500.000 đồng** | **40.500.000 đồng** |

Đã đóng đến kỳ 2026-07-01. Kỳ tiếp theo: **2027-01-01**, phí dự kiến **8.100.000 đồng** nếu dữ liệu kịch bản giữ nguyên. Phí đóng thêm: **0 đồng**. Phí đến hạn chưa thanh toán tại 2026-10-01: **0 đồng**. Sổ thu và các tổng là dữ liệu giả, không có hóa đơn/giao dịch thực.

<a id="syn-snapshot"></a>
## 5. Snapshot nghiệp vụ giả lập tại 2026-10-01

| Trường | Giá trị |
| --- | --- |
| Giá trị tài khoản cơ bản | 9.600.000 đồng |
| Giá trị tài khoản đóng thêm | 0 đồng |
| Tổng giá trị tài khoản | 9.600.000 đồng |
| Nợ | 0 đồng |
| Giá trị hoàn lại / tiền mặt thực trả | Chưa tính; `null` |
| Số tiền được chi trả cho yêu cầu bảo hiểm | Chưa thẩm định/chưa tính; `null` |
| Tình trạng yêu cầu chi trả | NOT_ASSESSED |

Snapshot này mô phỏng dữ liệu Core sẽ cung cấp sau khi có Business API. Giá trị tài khoản được khai báo riêng cho thử nghiệm; không được tính từ số phí đã đóng hoặc công thức lãi giả định. Không có bảng dự phóng lãi, giá trị quỹ tương lai hoặc minh họa định phí.

<a id="syn-private-conditions"></a>
## 6. Điều kiện riêng của kịch bản và người thụ hưởng

- Quyền lợi nội trú demo không gồm khám sức khỏe định kỳ, khám ngoại trú hoặc chăm sóc răng định kỳ. Đây là điều kiện giả lập riêng của hai quyền lợi demo, không sửa điều khoản Public của sản phẩm chính.
- Không có dữ liệu bệnh sử, hóa đơn hoặc hồ sơ y tế. Agent không kết luận chi trả chỉ từ tên quyền lợi và hạn mức.
- Người thụ hưởng quyền lợi tử vong theo chỉ định giả lập: **SYN-PER-001 — Demo An, 100%**. Việc đủ điều kiện nhận quyền lợi chưa được thẩm định.
- Không có chữ ký, OTP hoặc xác thực điện tử thực; xác nhận phát hành chỉ là trạng thái kịch bản. Không dùng bản này như xác nhận Ticket.

<a id="syn-terms"></a>
## 7. Tài liệu áp dụng và phạm vi bằng chứng

- Sản phẩm chính được gắn tường minh trong fixture với [Quy tắc, điều khoản Phiên bản 2 — Gia Tăng Bảo Vệ](../../public/manulife/text/HanhTrinhHanhPhuc_GiaTangBaoVe/Quy-tac-va-dieu-khoan-hanh-trinh-hanh-phuc-gia-tang-bao-ve.md); Công văn 6865/BTC-QLBH ngày 14/06/2019. Checksum bản Markdown nằm trong `contract.json` và `manifest.json`.
- Gắn tài liệu là lựa chọn của kịch bản thử, không xác minh hợp đồng thật hoặc tự dùng phiên bản mới nhất.
- Với câu hỏi cá nhân, dùng thông tin người/quyền lợi của bản synthetic này; dùng Public để giải thích quy tắc của đúng sản phẩm chính. Không dùng TnC sản phẩm chính để điền thiếu điều khoản bổ trợ.
- Hai quyền lợi demo chưa có bản TnC thương mại được xác minh. Có thể trả các con số được ghi ở mục 3 với nhãn giả lập; câu hỏi về chi trả thực tế cần thêm điều khoản phù hợp và hồ sơ, không suy đoán.
- Metadata chủ sở hữu không tự cấp quyền. Core phải xác thực và cấp scope trước khi retrieval trả bản Private, kể cả dữ liệu này được lưu công khai trong Git để phát triển.

<a id="syn-forms"></a>
## 8. Tờ khai và xác nhận thử nghiệm

| Trường | Giá trị giả lập / cách xử lý |
| --- | --- |
| Mã hồ sơ | SYN-APP-2024-0001 |
| Bên mua | SYN-PER-001 |
| Người được bảo hiểm chính | SYN-PER-002 |
| Người được bảo hiểm bổ trợ khác | SYN-PER-003 |
| Phương thức đóng phí | Chuyển khoản mô phỏng; không tạo ngân hàng/tài khoản |
| Tình trạng tờ khai sức khỏe | NOT_PROVIDED; không đánh dấu Có/Không thay khách hàng |
| Chữ ký, OTP | NOT_GENERATED |
| Tài khoản ứng dụng, seed database | NOT_CREATED |

Các mục đã đủ để kiểm thử nhận diện hợp đồng, phân biệt người được bảo hiểm, phí/lịch sử, điều kiện demo, trích dẫn và thiếu bằng chứng. Bộ [đáp án đối chiếu](expected-answers.json) là tiêu chuẩn của dữ liệu thử này, chưa phải kết quả kiểm thử Agent/RAG đã chạy.
