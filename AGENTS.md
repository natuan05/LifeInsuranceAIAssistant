# Quy tắc làm việc trong repo

- Đọc `README.md`, `docs/architecture.md` và `docs/source-review.md` trước khi thay đổi.
- Đợt khởi tạo chỉ gồm cấu trúc và tài liệu. Chỉ thêm code, dependencies, database hoặc cloud khi có yêu cầu tiếp theo.
- Core sở hữu phân quyền và nghiệp vụ. Agent gọi Business API, không truy cập trực tiếp business database.
- Retrieval chỉ trả tài liệu đúng quyền và phiên bản. Không lấy danh tính hoặc quyền từ LLM.
- Trạng thái Agent phải lưu bền vững; ghi checkpoint khác với ghi nghiệp vụ.
- Tạo Ticket cần xác nhận hợp lệ và chống trùng do Core thực thi.
- Chỉ dùng dữ liệu khách hàng/hợp đồng sinh hoàn toàn giả lập; không dùng hồ sơ thật đã che tên.
- Không đưa secrets, dữ liệu chạy local hoặc nội dung Private vào Git, prompt hay log không cần thiết.
- ADR có trạng thái đề xuất vẫn là đề xuất. Ghi lại điểm chưa chốt; không biến chúng thành mặc định trong code.
- Chỉ thêm module, package dùng chung hoặc ứng dụng mới khi có nhu cầu cụ thể.
