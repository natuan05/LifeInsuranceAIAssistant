# Hợp đồng giao tiếp

[Cách gọi thống nhất](../docs/specifications/Agent_Design.md#rag-terminology): tool truy xuất Public/Private trả bằng chứng và trạng thái; Agentic RAG là toàn bộ luồng có Agent/LLM tạo câu trả lời. Kết quả truy xuất gửi Agent khác với kết quả cuối Agent gửi Core.

Nơi đặt đặc tả API và sự kiện dùng giữa Web, Core và Agent theo [bản tổng thể đã thống nhất](../docs/specifications/Agent_Design.md#design-overview). Hiện chưa có schema hoặc client sinh tự động; [công việc đặc tả](../docs/specifications/Agent_Design.md#remaining-work) không có nghĩa phải brainstorm lại các ranh giới/hành vi đã chốt.

Các hợp đồng cần thiết kế trước: ngữ cảnh actor được ủy quyền; yêu cầu/kết quả Agent; phạm vi tài liệu; Business Tools; xác nhận và chống trùng Ticket; sự kiện tiếp quản/thông báo.

Đang thiết kế tại [Agent Design — vòng đời lượt xử lý](../docs/specifications/Agent_Design.md#agent-run-lifecycle). Đã chốt ngày 29/10/2026: lượt Agent tiếp tục khi người dùng rời trang; Core trả mã lượt, trong lúc chờ hiển thị trạng thái rồi công bố câu trả lời đầy đủ sau kiểm tra. Khi quay lại có thể xem trạng thái/kết quả theo quyền hiện hành. Core–Agent chọn [HTTP + callback JSON](../docs/specifications/Agent_Design.md#core-agent-callback); endpoint/schema, xác thực và cơ chế điều phối chưa chốt.

Core quản lý vòng đời lượt: tiếp nhận, xếp thứ tự và lưu trạng thái/kết quả. Agent thực thi LangGraph, giữ checkpoint và báo tiến độ/kết quả về Core. Chưa chọn vị trí worker hoặc backend hàng đợi.

Hai chiều chỉ trả [ACK thành công sau khi lưu bền vững](../docs/specifications/Agent_Design.md#durable-ack). Đã chốt [ba mã run/attempt/event và luật chống gửi trùng](../docs/specifications/Agent_Design.md#run-attempt-event-ids), [sequence riêng từng attempt và xử lý sự kiện muộn](../docs/specifications/Agent_Design.md#callback-ordering), [bộ trạng thái lượt](../docs/specifications/Agent_Design.md#agent-run-status); mã phản hồi, state machine, retry và cơ chế lưu/khôi phục còn cần chốt.

[Lưu/giao kết quả đã chốt](../docs/specifications/Agent_Design.md#durable-result-delivery): Agent lưu kết quả cuối đã qua Finalize và sự kiện trước khi gửi Core. Mất ACK/khởi động lại thì giao lại cùng sự kiện, không chạy lại LLM/tool; Core chống trùng và chặn attempt đã vô hiệu hóa. Nơi lưu, tính nguyên tử, lịch/hạn retry và retention còn mở; chưa triển khai.

[Kết quả Agent](../docs/specifications/Agent_Design.md#agent-result) gồm `response_type`, `message`, `citations`, `actions`. Action là đề xuất; Core kiểm quyền/nghiệp vụ và xác nhận Ticket trước khi ghi. Schema chi tiết chưa có.

[Đầu ra nội bộ node Agent đã chốt](../docs/specifications/Agent_Design.md#agent-node-output): một yêu cầu gọi tool gồm tên/tham số để chuyển Execute tools, hoặc kết quả trả lời/hỏi lại/từ chối để chuyển Finalize. Đây là giao tiếp giữa các node, không phải callback trung gian về Core hoặc schema HTTP/provider đã được chọn.

[Finalize đã chốt](../docs/specifications/Agent_Design.md#finalize-node): code kiểm tra cấu trúc kết quả, ID bằng chứng và metadata nguồn, loại/cấu trúc action trước khi chuẩn bị gửi Core. Đánh giá nội dung bằng chứng thuộc LLM trong node Agent; kiểm tra trích dẫn hợp lệ không chứng minh diễn giải đúng. Core kiểm tra lượt còn hợp lệ và lưu kết quả.

[Sửa đầu ra](../docs/specifications/Agent_Design.md#finalize-output-repair) tối đa một lần qua Agent khi lỗi cấu trúc/tham chiếu, dựa trên bằng chứng hiện có và còn deadline/ngân sách model. Cùng lượt, không reset ngân sách tool; nếu vẫn không đạt thì gửi lỗi kỹ thuật an toàn về Core, không công bố bản nháp lỗi. Không sửa để vượt lỗi quyền/lượt vô hiệu; schema lỗi còn mở.

[Hỏi làm rõ đã chốt](../docs/specifications/Agent_Design.md#agent-clarification-turn): kết quả `CLARIFICATION` đi qua Finalize và hoàn tất lượt hiện tại khi Core lưu kết quả hợp lệ; khách trả lời ở lượt mới, dùng context/mục đang chờ của cùng hội thoại và ngân sách mới. Khôi phục cùng tin nhắn sau lỗi không cấp lại ngân sách.

[Đầu vào Core gửi Agent](../docs/specifications/Agent_Design.md#agent-input) gồm mã run/attempt, hội thoại/tin nhắn/câu hỏi, người thao tác đã xác minh, Customer mục tiêu và deadline/ngân sách. [Lịch sử/context](../docs/specifications/Agent_Design.md#agent-history-sync) dùng checkpoint và lấy phần thiếu qua Core API. Còn schema/mốc đồng bộ và cơ chế xác thực/ủy quyền.

Đã chốt [hai lớp danh tính dịch vụ và quyền thực thi theo run/attempt](../docs/specifications/Agent_Design.md#service-and-run-authorization), với quyền hiện hành được kiểm tra khi sử dụng. [Tạm chọn HMAC + Core tra quyền theo lượt](../docs/specifications/Agent_Design.md#provisional-hmac-auth), chưa token riêng mỗi attempt hoặc dịch vụ cloud bổ sung. Profile chữ ký/chống phát lại, quản lý khóa, đường truyền và vòng đời quyền còn mở.

[Ranh giới tool/API](../docs/specifications/Agent_Design.md#agent-tools-vs-system-apis): lịch sử/scope do code tích hợp Agent gọi; mở PDF và chuyển luồng tiếp quản do Web/Core. Hồ sơ, phí, Ticket không mặc định là tool LLM. Đã chốt [hai Business Tools đọc hợp đồng](../docs/specifications/Agent_Design.md#contract-read-tools): `list_contracts` và `get_contract_overview`; còn schema chi tiết, mã lỗi và giới hạn gọi.

[Dữ liệu hợp đồng tối thiểu đã chốt ngày 30/10/2026](../docs/specifications/Contract_Data_Design.md): Core giữ sản phẩm chính và danh sách mã bổ trợ/mức đầy đủ trong các trường hiện có; chi tiết còn lại dùng RAG theo scope hợp đồng/phiên bản. API đọc/validation chưa triển khai; allowlist đọc theo quyết định hai tool nêu trên.

Đầu vào hai tool đã chốt: `list_contracts` lấy Customer mục tiêu qua code tích hợp từ Core; `get_contract_overview` chỉ nhận mã hợp đồng từ LLM. Danh tính/quyền do code truyền theo run/attempt, Core kiểm tra phạm vi mỗi lần gọi.

Đầu ra đã chốt: `list_contracts` trả danh sách mã hợp đồng và mã/tên sản phẩm chính; `get_contract_overview` trả mã hợp đồng, mã/tên sản phẩm chính, danh sách mã/tên bổ trợ và `ridersComplete`. Cờ chưa đầy đủ không cho phép kết luận không tham gia hoặc danh sách đã bao quát toàn bộ. Tên trường/schema HTTP, mã lỗi và phân trang còn mở.

[Hành vi lỗi/không có dữ liệu đã chốt](../docs/specifications/Agent_Design.md#contract-read-errors): không tìm thấy trong phạm vi được phép thì đề nghị kiểm tra mã; bị từ chối quyền/lượt vô hiệu thì dừng Private; lỗi Core/timeout thì báo chưa truy xuất được. Không dùng RAG để vượt quyền hoặc suy lỗi thành không có hợp đồng/bổ trợ. Danh sách rỗng sau kiểm tra quyền thành công là kết quả hợp lệ.

Retry hai tool đọc: code adapter chỉ thử lại tối đa một lần khi timeout/mất kết nối/lỗi Core tạm thời, trong deadline còn lại; LLM nhận kết quả sau cùng. Không retry không tìm thấy/sai đầu vào/từ chối quyền/lượt vô hiệu. Mỗi lần thử vẫn kiểm tra quyền; khoảng chờ cụ thể còn mở, retry callback và RAG độc lập.

[Làm rõ ngày 31/10/2026](../docs/specifications/Agent_Design.md#transient-read-recovery): có thể đọc lại cùng tool/tham số sau lỗi tạm thời nếu còn ngân sách/deadline và qua chính sách chờ của adapter. Mọi request vẫn tính vào bốn lần gọi Core/tin nhắn; không reset bộ đếm. MVP chưa thêm bộ chặn theo yêu cầu trùng hoặc circuit breaker.

[Timeout thử nghiệm đã chốt](../docs/specifications/Agent_Design.md#contract-read-timeout): tối đa 3 giây/request Core của hai tool đọc, kể cả retry, đồng thời không vượt deadline còn lại. Đây không phải timeout RAG/model/toàn graph; deadline chung và cấu hình còn mở.

[Ngân sách thử nghiệm đã chốt](../docs/specifications/Agent_Design.md#contract-read-budget): hai tool đọc dùng chung tối đa 4 lần gọi Core/tin nhắn, tính cả retry. Code đếm và chặn vượt; hết ngân sách thì trả phần đã xác minh, nêu phần thiếu. Ngân sách RAG riêng, tối đa 3 lần retrieval/tin nhắn.

- Core sở hữu quy tắc nghiệp vụ và quyền. Các bên thống nhất định dạng giao tiếp, không dùng chung ORM entity.
- [Phạm vi hợp đồng](../docs/specifications/Agent_Design.md#whole-contract-retrieval): Core cấp toàn bộ hồ sơ thuộc hợp đồng được phép đọc, gồm phụ lục/tài liệu kèm theo; retrieval chọn đoạn liên quan. Không giới hạn ở metadata hoặc thêm ma trận quyền theo Điều.
- [Mapping hội thoại/thread đã chốt](../docs/specifications/Agent_Design.md#conversation-thread-mapping): một hội thoại Core dùng một thread checkpoint, các tin có run riêng nhưng giữ cùng thread. Code lấy mapping tin cậy; LLM không chọn thread. Mở lại phải kiểm tra quyền; định dạng ID/quyền ghi khi nhiều worker còn mở.
- [Thu gọn context](../docs/specifications/Agent_Design.md#context-overflow-policy): loại trùng/kết quả cũ đã thay thế, tóm tắt lịch sử cũ, rồi giảm tập bằng chứng nhưng giữ các điều kiện/tham chiếu cần thiết. Không vừa thì hỏi thu hẹp/trả phần đã xác minh; giữ chỉ dẫn bắt buộc/câu hỏi hiện tại. Ngưỡng và thuật toán chi tiết còn mở.
- [Context cho từng lần gọi model](../docs/specifications/Agent_Design.md#model-context-assembly) được chọn từ năm nhóm dữ liệu, không gửi mặc định toàn bộ state hoặc tài liệu. Cần đo token từng call/tổng tin nhắn; trim/tóm tắt phải cấu hình, checkpoint không thay prompt cache. Ngưỡng token và prompt cache/provider còn mở.
- [`missing`/`conflicts` từ tool truy xuất](../docs/specifications/Agent_Design.md#retrieval-issue-reporting) chỉ ghi vấn đề từ cấu trúc/tham chiếu hoặc cảnh báo nguồn đã có. LLM trong Agent đánh giá thiếu/mâu thuẫn về ý nghĩa; MVP không thêm LLM riêng trong tool để điền hai danh sách. Không gộp đánh giá của Agent thành kết quả tool đã xác minh.
- [Kết quả truy xuất gửi Agent đã chốt](../docs/specifications/Agent_Design.md#rag-result-envelope) gồm `status`, `evidence[]`, `missing[]`, `conflicts[]`, `degraded`, `error`. Mỗi [bằng chứng](../docs/specifications/Agent_Design.md#retrieval-evidence-fields) có mã bằng chứng, nguồn, vị trí và đoạn nội dung nguồn; fixture Markdown dùng anchor thực tế. Danh sách thiếu/mâu thuẫn rỗng không chứng minh đủ bằng chứng; metadata quan sát kỹ thuật không mặc định đưa hết vào LLM. Kiểu/schema chi tiết còn mở.
- [Fallback RAG đã chốt](../docs/specifications/Agent_Design.md#embedding-fallback): embedding lỗi/timeout thì dùng keyword-only nếu nhánh này và scope vẫn hợp lệ, trả `degraded=true`; Agent đánh giá bằng chứng. Không có quyền/nguồn truy xuất hợp lệ thì dừng/báo lỗi; chiều keyword lỗi → vector-only và retry/timeout nội bộ còn mở.
- [Kết quả RAG](../docs/specifications/Agent_Design.md#rag-retrieval-vs-sufficiency) tách trạng thái truy xuất khỏi đánh giá độ đủ của Agent. Đã chốt [năm mã](../docs/specifications/Agent_Design.md#rag-retrieval-statuses): `OK`, `NO_MATCH`, `NO_SOURCE`, `DENIED`, `ERROR`; `degraded` là cờ riêng. Có bằng chứng không tự nghĩa là đủ trả lời; lỗi cấp scope không tự nghĩa là bị từ chối quyền. Schema/mã nguyên nhân/HTTP còn mở.
- [Query RAG theo context](../docs/specifications/Agent_Design.md#contextual-rag-query) do Agent tạo khi chọn tool; giữ riêng câu hỏi gốc để đối chiếu. Chưa rõ đối tượng thì hỏi lại; scope hợp đồng/tài liệu/phiên bản vẫn do adapter/Core cấp, không lấy từ query làm quyền truy cập.
- [Ngân sách kết thúc](../docs/specifications/Agent_Design.md#finish-budget-reserve) được dành sẵn trong trần tổng: ngừng tool ở ngưỡng kết thúc, Agent tổng hợp phần đã xác minh rồi qua Finalize. Chạm trần cứng/hết deadline thì báo chưa hoàn thành qua Core, không gọi thêm LLM hoặc phát bản nháp lỗi. Ngưỡng/phần dự phòng và schema lỗi còn mở.
- [Giới hạn thực thi đã chốt về nguyên tắc](../docs/specifications/Agent_Design.md#agent-execution-limits): tool/RAG, số lần gọi model sinh, bước graph và deadline là các lớp khác nhau. Chưa chốt số lần gọi model, trần bước graph hoặc deadline chung; cần đặc tả cấu hình và hành vi hết ngân sách trước tích hợp.
- TypeScript và Python trao đổi theo đặc tả trung lập ngôn ngữ; không import trực tiếp mã nội bộ của nhau.
- Chọn định dạng và cách sinh client khi bắt đầu tích hợp. Chỉ thêm package dùng chung khi có người dùng thực tế.
- Mẫu request/response chỉ chứa định danh và dữ liệu giả lập; không chứa token hay URL đã ký.


## Agent contracts v1 — đề xuất chờ review G1

[`agent-v1.md`](agent-v1.md), [`agent-v1.schema.json`](agent-v1.schema.json) và [`fixtures/agent-v1.json`](fixtures/agent-v1.json) đặc tả các kiểu Web ↔ Core, Core ↔ Agent, tool, kết quả truy xuất/kết quả Agent và state checkpoint theo Task 1 của [kế hoạch Agent/RAG](../docs/superpowers/plans/2026-10-31-agent-rag-implementation.md). Kiểm bằng `node --test apps/core/test/agent-contracts.test.cjs`. Đây là đề xuất, chưa duyệt; chưa có API, bảng hoặc runtime dùng các contract này. Các điểm cần chốt nằm ở [mục 11](agent-v1.md#11-cần-chốt-ở-review-g1).

## Trạng thái 30/10/2026

API local hiện đã có controller/DTO và Swagger cho auth/profile/assigned customers; native WebSocket `/api/v1/realtime` chỉ invalidation account/profile/assignment. Thư mục này chưa có schema giao tiếp được version hoặc generated client riêng, không có nghĩa toàn bộ dự án chưa có API.

[Bản đồ API UI](../docs/ui/staff/api-map.md) phân biệt A01–06 đã có với A07–28 đề xuất. Contract policy context update, Customer business APIs và chat/Ticket/notification events/replay còn thiếu; kênh invalidation không xác lập các contract đó. Xem [checklist và gap](../docs/ui/implementation-status.md) trước khi thêm schema/client.
