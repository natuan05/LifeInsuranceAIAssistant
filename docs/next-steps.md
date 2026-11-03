# Phạm vi hiện tại và hướng phát triển

Application local đã có Web/Core, database và migrations, tài khoản dev tự seed, đăng nhập/đổi mật khẩu, hồ sơ theo quyền và tool quản trị local.

Thành viên mới theo [hướng dẫn thiết lập và sử dụng](getting-started.md): tạo env, chọn Docker/npm, chạy admin, mở các cổng và đăng nhập tài khoản đã seed.

Ngày **31/10/2026** đã tổng hợp [thiết kế Agent/RAG hiện hành](specifications/Agent_Design.md#design-overview). Graph, tool, context, hybrid retrieval, giao tiếp và yêu cầu checkpoint đã có hướng thống nhất; không cần brainstorm lại vì chưa có code. Đợt này chỉ hoàn thiện tài liệu; chưa triển khai Agent/API nghiệp vụ, cài dependencies, seed hoặc embedding.

Phạm vi sản phẩm MVP đã chốt ngày **28/10/2026**: **7 sản phẩm, gồm 4 chính và 3 bổ trợ**; xem [danh sách chuẩn](specifications/Agent_Design.md#mvp-products). Corpus Public có đủ 13 Markdown Public/243 trang, đã kiểm tra bằng AI; [báo cáo xử lý](../data/public/manulife/processing-review.md) ghi trạng thái duyệt và lỗi nguồn UL049 trang 29.

Đã bổ sung bản điều khoản Hành Trình Hạnh Phúc – Gia Tăng Bảo Vệ (25 trang scan) và chuyển đổi một hợp đồng thật 65 trang thành bản tham khảo đã loại danh tính/số liệu, chỉ lưu local ngoài Git. Bản tham khảo này chỉ dùng để xem cấu trúc hồ sơ.

Sản phẩm chính/bổ trợ đã tham gia lấy theo từng hợp đồng Private; không cần ma trận ghép chung. Được [tra toàn bộ hồ sơ hợp đồng đã cấp quyền](specifications/Agent_Design.md#whole-contract-retrieval), gồm phụ lục/tài liệu kèm theo; không cần ma trận quyền theo từng Điều. Retrieval chỉ chọn đoạn liên quan vào context.

**Đã chốt ngày 30/10/2026:** [dữ liệu hợp đồng tối thiểu](specifications/Contract_Data_Design.md) giữ sản phẩm chính và danh sách mã bổ trợ/mức đầy đủ trong các trường hiện có; chi tiết còn lại dùng RAG. Hai tool đọc, lỗi/retry và giới hạn thử nghiệm đã thống nhất trong thiết kế Agent; schema local chưa thay đổi theo thiết kế này.

Chat chung cho Staff không gắn Customer **tạm hoãn theo người dùng ngày 28/10/2026**, do khác biệt tài liệu và ảnh hưởng schema/UI. Giữ phạm vi local hiện tại để tiếp tục thiết kế Agent/RAG; không sửa schema/UI hoặc coi yêu cầu chat chung đã bị loại bỏ.

## Công việc tiếp theo

1. **Review một bản thiết kế tổng thể:** đọc [bản tổng hợp](specifications/Agent_Design.md#design-overview), chỉ bổ sung quyết định thực sự thiếu. Không yêu cầu người dùng chọn từng tên trường/mã lỗi.
2. **Hoàn thiện một gói đặc tả thực thi:** state/contracts, API/tool, đồng bộ lịch sử, HMAC, điều phối và bảo vệ checkpoint/giao kết quả. Người thực hiện tự đề xuất chi tiết thông thường, review cơ chế cạnh tranh/khôi phục trước khi triển khai phần đó. Chưa chọn cơ chế khóa/queue từ bước này.
3. **Chọn những phần còn mở trước khi dùng:** model sinh/embedding; xác nhận Ticket; chính sách phiên/tiếp quản và lưu/xóa dữ liệu. Xem [phân loại đầy đủ](specifications/Agent_Design.md#remaining-work). Không cản đặc tả phần độc lập chỉ vì chưa chọn hết.
4. **Chuẩn bị phép thử khi được yêu cầu triển khai:** hoàn thiện fixture/mapping và corpus được duyệt, dùng cùng bộ câu hỏi để đo chunk/search/reranker/context và hiệu chỉnh giới hạn. API Core và Agent có thể phát triển theo contracts/mocks synthetic; tích hợp phải kiểm quyền thật.

Đã chọn parent–child và tham chiếu chéo; cỡ chunk/giới hạn mở rộng/tham số ranking cần đo, không phải kiến trúc chưa chọn. Lỗi nguồn UL049 trang 29 và duyệt nghiệp vụ corpus vẫn được theo dõi tại báo cáo xử lý. Chưa tạo chunks/embeddings hoặc nạp database. RDS, triển khai cloud, sizing/HA–DR, tự host và queue mới để giai đoạn có yêu cầu tương ứng.

Ngày **29/10/2026** đã có [hợp đồng synthetic](../data/synthetic/manulife-demo-v1/README.md) được viết mới theo bố cục trường thông tin đã tham khảo: Markdown, JSON, manifest và 15 đáp án đối chiếu. Đã kiểm tra nhất quán tĩnh; chưa seed, chunk, embedding hoặc chạy Agent/RAG. Phí/quyền lợi bổ trợ demo chỉ là dữ liệu thử, chưa ánh xạ sản phẩm thương mại hoặc kiểm định định phí.
