# Tài liệu công khai

Nơi quản lý nguồn và bản trích Markdown của tài liệu sản phẩm công khai. Chưa có chunks, embeddings hoặc index RAG.

- Chọn PDF sản phẩm từ nguồn chính thức; ghi URL gốc, tên tài liệu, phiên bản, ngày lấy và checksum.
- Theo yêu cầu ngày 27/10/2026, bản trích Markdown có lớp chữ từ bộ Manulife do người dùng cung cấp được đặt tại `manulife/text/`, kèm manifest và trạng thái kiểm tra. Đây là bản dẫn xuất để rà soát; PDF gốc vẫn ở ngoài Git.
- Ngày 28/10/2026 đã đồng bộ theo bộ nguồn rút gọn: chỉ giữ bản trích có PDF tương ứng; bản thử brochure đã chuyển vào `.local/archive/`, ngoài Git.
- Chunks, embeddings, index, OCR trung gian và log xử lý đặt trong `.local/` hoặc kho dữ liệu được quản lý ngoài Git.
- Tài liệu công khai giải thích quy tắc chung; không thay hợp đồng cá nhân hoặc quyết định Claim.
- Phạm vi MVP đã chốt **7 sản phẩm: 4 chính, 3 bổ trợ**; xem [danh sách chuẩn](../../docs/specifications/Agent_Design.md#mvp-products). Quyền sử dụng/phân phối tài liệu vẫn cần kiểm tra trước khi chia sẻ bộ dữ liệu.

Corpus công khai không có nghĩa ứng dụng cho phép truy cập ẩn danh. Quyền truy xuất vẫn theo Core.

## Bộ Manulife

- Nguồn local: `C:\Users\Admin\Documents\TaiLieuManulife`; giữ nguyên PDF gốc và cấu trúc nhóm sản phẩm.
- [Danh sách bản trích và kết quả kiểm tra](manulife/README.md).
- [Manifest truy vết nguồn/trang/checksum](manifest-manulife-text.json).
- [Workflow xử lý bộ nguồn hiện tại](../../docs/document-processing-workflow.md).
- [Kết quả hiệu đính 12 tài liệu và vấn đề nguồn còn mở](manulife/processing-review.md).
- Ưu tiên lớp chữ; 5 trang ảnh của hai ImportantNote đã được Luna chép và đối chiếu ngày 28/10/2026. Không tự suy đoán phần nguồn thiếu, không coi kiểm tra bằng AI là xác nhận nghiệp vụ.
- Mỗi bản trích giữ số trang PDF để đối chiếu. Bảng nhiều cột/ô gộp phải giữ cấu trúc hoặc ghi rõ cần kiểm tra; không ghép dữ liệu theo phỏng đoán.
