# Đối chiếu nguồn và việc cần chốt

Đọc ngày **24/10/2026**. Không sửa Google Docs nguồn. Ngày 25/10/2026 đã bổ sung AuthSession vào bản Data Model trong repo theo yêu cầu người dùng; xem [bảng 17](specifications/Data_Model.md#bảng-17-auth_sessions). Các liên kết Google Docs trỏ đến từng tab đã đọc.

## Nguồn

| Nguồn | Phần đã dùng |
| --- | --- |
| [SRS-BHNT v1.1 — Feature Requirement Outline](https://docs.google.com/document/d/1k-4z72QclUwmn4hR71K3tPktRwebv7Q-mS-3y5glGW8/edit?tab=t.fj8akdbj9cz4) | FR/NFR, UC-005 xác nhận Ticket, UC-007 nguồn hợp đồng |
| [ADRs](https://docs.google.com/document/d/1k-4z72QclUwmn4hR71K3tPktRwebv7Q-mS-3y5glGW8/edit?tab=t.7sah20cboyte) | APP/CLOUD/DATA và các đề xuất AI |
| [Application — diagram mermaid](https://docs.google.com/document/d/1k-4z72QclUwmn4hR71K3tPktRwebv7Q-mS-3y5glGW8/edit?tab=t.a5abzlabgqns), [Component Responsibilities](https://docs.google.com/document/d/1k-4z72QclUwmn4hR71K3tPktRwebv7Q-mS-3y5glGW8/edit?tab=t.j4iuyekp2ka7) | Ranh giới Web/Core/AI và quyền tài liệu |
| [Data — Mermaid Diagram Data](https://docs.google.com/document/d/1k-4z72QclUwmn4hR71K3tPktRwebv7Q-mS-3y5glGW8/edit?tab=t.g278rsnovjrr), [DataModel Vũ](https://docs.google.com/document/d/1k-4z72QclUwmn4hR71K3tPktRwebv7Q-mS-3y5glGW8/edit?tab=t.xmp3bxty7dx8) | System of record, outbox, tài liệu và mô hình dữ liệu tham chiếu |
| [Security, Governance, Compliance](https://docs.google.com/document/d/1k-4z72QclUwmn4hR71K3tPktRwebv7Q-mS-3y5glGW8/edit?tab=t.51lx54l5ucqn), [Security](https://docs.google.com/document/d/1k-4z72QclUwmn4hR71K3tPktRwebv7Q-mS-3y5glGW8/edit?tab=t.y2q56ncsnfkm) | Actor đã xác thực, dữ liệu giả lập, quyền tối thiểu, an toàn và audit |
| [AI Agent Module v0.1](https://docs.google.com/document/d/1k-4z72QclUwmn4hR71K3tPktRwebv7Q-mS-3y5glGW8/edit?tab=t.c9q73h9s0bal), [Orchestrator v0.2](https://docs.google.com/document/d/1k-4z72QclUwmn4hR71K3tPktRwebv7Q-mS-3y5glGW8/edit?tab=t.f13sz2idv62j), [RAG v0.1](https://docs.google.com/document/d/1k-4z72QclUwmn4hR71K3tPktRwebv7Q-mS-3y5glGW8/edit?tab=t.x474gnkpxrd8) | Tham khảo luồng và điểm thiếu; bản thiết kế còn chờ review |
| `agent-scalability-roadmap-vi.md`, cập nhật 23/10/2026 | Phân biệt tài khoản/tải đồng thời, checkpoint, phân quyền và lộ trình mở rộng |

Đường dẫn roadmap ngoài repo: `C:\Users\Admin\Documents\ChatGPT\Life Insurance AI Assistant\output\infrastructure\agent-scalability-roadmap-vi.md`.
SHA-256 bản đã đọc: `B14B7C7126D10E24687C54360FFFEB0FAE4831BFDE8DAD97532CE9893B9850D4`.

Hai tab cha Application Architecture và Data & Integration Architecture gần như trống; nội dung nằm ở các tab sơ đồ/trách nhiệm/data model nêu trên.

## Cách dùng quyết định

- Yêu cầu khởi tạo hiện tại xác nhận AWS, Next.js, NestJS modular monolith, Python + custom LangGraph, PostgreSQL + pgvector và các ranh giới nghiệp vụ.
- AgentCore Runtime, ECS + EC2 và RDS là hướng triển khai. Redis/BullMQ đang cân nhắc. Provider, embedding và tự host chưa chốt.
- Nguồn có chữ “đề xuất”, “Draft” hoặc “chờ review” không tự thành quyết định được duyệt. Đặc biệt ADR-AI-01/02/03/04/09/10/11/12/13 còn chứa lựa chọn và điều kiện.
- Repo giữ quyết định tổ chức thư mục tại [ADR-REPO-0001](adr/0001-repository-layout.md); baseline đã triển khai local được tổng hợp ở [kiến trúc](architecture.md) và [hướng dẫn chạy](getting-started.md). Không sửa trạng thái ADR nguồn hoặc suy ra lựa chọn model từ việc dùng AWS.

## Điểm chưa thống nhất và quyết định cần chốt

Chốt từng điểm trước phần code phụ thuộc vào nó; không cần giải quyết toàn bộ để tiếp tục viết tài liệu.

| Điểm | Bằng chứng / khác biệt | Cần chốt trước khi code |
| --- | --- | --- |
| 1. Framework và giao tiếp Agent | Bảng ADR tổng hợp và AI Agent Module nhắc FastAPI/Harness; ADR-AI-03/04 phân biệt custom LangGraph với hosting Runtime. Yêu cầu hiện tại chọn custom LangGraph. | Giao thức Core–Agent, adapter local/Runtime, xác thực dịch vụ và actor context. Không tự thêm FastAPI hoặc Harness. |
| 2. Model và retrieval | ADR-CLOUD-002 giữ Managed API; ADR-AI-01 còn đề xuất và yêu cầu hiện tại chưa chốt cả tự host. RAG §5/7 và DataModel Bảng 16 đặt 768 chiều. | Provider/model sinh và embedding, phiên bản/số chiều index, cách đánh giá; xác nhận thiết kế custom retrieval. Không tạo vector(768) hoặc mặc định Bedrock. |
| 3. Checkpoint và quyền ghi | Orchestrator §2, RAG §2/5 mô tả AI Runtime chỉ SELECT RAG; roadmap bổ sung checkpoint và schema/role riêng. | Backend lưu trạng thái, quyền ghi riêng, migration owner, actor/conversation/thread, resume, lưu/xóa và tương thích phiên bản graph. Không mở quyền business để lưu trạng thái. |
| 4. Identity và phạm vi Staff | Application dùng Identity Provider; DataModel USERS lại giữ password_hash/khóa đăng nhập. STAFF_ASSIGNMENTS chỉ cho một Staff/Customer; Security còn nhắc tenant chưa được đặc tả trong SRS. | Nhà cung cấp đăng nhập local/đích, nguồn credential và ánh xạ user; quy tắc phân công/thay người; PoC có tenant hay không. Không kế thừa nguyên bảng USERS hoặc thêm tenancy ngầm. |
| 5. Quyền tài liệu và phiên bản | RAG §14 nêu hợp đồng chưa gắn phiên bản điều khoản áp dụng. Bảng 16 nhắc lọc owner_customer_id trong khi sơ đồ Data và RAG yêu cầu Core cấp cặp document/version. RAG §9 dùng cả DENIED và INSUFFICIENT cho danh sách rỗng. | Contract scope, độ mới và thu hồi quyền, chọn phiên bản theo hợp đồng; phân biệt lỗi quyền/lỗi nguồn/không tìm thấy. Không để metadata owner hoặc LLM làm nguồn cấp quyền. |
| 6. Ticket, tiếp quản và thông báo | SRS UC-005 yêu cầu xác nhận, Ticket + outbox cùng transaction; DataModel mới có idempotency_key/confirmed_at, chưa định nghĩa replay. ADR-AI-11 đề xuất BullMQ có điều kiện; roadmap trình bày BullMQ trong bảng giải pháp. | Nội dung và hiệu lực xác nhận, phạm vi khóa chống trùng, xử lý timeout/retry; chặn Agent ghi khi Staff tiếp quản; queue, retry/replay và vị trí Worker. Không coi queue đã chốt hoặc hứa exactly-once. |
| 7. Phạm vi dữ liệu và schema | AI Module v0.1 nhắc một sản phẩm; Orchestrator/RAG dự kiến 3 chính và 4–5 bổ trợ. CONVERSATIONS.customer_id trong từ điển ghi NULLable nhưng mô tả bắt buộc; Staff Copilot có thể cần ngữ cảnh rõ hơn. | Corpus PoC tối thiểu, quan hệ sản phẩm–hợp đồng–phiên bản; Staff hỏi chung hay bắt buộc chọn Customer; các trường/ràng buộc trước migration. Không tạo toàn bộ bảng từ bản nháp. |
| 8. Audit và vận hành | Security yêu cầu truy vết đầu vào/tham số/kết quả; NFR-002 và RAG §9/11 hạn chế nội dung Private. Roadmap có mục tiêu tải, idle, quota và HA/DR mang tính đề xuất. | Trường được log, che dữ liệu, người xem, retention/xóa; sau đó mới chốt giới hạn chạy và mục tiêu kiểm thử. Region, sizing, SLO/RTO/RPO còn mở trước cloud. |

Nguyên tắc giữ nguyên: chỉ dữ liệu riêng giả lập; Core thực thi quyền và nghiệp vụ; retrieval đúng quyền; trạng thái Agent bền vững; Ticket cần xác nhận và chống trùng. Các điểm mở trên chưa được giải quyết bằng implementation.

## Cập nhật implementation local ngày 25/10/2026

Theo yêu cầu tiếp theo, đã tạo toàn bộ model/bảng và Compose full stack. Phạm vi cùng khác biệt nguồn được ghi tại [ADR-REPO-0004](architecture.md#local-data-model) và [data models](architecture.md#local-data-model): auth sessions, mã tài khoản, lịch sử phân công, operator audit, con trỏ phiên bản tài liệu, timestamp xác nhận Ticket không mặc định và vector không cố định chiều. Đây là baseline cấu trúc local; không suy ra các điểm mở về identity cloud, scope retrieval, checkpoint, xác nhận Ticket, concurrency takeover hoặc queue đã hoàn tất chỉ vì bảng tồn tại.
