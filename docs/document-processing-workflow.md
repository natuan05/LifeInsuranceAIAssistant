# Workflow xử lý tài liệu sản phẩm

Cập nhật **28/10/2026**. Đã thực hiện luồng dưới đây cho toàn bộ bộ nguồn rút gọn; xem [kết quả và giới hạn kiểm tra](../data/public/manulife/processing-review.md). Đầu ra đã được AI hiệu đính/đối chiếu, chưa có người duyệt nghiệp vụ xác nhận.

## Phạm vi và ưu tiên

[Bộ nguồn Public hiện tại](../data/public/manulife/README.md) có **13 PDF, 243 trang**: 8 bản điều khoản và 5 ImportantNote. Đã có đủ 13 Markdown: 10 bản từ lớp chữ và 3 bản đọc ảnh (30 trang ảnh). Bản điều khoản mới Hành Trình Hạnh Phúc – Gia Tăng Bảo Vệ chiếm 25 trang ảnh.

Phạm vi MVP là **7 sản phẩm: 4 chính, 3 bổ trợ**, theo [danh sách chuẩn](specifications/Agent_Design.md#mvp-products). Hai lựa chọn điều khoản Xanh Ước Mơ xử lý riêng, vẫn tính là một sản phẩm.

TnC là nguồn chính để tra quy tắc, quyền lợi, điều kiện, loại trừ và phí. ImportantNote là nguồn bổ sung; không dùng phần tóm tắt thay điều khoản chi tiết. Giữ riêng sản phẩm, lựa chọn và phiên bản; TnC không thay toàn bộ hợp đồng cá nhân.

## Luồng chính

**Đối chiếu nguồn → giữ/trích lớp chữ → chuẩn hóa Điều/Khoản và bảng → kiểm tra → duyệt bản dùng cho RAG.**

| Bước | Thực hiện | Đầu ra |
| --- | --- | --- |
| 1. Đối chiếu | So danh sách PDF, số trang và SHA-256 với manifest; nguồn thay đổi thì đánh dấu bản trích cần cập nhật | Danh sách nguồn hiện hành |
| 2. Lấy chữ | Giữ 10 Markdown hiện có làm bản nền. Dùng pdfplumber khi cần trích lại và pypdf để đọc đối chiếu | Chữ theo từng trang, có nguồn/checksum |
| 3. Chuẩn hóa | Giữ Phần/Chương/Điều/Khoản/Phụ lục; sửa ngắt dòng, bỏ chân trang lặp khỏi nội dung; nối đoạn tiếp trang nhưng giữ dấu vết từng trang | Markdown rõ cấu trúc |
| 4. Xử lý bảng | Rà các trang có bảng, đặc biệt 42 trang đã được gắn cờ. Giữ đúng tiêu đề, hàng/cột, ô gộp, đơn vị và chú thích | Bảng đọc được, truy vết nguồn |
| 5. Kiểm tra và duyệt | Đối chiếu đủ trang, Điều/Khoản, bảng và các đoạn quyền lợi/điều kiện/loại trừ với PDF; chỗ chưa rõ giữ `needs_review` | Bản hiệu đính và danh sách vấn đề còn mở |

Số trang PDF và số trang in trên tài liệu có thể lệch do bìa/mục lục; dùng số trang PDF làm anchor, giữ số trang in nếu cần tham chiếu.

## Công cụ tối thiểu

- **pdfplumber:** chữ có tọa độ, đường kẻ và ô bảng; là công cụ chính đang dùng. Ô gộp vẫn phải xử lý theo hình học, không tự điền mọi ô trống. [Tài liệu công cụ](https://github.com/jsvine/pdfplumber)
- **pypdf:** kiểm kê trang, đọc lớp chữ độc lập và Link annotation khi có. Hai parser cùng đọc được chữ không chứng minh bảng đã đúng. [Đọc annotation](https://pypdf.readthedocs.io/en/stable/user/reading-pdf-annotations.html)
- **Trình đọc PDF:** đối chiếu bảng và đoạn chưa rõ. Chỉ cần **pypdfium2/Pillow** khi phải render/cắt vùng phục vụ xử lý; không render và lưu ảnh toàn bộ corpus mặc định.
- **Docling:** phương án bổ sung nếu bảng phức tạp không xử lý ổn bằng công cụ hiện có; thử trên đúng bảng gặp lỗi trước khi thêm vào quy trình. Không bắt buộc cài trong đợt này. [Cấu trúc tài liệu](https://docling-project.github.io/docling/concepts/docling_document/)

## OCR và đọc ảnh: nhánh ngoại lệ

Ba nguồn dạng ảnh đã được xử lý bằng Luna:

| File | Trang |
| --- | ---: |
| `DuPhongXanh/MC25-ImportantNote.pdf` | 2 |
| `LaChanXanh/CI25-ImportantNote.pdf` | 3 |
| `HanhTrinhHanhPhuc_GiaTangBaoVe/Quy-tac-va-dieu-khoan-hanh-trinh-hanh-phuc-gia-tang-bao-ve.pdf` | 25 |

Đã dùng **Luna đọc ảnh và chép văn bản**, có lượt kiểm tra độc lập và parent đối chiếu thêm. Không chạy Tesseract, không cài dependency hay gọi dịch vụ OCR ngoài. Nếu tự động hóa những đợt sau, có thể thử Tesseract `vie` + `eng` rồi kiểm tra với PDF; hỗ trợ tiếng Việt không tự bảo đảm độ chính xác. [Ngôn ngữ Tesseract](https://tesseract-ocr.github.io/tessdoc/Data-Files-in-different-versions.html)

Nếu gặp trang hỗn hợp, chỉ xử lý vùng ảnh chứa thông tin chưa lấy được. Model thị giác chỉ là phương án hỗ trợ khi OCR/parser không giải quyết chắc chắn; không có bước bắt buộc gửi cả bộ qua model, không cần chọn provider hoặc benchmark nhiều model cho luồng chính hiện tại. Sử dụng API bên ngoài cần quyết định riêng trước khi gọi thực tế.

## Kiểm tra quan trọng

- **Đầy đủ:** đủ trang và Điều/Khoản/Phụ lục, không bỏ mất đoạn tiếp trang, điều kiện hoặc chú thích. Bản nguồn mới thiếu/thừa so với manifest phải được xử lý rõ.
- **Bảng:** kiểm tra theo tiêu đề → nhãn hàng/cột → giá trị → đơn vị → chú thích. Ví dụ ô phí `1,5%` gộp qua nhiều hàng không được gán cho một hàng duy nhất.
- **Chữ và số:** giữ dấu âm, dấu thập phân, %, thời hạn, số tiền, phủ định, ngoại lệ và điều kiện đi kèm. Đối chiếu tổng chữ số chỉ là cảnh báo hỗ trợ, không thay việc kiểm tra đúng quan hệ.
- **Truy vết:** giữ source hash, phiên bản, trang PDF và cách hiệu đính. Không suy phiên bản/ngày hiệu lực chỉ từ tên file; không tự xử lý khác biệt giữa các tài liệu bằng cách ghép nội dung.
- **Duyệt:** kiểm tra toàn bộ bảng và các đoạn quyền lợi/điều kiện/loại trừ; ghi rõ phần chưa xác minh. Parser thành công hoặc đủ số trang không tự nâng trạng thái thành đã duyệt.

## Sau đợt hiệu đính

1. Đợt trước xử lý 218 trang, 60 bảng Markdown và 1 bảng HTML; 42 trang từng có cờ bảng đã được rà. Bản nền, ảnh và báo cáo chi tiết giữ trong `.local/research/manulife-processing-2026-10-28/`.
2. Đã cập nhật checksum, phương pháp từng trang và Link annotation trong manifest. Trạng thái `ai_checked/needs_human_review` phân biệt rõ với bản được người duyệt nghiệp vụ xác nhận.
3. TnC Xanh Ước Mơ UL049, PDF trang 29 có câu điều kiện bị cắt ngay trong nguồn. Giữ trạng thái `ai_checked/needs_source_review`, không tự hoàn tất từ sản phẩm/lựa chọn khác.
4. Người duyệt đối chiếu bảng/quyền lợi/điều kiện/loại trừ và xử lý vấn đề nguồn. Chỉ nội dung đã duyệt mới chuyển sang bước chia chunk/embedding riêng; đợt này chưa thực hiện bước đó.

PDF gốc giữ ngoài Git tại thư mục người dùng cung cấp. Ảnh tạm, OCR thô, log và bản so sánh đặt trong `.local/`; repo giữ Markdown công khai và manifest nhỏ. Không tạo ứng dụng, database, cloud, queue hoặc Agent để thực hiện công việc chuẩn bị tài liệu này.

## Bổ sung và hợp đồng Private

- Bộ Public hiện có 243 trang, 71 bảng Markdown và 4 bảng HTML; giữ nguyên 12 bản trích cũ. PDF scan mới được Luna chép và kiểm tra chéo, parent kiểm tra thêm. Đã sửa lỗi đọc “03%” thành “0,3%” và giữ đúng “Tĩnh dưỡng” theo ảnh.
- Hợp đồng thật 65 trang được người dùng cho phép khử định danh để chuyển đổi riêng, lưu tại `.local/private/manulife/eContract-redacted.md`; không sao chép vào `data/public` hoặc Git, không coi là dữ liệu synthetic.
- Private: dùng lớp chữ/tọa độ, sửa hướng đọc các trang xoay; phần font lỗi hoặc scan được đọc ảnh sau khi loại trường cá nhân. Giữ mốc 65 trang, nhãn trường và bảng; tên, giấy tờ, mã hồ sơ/hợp đồng, liên hệ/địa chỉ, tài khoản, OTP/chữ ký và đáp án sức khỏe cá nhân được loại. Số liệu cá nhân/bảng minh họa được thay bằng nhãn, không tự tính lại.
- Bản Private có vùng bị xóa chủ đích nên không phải bản sao nguyên văn. Trạng thái là tham khảo chờ rà soát, không dùng để kiểm thử quyền lợi, chunk hoặc embedding. Hợp đồng thử MVP vẫn cần sinh hoàn toàn giả lập.
- Nguồn/bản thô/ảnh và kiểm tra của đợt bổ sung ở `.local/research/manulife-additions-2026-10-28/`; không đưa nội dung hoặc danh sách định danh vào báo cáo Git.
