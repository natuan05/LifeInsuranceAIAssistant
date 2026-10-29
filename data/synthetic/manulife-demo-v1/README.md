# Hợp đồng synthetic — Hành Trình Hạnh Phúc

Ngày tạo **29/10/2026**. Một hợp đồng, ba nhân vật, một sản phẩm chính và hai quyền lợi bổ trợ demo; mốc dữ liệu cố định **01/10/2026**.

- [Bản hợp đồng để đọc và thử retrieval](contract.md).
- [Dữ liệu có cấu trúc](contract.json): nguồn chuẩn cho số tiền, ngày, người, quyền lợi, lịch thu và snapshot.
- [15 câu hỏi/đáp án đối chiếu](expected-answers.json): trả lời trực tiếp, thiếu bằng chứng, giới hạn chi trả và truy cập chéo. Chưa chạy Agent/RAG.
- [Manifest/checksum](manifest.json): phiên bản và nguồn Public được gắn.

## Cách sinh và sử dụng

- Viết mới từ các tham số synthetic cố định; seed ID `20261029`, namespace uuid5 `lifeinsurance/synthetic/20261029/`. Các UUID chỉ là đề xuất fixture, chưa tồn tại trong database.
- Khung đã ẩn chỉ giúp chọn nhóm trường. Không đọc lại hợp đồng thật để lấy giá trị; không sao chép bản khử định danh, checksum, tên file, ảnh, tờ khai, dấu chọn hoặc lịch sử của khách thật vào bộ này.
- Tên hiển thị có nhãn Demo, giấy tờ là `SYN-ID-*`, email ở `example.invalid`, không có số điện thoại/tài khoản ngân hàng/credential thật.
- `contract.json` và Markdown phải đổi cùng nhau; cập nhật manifest và đáp án khi sửa. Các tổng phí/sổ thu, tuổi, thời hạn, mốc chờ và liên kết đã được kiểm tra ở đợt tạo; chưa xác thực định phí/khả năng ghép thương mại.
- Phí và hạn mức demo do fixture tự đặt. Hai quyền lợi `DEMO-TITAN` chưa ánh xạ `InsuranceProduct`, không mở rộng danh mục MVP. Không dùng chúng như báo giá hoặc quy tắc sản phẩm thật.
- Có nguồn Public cho sản phẩm chính; quyền lợi bổ trợ chỉ có quy tắc demo trong fixture. Metadata liên kết không thay quyền do Core cấp.
- Khi tích hợp, map actor/entity/tài liệu qua Core và seed riêng theo yêu cầu tiếp theo. Chưa thay schema, tạo seed, nạp DB, chia chunk hoặc embedding.

Đây là bản Markdown gọn được viết mới; không có ánh xạ trang với PDF thật 65 trang, không có bảng dự phóng định phí/lãi hoặc xác nhận điện tử. Bản tham khảo local đã ẩn vẫn giữ nguyên ngoài Git.
