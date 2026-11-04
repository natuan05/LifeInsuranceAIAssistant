# Dữ liệu giả lập

Nơi đặt fixture nhỏ và mô tả cách sinh dữ liệu cho PoC.

Đã có [hợp đồng synthetic Hành Trình Hạnh Phúc](manulife-demo-v1/README.md), tạo ngày **29/10/2026**: một hợp đồng, ba nhân vật, dữ liệu JSON, bản Markdown và 15 đáp án đối chiếu. Số liệu được viết mới theo bố cục trường thông tin đã tham khảo; không sao chép giá trị, lịch sử hoặc bản hợp đồng thật đã che tên. Chưa seed vào ứng dụng hoặc chạy Agent/RAG.

Bootstrap app tách riêng tại `apps/core/src/cli/dev-accounts.ts` và `dev-policies.ts`: 5 tài khoản dev cùng profile/assignment, 2 sản phẩm, 14 policy và 20 PDF version synthetic. Không đồng nhất dữ liệu seed app với fixture hợp đồng rút gọn ở trên. Xem [dev accounts](../../docs/getting-started.md#dev-accounts).

- Sinh hoàn toàn Customer, Staff, phân công, hợp đồng, hội thoại và Ticket. Không dùng hồ sơ thật đã che tên hoặc biến đổi.
- PDF hợp đồng giả lập phải khớp dữ liệu business, quyền sở hữu và phiên bản tài liệu.
- Fixture đưa vào Git phải nhỏ, được rà soát, đánh dấu `synthetic` và không chứa thông tin cá nhân thật.
- Bộ dữ liệu lớn, PDF, embeddings, database dump và checkpoint sinh ra đặt trong `.local/`, không commit.
- Khi có bộ dữ liệu, ghi seed sinh, phiên bản, nguồn tài liệu và đáp án kiểm chứng. Việc chuẩn bị RAG chạy ngoài ứng dụng.

Trạng thái màn hình/API dùng dữ liệu này ở [checklist UI](../../docs/ui/implementation-status.md). Seed policy/PDF app đã có; fixture `manulife-demo-v1` chưa seed, chưa chạy Agent/RAG. Không dùng việc có schema làm bằng chứng nghiệm thu nghiệp vụ.
