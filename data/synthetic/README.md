# Dữ liệu giả lập

Nơi đặt fixture nhỏ và mô tả cách sinh dữ liệu cho PoC.

Đã có [hợp đồng synthetic Hành Trình Hạnh Phúc](manulife-demo-v1/README.md), tạo ngày **29/10/2026**: một hợp đồng, ba nhân vật, dữ liệu JSON, bản Markdown và 15 đáp án đối chiếu. Số liệu được viết mới theo bố cục trường thông tin đã tham khảo; không sao chép giá trị, lịch sử hoặc bản hợp đồng thật đã che tên. Chưa seed vào ứng dụng hoặc chạy Agent/RAG.

- Sinh hoàn toàn Customer, Staff, phân công, hợp đồng, hội thoại và Ticket. Không dùng hồ sơ thật đã che tên hoặc biến đổi.
- PDF hợp đồng giả lập phải khớp dữ liệu business, quyền sở hữu và phiên bản tài liệu.
- Fixture đưa vào Git phải nhỏ, được rà soát, đánh dấu `synthetic` và không chứa thông tin cá nhân thật.
- Bộ dữ liệu lớn, PDF, embeddings, database dump và checkpoint sinh ra đặt trong `.local/`, không commit.
- Khi có bộ dữ liệu, ghi seed sinh, phiên bản, nguồn tài liệu và đáp án kiểm chứng. Việc chuẩn bị RAG chạy ngoài ứng dụng.
