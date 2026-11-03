# Cấu hình, secrets và dữ liệu

## Cấu hình

- Quy tắc chung nằm ở root; cấu hình chạy của ứng dụng nào đặt cạnh ứng dụng đó. Không dùng một file env chứa toàn bộ quyền cho cả hệ thống.
- Chỉ tạo `.env.example` hoặc `.env.<môi trường>.example` khi biến cấu hình đã có nhu cầu. Mẫu chỉ chứa placeholder; ghi rõ biến bắt buộc và bên sở hữu.
- `.env` và các biến thể thật không được commit. `.gitignore` đã loại chúng, chỉ cho phép mẫu có hậu tố `.example` theo quy ước trên.
- Khi bắt đầu code, chốt phiên bản runtime, package manager và lockfile tương ứng; commit lockfile. Không ghim phiên bản hoặc tạo manifest giả trong đợt nền này.
- Tách cấu hình local/PoC và production. Không đưa ngưỡng timeout, số chiều embedding hoặc sizing đang đề xuất thành mặc định.

## Secrets

- Không ghi API key, password, token, private key, connection string có mật khẩu hoặc URL đã ký vào Git, prompt, fixture, ảnh chụp hay log.
- Local dùng biến môi trường/file env bị bỏ qua; artifact và credential tạm đặt trong `.local/`. Cloud dùng cơ chế danh tính dịch vụ và quản lý secrets khi triển khai; chưa chọn hay tạo dịch vụ ở đợt này.
- Frontend chỉ nhận cấu hình công khai cần thiết. Biến `NEXT_PUBLIC_*` phải được coi là công khai; model key và DB credential chỉ ở phía server có thẩm quyền.
- Tách quyền Core business, retrieval chỉ đọc, chuẩn bị dữ liệu và checkpoint. Không tái dùng credential quản trị cho ứng dụng.
- Compose local hiện sinh credential vào named volumes riêng theo role; chỉ job prepare/bootstrap được truy cập bộ credential để khởi tạo. Runtime chỉ mount volume cần dùng. `.local/postgres/bootstrap-password` cũ chỉ để nhập credential khi nâng cấu hình; không đưa credential volumes vào image hoặc bản chia sẻ repo.
- `.gitignore` chỉ giảm lỗi đưa nhầm file, không phát hiện hết secrets. Rà soát diff trước mỗi commit; nếu lộ bí mật phải thu hồi/đổi bí mật và xử lý lịch sử liên quan.

## Dữ liệu

| Loại | Nơi quản lý | Có đưa vào Git? |
| --- | --- | --- |
| Nguồn/manifest tài liệu công khai | `data/public/` | Manifest nhỏ đã rà soát |
| Bản trích Markdown công khai của bộ Manulife | `data/public/manulife/text/` | Được người dùng cho phép ngày 27/10/2026; kèm nguồn, trang, checksum và trạng thái kiểm tra |
| Fixture sinh hoàn toàn giả lập | `data/synthetic/` | Chỉ mẫu nhỏ đã rà soát, có nhãn synthetic |
| PDF, chunks, embeddings, bộ dữ liệu lớn | `.local/` hoặc kho dữ liệu ngoài Git | Không |
| DB volume/dump, checkpoint, log, bản xuất hội thoại | `.local/` hoặc kho vận hành ngoài Git | Không |
| Tài liệu trao đổi gốc | Thư mục trao đổi bên ngoài repo | Không tự sao chép vào repo |

- Không dùng khách hàng/hợp đồng thật, kể cả bản che tên. Gửi LLM phần dữ liệu tối thiểu cần thiết.
- Ngoại lệ chuyển đổi được người dùng xác nhận ngày 28/10/2026: được tạo Markdown đã loại danh tính/số liệu từ một hợp đồng thật để tham khảo cấu trúc, chỉ lưu `.local/private/manulife/`. Bản này vẫn có nguồn gốc thật, không là fixture synthetic, không đưa vào Git/corpus MVP/embedding. Giá trị cá nhân dùng nhãn đã loại; không tự dựng số liệu nghiệp vụ mới. Chỉ chuyển phần ảnh đã khử định danh hoặc nội dung chung cần thiết cho lượt đọc ảnh; không phát định danh vào log/báo cáo.
- Manifest phải truy vết nguồn, phiên bản và checksum. Chunks phải khớp PDF, hợp đồng và phiên bản được Core cấp.
- Lưu định danh model, phiên bản và số chiều cho mỗi index khi chọn embedding. Đổi model cần đánh giá và dựng lại index; cùng số chiều chưa đủ bảo đảm tương thích.
- Checkpoint, vector và log có thể mang nội dung Private; bảo vệ như dữ liệu nguồn. Không chia sẻ cache Private giữa khách hàng.
- Audit phải đủ truy vết actor, hành động, tài liệu và kết quả nhưng giảm/che dữ liệu nhạy cảm. Nội dung và thời hạn lưu/xóa cần chốt trước khi ghi log/checkpoint.

- Ngoại lệ người dùng xác nhận ngày 02/11/2026: được dùng trực tiếp bản hợp đồng đã khử định danh 65 trang, bổ sung dữ liệu demo để chuẩn bị corpus Private local. Nguồn này vẫn `synthetic=false`, không gọi là sinh hoàn toàn giả lập; lưu trong `.local/private/manulife/`, chưa tự đưa Git, seed, chunk hoặc embedding. Không khôi phục định danh thật; ô bị loại chưa điền phải được coi là thiếu dữ liệu. Việc chuẩn bị bản demo không tự đồng nghĩa đã duyệt chất lượng nguồn.

- Ngoại lệ bổ sung ngày 03/11/2026: người dùng yêu cầu commit cả bản Private demo đầy đủ. Chỉ cho phép `data/private/manulife-demo-full-v1/{contract.md,README.md,manifest.json}` và README thư mục cha vào Git. Bản nguồn thật đã khử định danh vẫn `synthetic=false`, chưa human/RAG approval; không kèm PDF, ảnh, bản thô hoặc định danh thật. Ngoại lệ này thay hạn chế Git của bản demo ngày 02/11, không tự cho phép seed/chunk/embedding.

Xem [bộ Private được phép lưu Git](../data/private/manulife-demo-full-v1/README.md); các dữ liệu Private khác vẫn theo quy tắc mặc định.
