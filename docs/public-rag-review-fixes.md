# Quyết định và chỉnh sửa sau review Public RAG

Ngày: **10/11/2026**. Phạm vi: sửa phần tăng thêm của `agent/task-7-9-public-rag` tại `8fd9842`, sau milestone graph với fake adapters. Người dùng yêu cầu sửa các findings đã trình và lưu riêng quyết định/chỉnh sửa trong file này.

## Căn cứ và phạm vi quyết định

- [Agent Design](specifications/Agent_Design.md) là chuẩn nghiệp vụ; [implementation plan](superpowers/plans/2026-10-31-agent-rag-implementation.md) là chuẩn triển khai. Tham chiếu, embedding và giới hạn model đối chiếu Tasks 7–9. Quy tắc cấu hình/file host đối chiếu [AGENTS.md](../AGENTS.md).
- Đây là lựa chọn thực thi cho đợt sửa đã được yêu cầu. Không đổi bốn tool, ngân sách retrieval/Business Tools, quyền Core hoặc phạm vi Copilot/Ticket.
- Không chọn model/provider/số chiều thắng cuộc, không duyệt corpus hoặc đóng G1/G4/G5 từ việc test pass. Không gọi API trả phí, index corpus Public hoặc nạp Private trong đợt sửa.
- `graph.py` không được thay bằng bản cũ của nhánh. Các sửa Task 5 đã có trên main phải được giữ khi tích hợp. Ngày 10/11 chỉ sửa/review, chưa stage/commit/merge/push; ngày 12/11 người dùng yêu cầu merge vào main rồi tiếp tục review tuần tự.

## 1. Tham chiếu phải theo nội dung thật được trả về

**Lỗi đã tái hiện:** child được tìm thấy không có ref, nhưng parent được trả thay nó có dẫn Điều 3/4/9. Engine chỉ đọc ref của child nên không lấy đích và không báo thiếu. Ngoài ra, ref cùng Điều bị bỏ dù Điều dài được chia nhiều parent; ref mơ hồ đã được corpus phát hiện cũng bị retrieval loại.

**Quyết định sửa:**

- Parser tạo refs cho cả parent và child từ các khối nội dung; tiêu đề cấu trúc không bị coi là một dẫn chiếu tới chính nó.
- Khi parent thay child, engine xét refs của chính parent. `section_parent_keys` ghi danh sách mọi parent part của Điều; chỉ khi tất cả key đã phát mới coi là đã phủ toàn Điều, không suy từ một phần đã lấy.
- Giữ ref cùng Điều để có thể lấy phần khác của Điều đó. Ref mơ hồ không được tự đoán đích, mà trả `UNRESOLVED_REFERENCE`.
- Mở rộng vẫn đúng document/version/policy scope, một bước và trong các cap thử hiện có. Đích không tồn tại, ngoài scope hoặc chưa lấy do cap phải có `missing`; không coi thiếu điều kiện là đủ bằng chứng.
- `ref_max_targets` giới hạn cả số lần lookup đích trong DB, kể cả đích không tồn tại. Cap bằng 0 không đọc đích. Đích đã phủ đầy đủ không tiêu lookup và không nhận cảnh báo cap giả.

**Vị trí:** `apps/agent/src/life_agent/corpus.py`, `retrieval.py`. Regression ở `tests/test_retrieval.py`: child không ref nhưng parent có ref; Điều chia nhiều parent; ref “như trên”; target ngoài scope; target missing và expansion cap. Các kiểm tra logic dùng fixture hoàn toàn synthetic, không phải bằng chứng quyền tích hợp Core.

## 2. Không dùng config ID thay cho toàn bộ không gian embedding

**Lỗi đã tái hiện bằng SQL thật:** đổi model/version nhưng giữ `config_id` vẫn search `OK`; indexer bỏ qua dựng lại do fingerprint không đổi.

**Quyết định sửa:**

- Identity gồm `provider`, `model_id`, `model_version`, `dimensions`, `config_id`, `input_format`, `normalize`. Prefix/task format và normalization là một phần cấu hình tạo vector, không chỉ metadata mô tả.
- `IndexReader.profile()` trả identity đầy đủ và số chiều vector thực trong DB. Search từ chối `EMBEDDING_INCOMPATIBLE` trước khi so vector nếu có khác biệt.
- SQL vector lọc đúng identity đầy đủ và số chiều trong scope; không chỉ lọc tên config.
- `fingerprint(version, embedding_identity)` nhận toàn identity. Đổi identity cần bộ vector tương ứng; không được đánh dấu nạp trùng chỉ vì config ID giống nhau.
- Metadata chunk chuyển từ `rag-chunk-v1` sang `rag-chunk-v2`, để thay đổi refs/identity làm fingerprint khác. Không thêm bảng, migration hoặc đổi số chiều cột vector.

**Ảnh hưởng index cũ:** cần dựng lại có chủ đích bằng indexer offline sau khi được phép chạy đúng cấu hình/corpus. Tool không tự nâng index, gọi provider hay reset dữ liệu/credential. Indexer vẫn ghi trọn document/version trong một transaction; lỗi không được làm mất phiên bản đang có.

**Vị trí:** `model.py`, `corpus.py`, `retrieval.py`. `test_retrieval.py` kiểm model/version/dimensions khác nhưng cùng config ID; `test_retrieval_db.py` kiểm search từ chối và reindex thật khi đổi version, cùng các kiểm atomicity/dedup/role đã có.

## 3. Bỏ retry model ngầm ngoài ledger

**Lỗi đã tái hiện:** cap một model call nhưng wrapper gặp HTTP 429 có thể gửi thêm request; ledger và báo cáo vẫn ghi một call. Lịch chờ cũng nằm ngoài kiểm soát deadline của graph.

**Quyết định sửa:** `RecordingModel` chỉ ghi từng provider attempt mà graph đã reserve. Wrapper không tự chờ hoặc retry; HTTP 429 được trả thành lỗi model của lượt. Ghi attempt trước khi gọi, giữ cả call thất bại với mã lỗi đã lọc; không log nội dung request hoặc exception chứa payload/credential.

Các token có usage do provider trả vẫn được cộng theo decide/summary/repair. Báo cáo có `failed_model_calls`; call lỗi không có usage không được coi là provider đã tiêu thụ không token. Khi có call lỗi, tổng chi phí generation là `null` và chỉ ghi `known_usage_estimate` cho phần đã biết. Không lấy giới hạn một retry của Business Tools áp cho model; policy retry model khác cần review riêng cùng budget/deadline.

**Vị trí:** `apps/agent/evaluation/evaluate.py`, regression `test_recording_model_does_not_hide_retries_or_failed_calls`. Test chạy graph và wrapper thật với provider giả lập 429, kiểm một request thực thi tương ứng một reservation và một call được ghi.

## 4. Cấu hình root và file tool ngoài checkout

**Quyết định sửa:**

- Agent host tools mặc định đọc `.env` root; process environment được ưu tiên. Chỉ trả các biến `GEMINI_*`/`LIFE_AGENT_*`, không chuyển các biến DB owner/Core/MinIO sang Agent clients.
- Chuyển mẫu Agent settings vào `.env.example` root, bỏ `apps/agent/.env.example`. Các DSN để trống, không tự sao chép hoặc đổi credential đang có. Không tự xóa `.env` cũ của thành viên.
- Kết quả evaluation mặc định ở thư mục dữ liệu người dùng theo cùng quy ước `scripts/local-state.mjs`, dưới `LifeInsuranceAIAssistant/agent-eval`. `--out` được chọn ngoài repo; path trong repo bị từ chối trước khi tạo client hoặc gọi model.
- CLI in đường dẫn tuyệt đối file đã ghi. Khi chưa chạy evaluation thì chưa có file báo cáo; credential runtime vẫn ở Docker volumes, tách khỏi file tool xuất trên host.

**Vị trí:** `config.py`, `evaluation/evaluate.py`, root `.env.example`, [Agent README](../apps/agent/README.md). Regression `test_local_configuration.py` kiểm đọc đúng root, loại settings dịch vụ khác và vị trí output.

## 5. Sửa kiểm thử DB không ổn định

`test_same_content_other_version_is_never_returned` từng bắt buộc có Điều 4 trong evidence. UUID fixture ảnh hưởng thứ tự khi điểm hòa; sáu vị trí evidence có thể đã đầy và engine báo `EXPANSION_CAP_REACHED` cho Điều 4. Đây là nhánh hợp lệ theo cap, không phải bằng chứng trả sai phiên bản.

Giữ nguyên kiểm evidence chỉ thuộc phiên bản được cấp. Với Điều 4, test yêu cầu hoặc có evidence, hoặc có `missing` nêu rõ đã chạm cap. Regression assembly riêng kiểm đích tham chiếu được lấy ngoài top-k khi đủ ngân sách. Không tăng cap để ép test pass.

## Kiểm chứng

- Đã viết và quan sát các regression mới fail trên hành vi cũ trước khi sửa: parent refs, same-article refs, vague refs, identity khác nhưng cùng config ID, hidden retry, root env và output path.
- Toàn bộ Python suite sau sửa: **139 pass**, gồm **9 DB tests**, không skip. PostgreSQL/pgvector cô lập dùng bootstrap role của nhánh và migrations hiện có; chỉ fixture synthetic, không dùng volumes/dữ liệu ứng dụng. Có 13 deprecation warnings từ thư viện LangSmith trên Python 3.14.
- Test DB từng không ổn định được chạy thêm **10 lần với UUID fixture mới: 10/10 pass**. Cap giữ nguyên; test vẫn bắt buộc evidence đúng phiên bản và không được bỏ thiếu đích âm thầm.
- Lệnh Python từ `apps/agent`: đặt `PYTHONDONTWRITEBYTECODE=1`, `PYTEST_DISABLE_PLUGIN_AUTOLOAD=1`, rồi `python -m pytest -p no:cacheprovider`. DB tests cần hai `LIFE_AGENT_TEST_RAG_*_DSN` trỏ tới DB synthetic cô lập.
- Contract suite từ root: `node --test apps/core/test/agent-contracts.test.cjs`: **13 pass**.
- Reviewer độc lập, read-only chạy lại **51 tests pass** cho corpus/retrieval/evaluation/local config và không còn blocker trong phạm vi sửa. `git diff --check` sạch; `graph.py` không đổi. Container DB cô lập và file tạm kiểm thử được dọn sau xác minh, không giữ script dùng một lần.
- Các kiểm SQL chỉ chứng minh hành vi retrieval/indexer/role của DB thử. Core API/authorization hiện hành, durability/checkpoint và chất lượng model thật chưa được nghiệm thu từ các test này.

## Kiểm tích hợp ngày 12/11/2026

- Fetch trước tích hợp xác nhận nền remote main là `dd52030`, đã chứa nhánh synthetic-policy-seed do luồng khác tích hợp. Không chạy reset/seed hoặc nghiệm thu lại App từ việc lấy nền này.
- Phần sửa Public RAG được commit riêng; cây merge từ nền main mới giữ nguyên `graph.py` và regression Task 5 của main, không kéo Task 2/4/6 hoặc Private/Copilot vào cùng lần tích hợp.
- Trên cây merge thực tế: **148 Python tests pass**, gồm **9 DB tests**, không skip; **13 contract tests pass**. Có 13 deprecation warnings từ LangSmith. DB kiểm thử riêng dùng RAM và fixture synthetic; không gọi model trả phí hoặc dùng volumes/dữ liệu ứng dụng.
- Thứ tự review sau Public RAG vẫn là Task 2 durable protocol → Task 4 durable store → Private/Copilot → Task 6 HTTP. Trạng thái “accepted” của tài liệu từng nhánh phải được đối chiếu nguồn duyệt, không tự đóng gate chỉ vì đã merge.
