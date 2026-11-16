# Dữ liệu giả lập

Nơi đặt fixture nhỏ và mô tả cách sinh dữ liệu cho PoC.

Đã có [bộ dữ liệu hợp đồng synthetic](manulife-demo-v1/README.md): fixture tham chiếu ngày **29/10/2026** gồm JSON/Markdown/15 đáp án và portfolio runtime bốn hồ sơ riêng trong `policies.json`. Số liệu được viết mới; không sao chép giá trị, lịch sử hoặc bản hợp đồng thật đã che tên. Không dùng fixture tham chiếu cũ để nhân bản hợp đồng runtime; chưa chạy Agent/RAG từ bộ này.

Bootstrap app tại `apps/core/src/cli/dev-accounts.ts` và `dev-policies.ts`: 5 tài khoản dev cùng profile/assignment, 7 sản phẩm Public, 4 policy và 17 PDF/version (4 hợp đồng, 13 tài liệu Public). Nguồn runtime là `manulife-demo-v1/policies.json`: bốn hồ sơ khác nhau, đúng người được bảo hiểm/sản phẩm/lựa chọn/điều khoản và phí riêng. Bản `contract.json` cũ cùng 15 đáp án được giữ làm fixture độc lập, không dùng để nhân bản hợp đồng trong bootstrap. Xem [dev accounts](../../docs/getting-started.md#dev-accounts).

- Sinh hoàn toàn Customer, Staff, phân công, hợp đồng, hội thoại và Ticket. Không dùng hồ sơ thật đã che tên hoặc biến đổi.
- PDF hợp đồng giả lập phải khớp dữ liệu business, quyền sở hữu và phiên bản tài liệu.
- Fixture đưa vào Git phải nhỏ, được rà soát, đánh dấu `synthetic` và không chứa thông tin cá nhân thật.
- Bộ dữ liệu lớn, PDF, embeddings, database dump và checkpoint sinh ra đặt trong `.local/`, không commit.
- Khi có bộ dữ liệu, ghi seed sinh, phiên bản, nguồn tài liệu và đáp án kiểm chứng. Việc chuẩn bị RAG chạy ngoài ứng dụng.

Trạng thái màn hình/API ở [checklist UI](../../docs/ui/implementation-status.md). Portfolio runtime không có quyền lợi DEMO-TITAN hoặc bổ trợ thương mại chưa xác minh. Bốn hồ sơ chủ động không tham gia bổ trợ (`riders=[]`, `ridersComplete=true` theo khai báo synthetic); cờ này không được áp ngược cho JSON legacy hoặc hồ sơ chưa kiểm tra. Chưa tạo chunks/embeddings hoặc tích hợp Agent cho bộ này. Phí chỉ là dữ liệu phát triển, không phải báo giá thương mại.
