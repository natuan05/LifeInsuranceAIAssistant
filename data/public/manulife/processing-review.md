# Kết quả xử lý tài liệu Manulife

Ngày **28/10/2026**. Bộ Public hiện có **13/13 PDF, 243/243 trang** sau khi bổ sung một sản phẩm chính. Phần lịch sử bên dưới mô tả đợt 12 PDF/218 trang trước đó. [Mục lục](README.md) · [Manifest](../manifest-manulife-text.json) · [Workflow](../../../docs/document-processing-workflow.md).

## Đợt bổ sung Hành Trình Hạnh Phúc – Gia Tăng Bảo Vệ

- Thêm một PDF điều khoản 25 trang hoàn toàn dạng ảnh; Luna chép theo ba nhóm, kiểm tra chéo và parent kiểm tra thêm. Giữ mốc từng trang, bảng và tiêu đề ô gộp.
- Đã sửa các lỗi phát hiện: “Tĩnh dưỡng” ở Điều 5.3(g); tỷ lệ **03%** ở Điều 8.1 (không phải 0,3%); một từ thừa ở Điều 25.1; lặp tiêu đề đúng cho dòng bảng tiếp trang 10 và giữ ô gộp bảng Điều 8.2. Chân trang lặp được lược có chủ đích.
- Tổng Public: **71 bảng Markdown và 4 bảng HTML**; 12 đầu ra cũ không đổi. Checksum PDF mới và Markdown, đủ 25 mốc trang được kiểm tra; nguồn không bị sửa. PDF mới không có Link annotation; URL in trên ảnh được giữ khi có, không suy đích QR.
- Nguồn mới là phiên bản phê chuẩn 14/06/2019 theo Công văn 6865/BTC-QLBH. Không suy là phiên bản hiện hành cho mọi hợp đồng; không thay điều khoản sản phẩm khác.
- Hợp đồng thật 65 trang được xử lý/khử định danh riêng trong `.local/private/manulife/`, ngoài Git. Không có nội dung/danh tính Private trong manifest hoặc corpus Public; không tính PDF này vào 13 nguồn Public.
- Trạng thái Public mới: `ai_checked/needs_human_review`, `human_approved=false`. Vấn đề nguồn UL049 trang 29 vẫn giữ nguyên.

## Đã thực hiện — đợt 12 PDF/218 trang trước bổ sung

- Hiệu đính 10 Markdown có lớp chữ và bổ sung 2 Markdown cho ImportantNote Dự Phòng Xanh/La Chắn Xanh từ 5 trang ảnh.
- Chuẩn hóa đoạn văn, Điều/Khoản/Phụ lục, bullet và thứ tự đọc; giữ anchor theo trang PDF, bỏ chân trang lặp. Các đoạn tiếp trang vẫn giữ dấu vết trang; metadata có trang trước/sau để nối ngữ cảnh khi cần.
- Biên tập 59 trang theo tọa độ/ảnh; 159 trang còn lại giữ nguyên thứ tự chữ/số so với bản nền sau chuẩn hóa định dạng và bỏ chân trang. Đây là kiểm tra bảo toàn bản trích, không chứng minh bản trích ban đầu hoàn hảo.
- Xử lý toàn bộ 42 trang từng được gắn cờ bảng. Đầu ra có **60 bảng Markdown và 1 bảng HTML** để giữ ô gộp; sơ đồ phân bổ phí/công thức được biểu diễn bằng danh sách hoặc quan hệ văn bản có nhãn.
- Ba subagent **Luna** đọc ảnh và bảng theo nhóm; sau đó đổi nhóm kiểm tra độc lập và parent đối chiếu. Đã sửa thiếu đoạn quanh bảng phí, từ/điều kiện bị rút gọn, nhóm ô gộp gán sai và nội dung trùng được phát hiện trong lượt đầu.
- Không chạy Tesseract hoặc OCR engine khác. Phần ảnh được chép và đối chiếu trực tiếp bằng Luna, parent kiểm tra thêm; không gọi dịch vụ OCR ngoài hoặc cài dependency.

## Kiểm tra

- Đủ 12 đầu ra và 218 anchor/trang; nguồn PDF giữ nguyên SHA-256. Frontmatter, checksum Markdown, số cột bảng, cấu trúc bảng HTML và encoding đã kiểm tra.
- Đối chiếu bản nền ở 213 trang có chữ. Bốn khác biệt đáng kể được giải thích bằng ảnh nguồn: chữ xoay bị đảo ở La Chắn Xanh trang 15–16; cấu trúc ô gộp/đoạn trích chồng ở Xanh Ước Mơ ULP50 trang 19–20. Không còn sai lệch đáng kể chưa được giải thích trong phép kiểm này.
- Danh sách La Chắn Xanh có đủ **143 bệnh**, STT theo nhóm/STT chung, đúng 5 nhóm 56+10+12+61+4, được đối chiếu độc lập với bảng nguồn.
- Hai ma trận đầu tư Xanh Phú Quý trang 31 và Xanh Tương Lai trang 34 được so theo năm và từng cột Quỹ với pypdf đọc độc lập: **387 ô tỷ lệ khớp**. Kết quả này chỉ áp dụng cho hai bảng đó.
- Đã kiểm kê **107 Link annotation**; đích URL hoặc trang PDF được giữ trong manifest. Chưa biến mọi tham chiếu Điều/Khoản thành hyperlink trong Markdown. URL in trên ảnh được chép lại; chưa giải mã QR hoặc xác minh đích web.
- Bản nền, ảnh render, tọa độ và báo cáo kiểm tra chi tiết nằm trong `.local/research/manulife-processing-2026-10-28/`, ngoài Git. Bản nền riêng tại `baseline/` phục vụ đối chiếu.

## Một vấn đề nguồn còn mở

**Xanh Ước Mơ, lựa chọn Số Tiền Bảo Hiểm không tự động gia tăng — PDF trang 29:**

> Sản Phẩm Chính tiếp tục có hiệu lực nếu Giá Trị Tài Khoản Hợp Đồng

Ô nội dung dừng tại đây trong PDF; trang 30 không nối câu. Đã giữ nguyên phần nhìn thấy, bỏ dấu chấm từng được thêm nhầm và gắn chú thích ngay tại [đoạn tương ứng](text/XanhUocMo/Full-TnC-UL049.md#pdf-page-29). Không tự dùng TnC lựa chọn khác để điền phần thiếu. Cần nguồn rõ hơn hoặc quyết định xử lý riêng trước khi dùng điều kiện này làm bằng chứng trả lời.

## Trạng thái sử dụng

Đây là **bản đã hiệu đính và kiểm tra bằng AI**, chưa có người duyệt nghiệp vụ ký nhận. Trạng thái `ai_checked/needs_human_review`; riêng UL049 là `ai_checked/needs_source_review`. Các kiểm tra không bảo đảm không còn lỗi tiềm ẩn.

Trước khi dùng làm corpus đã duyệt cho RAG, cần người đối chiếu bảng/quyền lợi/điều kiện/loại trừ và xử lý vấn đề nguồn nêu trên. Chưa chia chunk, tạo embedding, nạp database hoặc thay đổi ứng dụng. Không stage hoặc commit.
