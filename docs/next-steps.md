# Phạm vi hiện tại và hướng phát triển

Application local đã có Web/Core, database và migrations, tài khoản dev tự seed, đăng nhập/đổi mật khẩu, hồ sơ theo quyền và tool quản trị local.

Thành viên mới theo [hướng dẫn thiết lập và sử dụng](getting-started.md): tạo env, chọn Docker/npm, chạy admin, mở các cổng và đăng nhập tài khoản đã seed.

Các bước phát triển sau cần chốt phạm vi trước khi triển khai: nghiệp vụ hợp đồng/Ticket, hội thoại/Agent, retrieval và checkpoint. Các điểm thiết kế còn mở xem [đối chiếu nguồn](source-review.md). Kết nối RDS và triển khai cloud chưa thuộc phạm vi hiện tại.

Ngày **29/10/2026** đã có [hợp đồng synthetic](../data/synthetic/manulife-demo-v1/README.md) được viết mới theo bố cục trường thông tin đã tham khảo: Markdown, JSON, manifest và 15 đáp án đối chiếu. Đã kiểm tra nhất quán tĩnh; chưa seed, chunk, embedding hoặc chạy Agent/RAG. Phí/quyền lợi bổ trợ demo chỉ là dữ liệu thử, chưa ánh xạ sản phẩm thương mại hoặc kiểm định định phí.
