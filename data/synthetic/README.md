# Dữ liệu giả lập

Nơi đặt fixture nhỏ và mô tả cách sinh dữ liệu cho PoC. Thư mục này chưa có bộ dữ liệu nghiệp vụ policy/PDF/chat/Ticket; dự án đã có 5 tài khoản dev synthetic cùng profile/assignment trong `apps/core/src/cli/dev-accounts.ts`, seed vào database local. Xem [dev accounts](../../docs/getting-started.md#dev-accounts).

- Sinh hoàn toàn Customer, Staff, phân công, hợp đồng, hội thoại và Ticket. Không dùng hồ sơ thật đã che tên hoặc biến đổi.
- PDF hợp đồng giả lập phải khớp dữ liệu business, quyền sở hữu và phiên bản tài liệu.
- Fixture đưa vào Git phải nhỏ, được rà soát, đánh dấu `synthetic` và không chứa thông tin cá nhân thật.
- Bộ dữ liệu lớn, PDF, embeddings, database dump và checkpoint sinh ra đặt trong `.local/`, không commit.
- Khi có bộ dữ liệu, ghi seed sinh, phiên bản, nguồn tài liệu và đáp án kiểm chứng. Việc chuẩn bị RAG chạy ngoài ứng dụng.

Trạng thái màn hình/API dùng dữ liệu này ở [checklist UI](../../docs/ui/implementation-status.md). Chưa có policy seed để nghiệm thu G01 chỉ từ schema InsurancePolicy.
