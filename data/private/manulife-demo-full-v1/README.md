# Hợp đồng đầy đủ đã khử định danh, có dữ liệu demo

- [Bản đọc](contract.md): giữ 65 mốc trang PDF, 15 bảng Markdown và 33 bảng HTML của bản đã khử định danh.
- [Manifest](manifest.json): nguồn gốc, checksum, quyền đưa Git và giới hạn dữ liệu.
- Người dùng cho phép dùng trực tiếp bản đã khử định danh ngày 02/11/2026 và đưa bản demo vào Git ngày 03/11/2026. Đây là ngoại lệ có phạm vi cụ thể; `synthetic=false`, không gọi là sinh hoàn toàn giả lập.
- Đã thay tên theo vai trò và các trường trang hợp đồng bằng dữ liệu demo. Nhiều số liệu/tờ khai/bảng minh họa vẫn còn nhãn đã ẩn hoặc đã loại: đó là dữ liệu thiếu, không phải 0/không tham gia/không áp dụng.
- Giữ nguyên điều khoản và mốc trang từ bản đọc đã khử định danh; không tuyên bố đây là bản sao nguyên văn hoặc hợp đồng có hiệu lực pháp lý.
- Không đồng nhất với [fixture synthetic rút gọn](../../synthetic/manulife-demo-v1/README.md): số liệu, thời gian chờ và đáp án của bộ đó không áp dụng ở đây.
- Đã kiểm đủ trang/bảng, quét danh sách định danh đã biết và kiểm checksum; `human_approved=false`, `rag_approved=false`. Chưa seed, chia chunk hoặc embedding; duyệt corpus và mapping qua Core trước khi tích hợp.
- PDF/bản thô/ảnh/chữ ký và dữ liệu kiểm tra riêng vẫn ngoài Git. Chỉ bản Markdown demo cùng README/manifest được phép lưu ở thư mục này.
