# Đặc thù Hệ thống & Phân tích Tải (Workload Analysis)

Phạm vi: Customer và Staff đã đăng nhập. Các tỷ lệ và số liệu dưới đây là **kịch bản thiết kế**, chưa phải thống kê sử dụng thực tế, kết quả load test hoặc cấu hình hạ tầng đã được nghiệm thu. Kiến trúc thành phần xem [Cloud Architecture](Cloud_Architecture.md); nghiệp vụ Agent theo [Agent Design](Agent_Design.md).

## 1. Đặc thù và Cách tiếp cận

Hệ thống hỗ trợ bảo hiểm được mở theo từng nhóm Staff và Customer, không lấy flash sale làm mô hình tải chính. Đây là giả định quy hoạch; vẫn phải xét burst, reconnect hàng loạt, model chậm và retry khi lỗi.

- Mỗi Staff tương ứng **20 Customer**; mở lần lượt tới 100, 1.000 và 10.000 Staff.
- Số tài khoản không bằng số người hoạt động, kết nối chat hoặc lượt Agent đang chạy. Chỉ tạo phiên Runtime khi có yêu cầu AI.
- Mỗi đợt mở cần dựa vào dữ liệu sử dụng, độ trễ, quota và nút thắt đã quan sát. Chưa gán lịch theo tháng hoặc cam kết số người dùng tối đa.
- Tăng compute hoặc cấu hình máy chỉ hữu ích khi giải quyết đúng nút thắt; thêm Agent không khắc phục model quota hoặc DB đã bão hòa.

## 2. Giả định và Công thức

### 2.1. Giả định sử dụng

| Tham số | Giá trị giả định |
| --- | --- |
| Staff hoạt động mỗi ngày | 60% số Staff đăng ký |
| Customer hoạt động mỗi ngày | 8% số Customer đăng ký |
| Lượt hỏi / Staff hoạt động | 12 lượt/ngày |
| Lượt hỏi / Customer hoạt động | 4 lượt/ngày |
| Lượt hỏi trong giờ đông nhất | 15% tổng lượt/ngày |
| Burst ngắn | Gấp 3 lần trung bình giờ đông nhất, kéo dài 10 phút |
| Thời gian trung bình mỗi lượt | 12 giây |
| Tải tăng do retry | 10% |
| Capacity dự phòng | 20% |

Không dùng các tỷ lệ này như số liệu của Manulife hoặc thống kê ngành. Nếu Staff thao tác thay Customer, cần xác định ranh giới một lượt để tránh đếm trùng.

### 2.2. Quy đổi nhu cầu

Với `S` Staff, `C` Customer và thời gian xử lý trung bình `T` giây:

```text
D = S × 0,60 × 12 + C × 0,08 × 4        (lượt/ngày)
λ_peak = D × 0,15 / 3.600                (lượt/giây, trung bình giờ đông nhất)
λ_burst = λ_peak × 3                     (lượt/giây trong burst)
N = λ_burst × T                         (lượt đang xử lý, chưa dự phòng)
N_capacity = ceil(N × 1,10 × 1,20)       (nhu cầu có retry và dự phòng)
```

`N ≈ λ × T` là xấp xỉ trong cửa sổ tải tương đối ổn định, không là bảo đảm về tail latency. Burst không được áp cho cả ngày. Mốc quy hoạch có thể làm tròn thêm để dễ tổ chức capacity; nó không xác định số máy cần mua.

## 3. Kết quả theo Ba giai đoạn

| Chỉ số | P1 | P2 | P3 |
| --- | ---: | ---: | ---: |
| Staff đăng ký | 100 | 1.000 | 10.000 |
| Customer đăng ký | 2.000 | 20.000 | 200.000 |
| Staff hoạt động/ngày | 60 | 600 | 6.000 |
| Customer hoạt động/ngày | 160 | 1.600 | 16.000 |
| Lượt hỏi/ngày | 1.360 | 13.600 | 136.000 |
| Trung bình giờ đông nhất, lượt/giây | 0,0567 | 0,5667 | 5,6667 |
| Burst, lượt/giây | 0,17 | 1,7 | 17 |
| Lượt đang xử lý, chưa dự phòng | 2,04 | 20,4 | 204 |
| Nhu cầu sau retry/dự phòng, làm tròn lên | 3 | 27 | 270 |
| **Mốc quy hoạch chọn** | **3** | **30** | **300** |

Ví dụ P3: `6.000 × 12 + 16.000 × 4 = 136.000` lượt/ngày; burst `136.000 × 15% / 3.600 × 3 = 17` lượt/giây. Với 12 giây/lượt, có `204` lượt đang xử lý; thêm retry/dự phòng là `269,28`, làm tròn lên `270`, chọn mốc quy hoạch **300 lượt đồng thời**.

**300 là nhu cầu cần phục vụ, không phải kết quả chứng minh cấu hình hiện tại đủ tải.**

## 4. Phân rã Workload theo Thành phần

### 4.1. Cơ cấu lượt Agent và token

| Loại lượt | Tỷ trọng | Model call/lượt | Retrieval/lượt |
| --- | ---: | ---: | ---: |
| Public RAG | 35% | 2 | 1 |
| Business Tools | 25% | 2 | 0 |
| Kết hợp RAG và tool | 30% | 3 | 2 |
| Phức tạp/chuyển nhân viên | 10% | 4 | 2 |
| **Trung bình có trọng số** | **100%** | **2,5** | **1,15** |

Mỗi lượt giả định **tổng 6.500 input token và 1.000 output token trên tất cả model call**; không nhân token thêm 2,5 lần. Output gồm reasoning nếu provider tính loại token đó; chưa trừ lợi ích caching. Đây là cơ cấu tải dự kiến, không phải số call cố định của graph hoặc giới hạn runtime đã chốt.

### 4.2. Nhu cầu model, retrieval, checkpoint và Core

```text
Model call/phút = λ_burst × 60 × 2,5 × 1,32
Input token/phút = λ_burst × 60 × 6.500 × 1,32
Output token/phút = λ_burst × 60 × 1.000 × 1,32
Retrieval/giây = λ_burst × 1,15 × 1,32
Checkpoint logic/giây = λ_burst × 6 × 1,32

Core độc lập/ngày = S × 0,60 × 20 + C × 0,08 × 8
Core logic/giây = (Core độc lập/ngày × 0,15 / 3.600 × 3
                  + λ_burst × 3) × 1,32
```

Hệ số `1,32 = 1,10 × 1,20` gồm retry và capacity dự phòng. Phần Core độc lập không gồm ba lời gọi Core/lượt Agent đã cộng riêng; mỗi lượt Agent giả định sáu checkpoint logic.

| Nhu cầu, đã gồm hệ số 1,32 | P1 | P2 | P3 |
| --- | ---: | ---: | ---: |
| Model call/phút | 33,66 | 336,6 | 3.366 |
| Input token/phút | 87.516 | 875.160 | 8.751.600 |
| Output token/phút | 13.464 | 134.640 | 1.346.400 |
| Retrieval/giây | 0,26 | 2,58 | 25,81 |
| Checkpoint logic/giây | 1,35 | 13,46 | 134,64 |
| Core logic/giây | 1,08 | 10,82 | 108,24 |

Một thao tác logic không nhất thiết bằng một HTTP request hoặc SQL statement. Một checkpoint có thể tạo nhiều lần ghi; không giữ transaction DB trong lúc chờ model. Token thô chưa chắc bằng quota bị trừ: provider MVP đã chốt Gemini API ngày 13/11/2026. Model MVP đã chốt gemini-3.8-flash và gemini-embedding-2, 1536 chiều. Cần kiểm cách tính token, output, `max_tokens`, endpoint và quota thực cấp theo account/region; dùng nhiều model thì phân bổ nhu cầu riêng từng model.

### 4.3. Kết nối chat và môi trường còn giữ compute

| Loại nhu cầu | P1 | P2 | P3 |
| --- | ---: | ---: | ---: |
| Kết nối chat thường | 80 | 800 | 8.000 |
| Reconnect hàng loạt | 240 | 2.400 | 24.000 |

Kết nối chat là browser đang mở ứng dụng; lượt đang xử lý là Agent đang làm việc/chờ tool hoặc model; môi trường còn giữ compute là Runtime chưa kết thúc sau lượt. Ba đại lượng này không tương đương nhau.

Giả định mỗi hội thoại có bốn lượt, nghỉ 60 giây giữa các lượt và giữ idle 120 giây sau lượt cuối:

```text
Thời gian giữ compute = 4 × 12 + 3 × 60 + 120 = 348 giây
Hội thoại mới P3 ≈ 17 / 4 = 4,25 hội thoại/giây
Môi trường còn giữ ≈ 4,25 × 348 = 1.479
Thêm 20% dự phòng → khoảng 1.775 môi trường
```

Đây là xấp xỉ khi dòng hội thoại duy trì đủ lâu, chưa cộng retry 10% vào tốc độ tạo hội thoại. Nếu dùng idle **900 giây như ví dụ trong nguồn**, thời gian giữ là `1.128 giây`, tương ứng `4.794 môi trường` chưa dự phòng khi tải kéo dài đủ lâu; không coi đó là kết quả chính xác của burst chỉ kéo dài 10 phút.

Idle **120 giây là đề xuất**, chưa phải cấu hình Runtime đã áp dụng. Kết thúc compute sớm giảm môi trường giữ lại nhưng có thể tăng lần khởi tạo mới; checkpoint bền vững giữ trạng thái qua các lần khởi tạo. Thời hạn giữ compute khác chính sách logout/hết phiên và không tự chốt chính sách đó.

Tài liệu workload nguồn ghi snapshot quota AgentCore ngày **23/10/2026**: 2.500 Active session workloads tại nhóm region được nguồn mô tả, 25 phiên mới/giây và 1.000 data-plane API request/giây dùng chung. Đây không phải quota hiện hành hoặc quota đã cấp cho dự án; cũng không khẳng định mọi môi trường idle đều được tính vào Active session workloads. Cần đối chiếu định nghĩa và quota thực trước triển khai.

### 4.4. Dung lượng dữ liệu

Giả định mỗi Customer có hai PDF, mỗi PDF 5 MB, và 100 đoạn tài liệu riêng. Mỗi đoạn tạm tính 12 KB gồm text, metadata, vector và phần index. Bảng dùng đơn vị thập phân và giả định dung lượng 12 KB/đoạn. Embedding MVP đã chốt gemini-embedding-2, 1536 chiều ngày 13/11/2026. Dung lượng thực tế cần đo lại với profile này.

| Dữ liệu riêng | P1 | P2 | P3 |
| --- | ---: | ---: | ---: |
| Số đoạn tài liệu | 200.000 | 2.000.000 | 20.000.000 |
| RAG ước tính | 2,4 GB | 24 GB | 240 GB |
| PDF gốc | 20 GB | 200 GB | 2.000 GB |

Chưa gồm tài liệu Public, nhiều phiên bản, business data, checkpoint, backup và dung lượng tạm rebuild index. **240 GB không phải dung lượng ổ đĩa production cuối cùng.**

Core cấp scope theo document/version; retrieval lọc đúng scope ở mọi bước. 20 triệu đoạn toàn hệ thống không có nghĩa mỗi truy vấn tìm trên toàn bộ tập này. Với phạm vi nhỏ có thể đánh giá exact search; phạm vi lớn cần đo FTS/vector/index và ảnh hưởng lọc quyền. Không mặc định ANN, 200.000 partition hoặc chia DB chỉ từ số tài khoản. Tách RAG giúp cách ly tải nhưng tăng chi phí/đồng bộ metadata; read replica còn có độ trễ cập nhật dữ liệu và quyền.

## 5. Nút thắt và Lộ trình Mở rộng

### 5.1. Mở rộng đúng thành phần

| Thành phần | Hướng xử lý | Giới hạn/đánh đổi cần kiểm |
| --- | --- | --- |
| Core | Thêm replica và capacity compute; tăng cấu hình khi phù hợp | WSS/fan-out, state dùng chung, draining và capacity còn lại khi lỗi AZ |
| Agent Runtime | Tăng năng lực phục vụ phiên theo nhu cầu | Quota phiên, tốc độ tạo phiên, invocation và vòng đời compute |
| Model | Đối chiếu hoặc xin tăng quota theo model | Compute Agent tăng không làm quota model tăng; quota có thể không được duyệt |
| Retrieval | Scope trước tìm kiếm, tối ưu index/query; chuẩn bị tách RAG | Chất lượng bằng chứng, cách ly tài nguyên và đồng bộ metadata/quyền |
| PostgreSQL/checkpoint | Giới hạn tổng pool, tối ưu query và số lần ghi; nâng cấp/tách tải khi cần | Schema/role riêng vẫn dùng chung CPU/RAM/I/O; mỗi phiên Agent không mở một pool lớn |
| Worker | Giới hạn concurrency, tăng throughput hoặc tách deployment khi backlog tăng | Retry/dedup, độ bền outbox và tác dụng phụ trùng; Worker riêng chưa là mặc định |

ECS + EC2, AgentCore Runtime, RDS/pgvector, S3 và BullMQ/Redis là các hướng/phương án xuất hiện trong nguồn. Bảng tải không phê duyệt sản phẩm/runtime/broker còn đề xuất trong ADR hoặc ghi đè [Cloud Architecture](Cloud_Architecture.md). Loại Scheduled Task Execution không loại yêu cầu phục hồi outbox chưa publish được; không bổ sung lại scheduler từ phân tích tải.

### 5.2. Mở theo từng đợt

| Giai đoạn | Đợt mở Staff | Trọng tâm |
| --- | --- | --- |
| P0 — Thiết kế/PoC | Chỉ dữ liệu hoàn toàn synthetic | API/quyền, model, checkpoint, xác nhận và chống tạo Ticket trùng |
| P1 | 25 → 50 → 100 | Shared PostgreSQL; Agent chạy riêng; phương án Worker cùng Core; chuẩn bị production nhiều AZ |
| P2 | 250 → 500 → 1.000 | Capacity/quota, tổng kết nối DB; chuẩn bị tách Worker/RAG khi có căn cứ |
| P3 | 2.500 → 5.000 → 10.000 | Quy hoạch 300 lượt đồng thời theo giả định; bảo vệ model/DB, phục hồi toàn dịch vụ |

Đề xuất P1 production có ít nhất hai replica Core trên nhiều AZ; hai replica không tự chứng minh chịu mất một AZ nếu capacity còn lại không đủ. Phục hồi phải bao gồm auth, DB, PDF đúng phiên bản, checkpoint, outbox/notification, secrets và endpoint; RTO/RPO chưa được xác nhận.

Thiết kế dùng một Agent custom LangGraph; tăng tài khoản không thay đổi lựa chọn này.

## 6. Độ nhạy và Chính sách Bảo vệ

### 6.1. Khi nhu cầu hoặc độ trễ thay đổi

| Kịch bản P3 | Lượt/giây | Giây/lượt | Đồng thời sau retry/dự phòng |
| --- | ---: | ---: | ---: |
| Cơ sở | 17 | 12 | 270; quy hoạch 300 |
| Model chậm | 17 | 30 | 674 |
| Nhu cầu gấp đôi, xử lý phức tạp | 34 | 30 | 1.347 |

Độ trễ tăng từ 12 lên 30 giây làm số lượt đang xử lý tăng 2,5 lần khi tốc độ đến không đổi; timeout/retry tăng thêm có thể làm giả định retry 10% không còn đúng.

Kịch bản nặng còn giả định 3,5 model call, 9.000 input và 1.500 output token/lượt. Với hệ số 1,32, nhu cầu là **9.424,8 call/phút**, **24.235.200 input token/phút**, **4.039.200 output token/phút**. Đây là tình huống kiểm tra độ nhạy, không phải dự báo tăng trưởng hoặc quyết định tự chuyển model.

### 6.2. Chính sách đề xuất

- Giới hạn số lượt đang nhận, model/graph steps, token, deadline và retry; queue phải có giới hạn. Nguồn đề xuất xử lý quá tải khi chờ quá **5 giây**; hành vi từ chối/chờ/thử lại cần được đặc tả trước code.
- Retry có giới hạn, backoff/jitter để tránh cùng thử lại một lúc. Khi nhu cầu dự kiến vượt **70% quota thực cấp**, cần điều chỉnh trước đợt mở tiếp theo; không giả định xin tăng quota luôn thành công.
- Core lưu Ticket + outbox atomic sau xác nhận hợp lệ; retry trả cùng kết quả nghiệp vụ. Staff tiếp quản phải chặn thao tác ghi của Agent đang chạy dở.
- Tóm tắt lịch sử dài và chọn bằng chứng cần thiết trong ngân sách; không chia sẻ cache Private giữa Customer hoặc bỏ kiểm quyền để tăng tốc.

Các mốc 5 giây, 70%, idle 120 giây và hệ số tải là **đề xuất của nguồn**, không phải quy định AWS hoặc runtime defaults đã duyệt.

## 7. Đo lường và Bằng chứng Năng lực

| Nhóm chỉ số | Cần theo dõi |
| --- | --- |
| Throughput | Lượt hoàn thành thành công, đạt yêu cầu/giây |
| Độ trễ | p95 tới phản hồi đầu tiên và tới hoàn thành; định nghĩa phản hồi đầu tiên theo transport thực có |
| Độ tin cậy | Lỗi, timeout, throttling, retry và recovery sau restart |
| Quyền/chất lượng | Đúng scope/version, đủ bằng chứng và tình tiết nghiệp vụ cần thiết |
| Tài nguyên chờ | Queue wait/backlog, thời gian chờ kết nối DB, model/Runtime quota |
| Chi phí | Chi phí trên một lượt hoàn thành đạt yêu cầu |

Không chứng minh scalability bằng cách bỏ kiểm quyền, giảm bằng chứng cần thiết hoặc chuyển mọi câu hỏi sang Staff.

Phân biệt ba mức bằng chứng: **tài liệu dịch vụ** mô tả cơ chế và quota công bố; **phân tích capacity** quy đổi nhu cầu và nhận diện nút thắt; **đo thực tế** mới xác nhận cấu hình chịu được tải/độ trễ/phục hồi nào. Setting nhận tối đa 300 lượt chỉ là admission policy, không chứng minh phục vụ được 300 lượt đạt yêu cầu.

Khi demo, trình bày phép tính P3, cấu hình replica/capacity dự kiến hoặc đã áp dụng, quota thực, pool/concurrency/queue/retry và đường tách RAG. Phân biệt bằng chứng đã đo với phương án thiết kế; phạm vi nghiên cứu không bắt buộc dựng toàn bộ hạ tầng P3 để tuyên bố đã có lộ trình mở rộng.

## 8. Ước tính Chi phí Model

Khối lượng tháng dùng 30 ngày, cộng retry 10%, **không cộng capacity dự phòng 20% vào lượng sử dụng**:

```text
Input triệu token/tháng = D × 30 × 1,10 × 6.500 / 1.000.000
Output triệu token/tháng = D × 30 × 1,10 × 1.000 / 1.000.000
```

| Giai đoạn | Triệu input token/tháng | Triệu output token/tháng |
| --- | ---: | ---: |
| P1 | 291,72 | 44,88 |
| P2 | 2.917,2 | 448,8 |
| P3 | 29.172 | 4.488 |

Với đơn giá `P_in`/`P_out` USD trên một triệu input/output token:

```text
Chi phí model P3/tháng = 29.172 × P_in + 4.488 × P_out
```

Dùng nhiều model thì tính riêng rồi cộng. Tổng chi phí còn có embedding, reranking nếu dùng, Runtime, DB, broker, network, observability, backup/DR và vận hành. Model MVP đã chốt gemini-3.8-flash và gemini-embedding-2, 1536 chiều. Đơn giá/quota và ngân sách USD cần được xác minh theo tài khoản, thời điểm triển khai và số liệu sử dụng thực tế.

## 9. Những điểm Cần xác nhận trước Đợt mở tiếp theo

Chốt với bên nghiệp vụ quy mô trung bình/peak kỳ vọng và cách tính một lượt; đo lại tỷ lệ hoạt động, burst, thời gian xử lý, số call/token và retry thực. Sau đó đối chiếu quota/account/region, pool DB, số kết nối chat và capacity khi một phần hạ tầng lỗi. Cập nhật mô hình tải trước khi chọn số máy hoặc khẳng định ngưỡng phục vụ an toàn.
