# Cấu hình, secrets và dữ liệu

## Cấu hình

- Quy tắc chung nằm ở root; cấu hình chạy của ứng dụng nào đặt cạnh ứng dụng đó. Không dùng một file env chứa toàn bộ quyền cho cả hệ thống.
- Chỉ tạo `.env.example` hoặc `.env.<môi trường>.example` khi biến cấu hình đã có nhu cầu. Mẫu chỉ chứa placeholder; ghi rõ biến bắt buộc và bên sở hữu.
- `.env` và các biến thể thật không được commit. `.gitignore` đã loại chúng, chỉ cho phép mẫu có hậu tố `.example` theo quy ước trên.
- Baseline local đã chốt Node/npm và npm workspaces Web/Core, dùng một package-lock.json root. Phiên bản/lệnh chuẩn ở [getting-started](getting-started.md); không tạo lockfile riêng từng app. Không áp dụng các lựa chọn AI/cloud đề xuất thành mặc định.
- Tách cấu hình local/PoC và production. Không đưa ngưỡng timeout, số chiều embedding hoặc sizing đang đề xuất thành mặc định.

## Secrets

- Không ghi API key, password, token, private key, connection string có mật khẩu hoặc URL đã ký vào Git, prompt, fixture, ảnh chụp hay log. Ngoại lệ được người dùng duyệt chỉ cho đúng 5 tài khoản synthetic dev ở [dev accounts](getting-started.md#dev-accounts), không bao gồm DB/operator/credential khác.
- Local dùng biến môi trường/file env bị bỏ qua; artifact và credential tạm đặt trong `.local/`. Cloud dùng cơ chế danh tính dịch vụ và quản lý secrets khi triển khai; chưa chọn hay tạo dịch vụ ở đợt này.
- Frontend chỉ nhận cấu hình công khai cần thiết. Biến `NEXT_PUBLIC_*` phải được coi là công khai; model key và DB credential chỉ ở phía server có thẩm quyền.
- Tách quyền Core business, retrieval chỉ đọc, chuẩn bị dữ liệu và checkpoint. Không tái dùng credential quản trị cho ứng dụng.
- Compose local hiện sinh credential vào named volumes riêng theo role; chỉ job prepare/bootstrap được truy cập bộ credential để khởi tạo. Runtime chỉ mount volume cần dùng. `.local/postgres/bootstrap-password` cũ chỉ để nhập credential khi nâng cấu hình; không đưa credential volumes vào image hoặc bản chia sẻ repo.
- `.gitignore` chỉ giảm lỗi đưa nhầm file, không phát hiện hết secrets. Rà soát diff trước mỗi commit; nếu lộ bí mật phải thu hồi/đổi bí mật và xử lý lịch sử liên quan.

## Dữ liệu

| Loại | Nơi quản lý | Có đưa vào Git? |
| --- | --- | --- |
| Nguồn/manifest tài liệu công khai | `data/public/` | Manifest nhỏ đã rà soát |
| Fixture sinh hoàn toàn giả lập | `data/synthetic/` | Chỉ mẫu nhỏ đã rà soát, có nhãn synthetic |
| PDF, chunks, embeddings, bộ dữ liệu lớn | `.local/` hoặc kho dữ liệu ngoài Git | Không |
| DB volume/dump, checkpoint, log, bản xuất hội thoại | `.local/` hoặc kho vận hành ngoài Git | Không |
| Tài liệu trao đổi gốc | Thư mục trao đổi bên ngoài repo | Không tự sao chép vào repo |

- Không dùng khách hàng/hợp đồng thật, kể cả bản che tên. Gửi LLM phần dữ liệu tối thiểu cần thiết.
- Manifest phải truy vết nguồn, phiên bản và checksum. Chunks phải khớp PDF, hợp đồng và phiên bản được Core cấp.
- Lưu định danh model, phiên bản và số chiều cho mỗi index khi chọn embedding. Đổi model cần đánh giá và dựng lại index; cùng số chiều chưa đủ bảo đảm tương thích.
- Checkpoint, vector và log có thể mang nội dung Private; bảo vệ như dữ liệu nguồn. Không chia sẻ cache Private giữa khách hàng.
- Audit phải đủ truy vết actor, hành động, tài liệu và kết quả nhưng giảm/che dữ liệu nhạy cảm. Nội dung và thời hạn lưu/xóa cần chốt trước khi ghi log/checkpoint.


## Đồng bộ UI và dữ liệu local — 30/10/2026

[Checklist UI/gap](ui/implementation-status.md) theo dõi phần đã nối API và placeholder. UI không giữ fixture policy/Ticket/Claim như kết quả thật; dữ liệu thiếu không biến thành 0 hoặc xác nhận chi trả. Customer/Staff dev fixtures nằm trong `apps/core/src/cli/dev-accounts.ts`; chưa có corpus/index/PDF hoặc bộ nghiệp vụ policy/chat/Ticket đầy đủ.

Policy dùng model InsurancePolicy/bảng insurance_policies; không sửa tên trong migration lịch sử. WebSocket local chỉ gửi invalidation account/profile/assignment, không payload Private; Web đọc lại REST theo quyền. Không ghi cookie/CSRF/URL xem tài liệu vào log sự kiện hay browser storage. Các artifact kiểm tra local không thay test suite được quản lý trong repo.
