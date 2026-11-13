# Bộ dữ liệu hợp đồng giả lập

## Portfolio dùng trong bootstrap ứng dụng

[policies.json](policies.json) là nguồn runtime: bốn hồ sơ được viết riêng, `version=2`, snapshot `2026-11-01`. Toàn bộ tên, người thân, phí và lịch thu là dữ liệu giả lập; không phải hợp đồng Manulife phát hành, báo giá hoặc kết quả thẩm định.

| Hợp đồng | Bên mua | Người được bảo hiểm | Sản phẩm chính | Phí mỗi kỳ |
| --- | --- | --- | --- | --- |
| BH-2024-01001 | Lê Minh Anh | Lê Quang Bình — con | Hành Trình Hạnh Phúc – Gia Tăng Bảo Vệ | 6.000.000 VND / nửa năm |
| BH-2026-01002 | Lê Minh Anh | Lê Minh Anh — bản thân | Xanh Phú Quý | 24.000.000 VND / năm |
| BH-2026-02001 | Phạm Ngọc Linh | Phạm Ngọc Linh — bản thân | Xanh Tương Lai | 1.500.000 VND / tháng |
| BH-2026-02002 | Phạm Ngọc Linh | Phạm Gia Bảo — con | Xanh Ước Mơ, lựa chọn UL049 | 2.250.000 VND / quý |

Vũ Thu Trang chưa có hợp đồng. Không tạo 12 bản sao cho một khách để thử phân trang; test nhiều trang dùng fixture cô lập của suite API/browser, không đưa vào bootstrap chung.

- Mỗi hồ sơ có số hợp đồng, chủ sở hữu, người được bảo hiểm, người thụ hưởng, thời hạn, định kỳ/phí và nguồn điều khoản tường minh. Hai vai trò bên mua/người được bảo hiểm không bị gộp làm một.
- Catalog có đủ bảy sản phẩm và 13 tài liệu Public. Mỗi hợp đồng chỉ gắn đúng bản quy tắc được chọn; UL049 và ULP50 là các lựa chọn khác nhau của Xanh Ước Mơ, không ghép chung.
- Không có bổ trợ trong bốn hồ sơ: `riders=[]`, `ridersComplete=true` theo khai báo synthetic. Không tự gắn ba sản phẩm bổ trợ trong catalog, không giữ quyền lợi DEMO-TITAN chưa ánh xạ từ fixture cũ.
- Phí là giá trị kỹ thuật được viết mới; chưa kiểm định biểu phí hay khả năng ghép thương mại. Giá trị tài khoản/hoàn lại/nợ/chi trả chưa có nguồn được giữ `null`; không tính lãi, lợi nhuận hoặc số tiền bồi thường giả định.
- PDF chính gồm giấy chứng nhận/thông tin, các bên, thời hạn/phí, quyền lợi/phạm vi, lịch thu giả lập và danh mục tài liệu. Điều khoản đầy đủ nằm trong tài liệu Public gắn đúng sản phẩm/phiên bản; PDF Public là bản dựng từ Markdown, không phải PDF gốc, chưa human approval.
- Bootstrap từ JSON này tạo bốn `InsurancePolicy`, bốn PDF chính `portfolio-v2.1` và dùng 13 PDF Public `public-text-v2`: tổng 17 tài liệu/version. Mã tài khoản/email/phí/lịch tham gia cố định theo repo; UUID owner runtime thuộc DB mỗi môi trường.
- Không thêm bảng/cột, chunks/embeddings, Agent workflow hoặc nội dung từ `data/private`. Khi vận hành thật phải nhận hồ sơ phát hành, chứng cứ ký và quy tắc/biểu phí được doanh nghiệp duyệt; seed không thay quy trình phát hành.
- Chạy lại bootstrap giữ chỉnh sửa, không ghi đè tài khoản/hồ sơ hoặc hợp đồng. Lệnh maintenance thay bộ nhân bản cũ chỉ xóa policy/PDF của fixture đã xác minh, giữ public catalog và dữ liệu khác. Chi tiết tại [Getting Started](../../../docs/getting-started.md#76-thay-bộ-hợp-đồng-mẫu-nhân-bản-cũ).

## Fixture tham chiếu cũ — không dùng để seed runtime

Tạo ngày `2026-10-29`, snapshot `2026-10-01`: một kịch bản, ba nhân vật, một sản phẩm chính và hai quyền lợi nội trú DEMO-TITAN.

- [Bản đọc](contract.md) và [JSON đối chiếu](contract.json).
- [15 câu hỏi/đáp án](expected-answers.json) chỉ áp dụng kịch bản cũ, không áp cho portfolio runtime phía trên.
- [Manifest/checksum](manifest.json) truy vết từng file và nguồn Public.

Số liệu và nhân vật của bản này được viết mới từ tham số synthetic, không sao chép giá trị hay định danh từ hợp đồng thật đã che tên. Hai quyền lợi DEMO-TITAN chưa ánh xạ thương mại và không thuộc catalog MVP. Không dùng phí, ngày chờ, đáp án hoặc snapshot của bản này để điền thiếu cho sản phẩm/hợp đồng khác.

`contract.json`/`contract.md` cùng đáp án vẫn được giữ nhất quán như fixture độc lập; không tạo tài khoản theo UUID đề xuất trong đó. Bộ tham chiếu chưa được nghiệm thu Agent/RAG. Không có ánh xạ trang PDF thật 65 trang hoặc xác nhận ký điện tử.
