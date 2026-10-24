# Bước triển khai tiếp theo

Chỉ bắt đầu code khi có yêu cầu cho giai đoạn tiếp theo. Chốt quyết định theo luồng sắp làm, không xây toàn bộ hạ tầng trước.

1. **Thống nhất baseline.** Review các điểm 1–8 trong [đối chiếu nguồn](source-review.md). Ghi người quyết định, trạng thái và lý do; ADR đề xuất chỉ đổi trạng thái sau khi được xác nhận.
2. **Đặc tả một luồng nhỏ.** Bắt đầu từ Customer/Staff đã đăng nhập tra cứu đúng quyền. Chốt identity, assignment, mô hình tài liệu/phiên bản và contract Core–Agent. Đầu ra: đặc tả và ví dụ synthetic có thể review.
3. **Chọn công cụ cho local.** Chốt phiên bản Node/Python, package manager, cách dựng PostgreSQL + pgvector, ORM/migration và checkpoint. Khi được giao triển khai mới scaffold ứng dụng, cài dependencies và dựng DB; chưa cần cloud.
4. **Chuẩn bị PoC theo quyết định đã chốt.** Chọn corpus nhỏ, model/embedding, dữ liệu sinh và đáp án kiểm chứng; chuẩn bị RAG ngoài ứng dụng. Xác nhận cách truy vết phiên bản và quyền trước khi nạp dữ liệu.
5. **Mở rộng từng luồng và kiểm chứng.** Public/Private RAG → hội thoại bền vững → xác nhận Ticket/chống trùng → thông báo/Staff takeover. Chỉ thiết kế cloud sau khi luồng local đủ rõ.

Các tình huống phải kiểm chứng khi có implementation:

- Customer không đọc được hợp đồng khách khác; Staff không đọc được khách ngoài phân công, kể cả sau đổi quyền và resume.
- Retrieval và trích dẫn không trả nhầm quyền hoặc phiên bản; lỗi scope phải đóng truy cập Private.
- Khởi động lại Agent vẫn tiếp tục được trạng thái được phép; checkpoint không cấp thêm quyền nghiệp vụ.
- Chưa xác nhận thì không tạo Ticket; timeout/retry không tạo trùng; chỉ báo thành công sau commit.
- Thông báo lỗi vẫn giữ Ticket; thử lại không gửi trùng; Staff takeover chặn thao tác ghi của Agent đang chạy.

Các tình huống trên là tiêu chí cho giai đoạn code, chưa phải test đã chạy. Khung repo hiện chỉ cần kiểm tra cấu trúc, liên kết tài liệu, quy tắc Git và phạm vi file.
