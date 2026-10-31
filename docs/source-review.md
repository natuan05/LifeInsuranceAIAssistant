# Đối chiếu nguồn và việc cần chốt

Cập nhật vận hành 31/10/2026: theo yêu cầu người dùng, FE/BE local chỉ chạy full Docker qua gateway. Đã bỏ chế độ host npm cùng các file core.env/core-password riêng cho chế độ đó; npm chỉ còn phục vụ build/check và tool quản trị riêng. File operator được giữ/chuyển sang thư mục dữ liệu người dùng ngoài repo; không tự xóa dữ liệu người dùng hoặc Docker volumes. Xem [hướng dẫn hiện hành](getting-started.md).

Cấu hình local tập trung ở `.env` root: Compose ánh xạ biến cho đúng service/build; `.env.example` không chứa secret thật. Có thể cung cấp credential khởi tạo qua `.env` riêng, prepare kiểm khớp volume hiện hữu và từ chối xung đột thay vì rotate/reset. Web chỉ nhận cấu hình công khai. Helper khởi động tạo mẫu nếu thiếu và thông báo đường dẫn sau thành công. Xem [cấu hình Docker](getting-started.md#environment).

Đọc ngày **24/10/2026**. Không sửa Google Docs nguồn. Ngày 25/10/2026 đã bổ sung AuthSession vào bản Data Model trong repo theo yêu cầu người dùng; xem [bảng 17](specifications/Data_Model.md#bảng-17-auth_sessions). Các liên kết Google Docs trỏ đến từng tab đã đọc.

> Trạng thái implementation đã đối chiếu lại **30/10/2026**: [checklist UI và gap](ui/implementation-status.md). Các mô tả nguồn bên dưới là lịch sử/thiết kế; baseline local trong repo được ghi riêng, không chỉnh Google Docs/PDF bên ngoài.

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
| 4. Identity và phạm vi Staff | Application dùng Identity Provider; DataModel USERS lại giữ password_hash/khóa đăng nhập. STAFF_ASSIGNMENTS chỉ cho một Staff/Customer; Security còn nhắc tenant chưa được đặc tả trong SRS. | Local đã chốt email/password cookie session, operator cấp tài khoản và active assignment có lịch sử; đã có Prisma/API. Identity cloud/ánh xạ IdP và tenant vẫn mở, không thêm tenancy ngầm. |
| 5. Quyền tài liệu và phiên bản | RAG §14 nêu hợp đồng chưa gắn phiên bản điều khoản áp dụng. Bảng 16 nhắc lọc owner_customer_id trong khi sơ đồ Data và RAG yêu cầu Core cấp cặp document/version. RAG §9 dùng cả DENIED và INSUFFICIENT cho danh sách rỗng. | Contract scope, độ mới và thu hồi quyền, chọn phiên bản theo hợp đồng; phân biệt lỗi quyền/lỗi nguồn/không tìm thấy. Không để metadata owner hoặc LLM làm nguồn cấp quyền. |
| 6. Ticket, tiếp quản và thông báo | SRS UC-005 yêu cầu xác nhận, Ticket + outbox cùng transaction; DataModel mới có idempotency_key/confirmed_at, chưa định nghĩa replay. ADR-AI-11 đề xuất BullMQ có điều kiện; roadmap trình bày BullMQ trong bảng giải pháp. | Nội dung và hiệu lực xác nhận, phạm vi khóa chống trùng, xử lý timeout/retry; chặn Agent ghi khi Staff tiếp quản; queue, retry/replay và vị trí Worker. Không coi queue đã chốt hoặc hứa exactly-once. |
| 7. Phạm vi dữ liệu và schema | AI Module v0.1 nhắc một sản phẩm; Orchestrator/RAG dự kiến 3 chính và 4–5 bổ trợ. CONVERSATIONS.customer_id trong từ điển ghi NULLable nhưng mô tả bắt buộc; Staff Copilot có thể cần ngữ cảnh rõ hơn. | Corpus PoC tối thiểu, quan hệ sản phẩm–hợp đồng–phiên bản; Staff hỏi chung hay bắt buộc chọn Customer; các trường/ràng buộc trước migration. Local đã tạo các bảng theo yêu cầu tiếp theo; vẫn phải chốt contract/nguồn dữ liệu trước API, không coi bảng tồn tại là đã giải quyết các câu hỏi này. |
| 8. Audit và vận hành | Security yêu cầu truy vết đầu vào/tham số/kết quả; NFR-002 và RAG §9/11 hạn chế nội dung Private. Roadmap có mục tiêu tải, idle, quota và HA/DR mang tính đề xuất. | Trường được log, che dữ liệu, người xem, retention/xóa; sau đó mới chốt giới hạn chạy và mục tiêu kiểm thử. Region, sizing, SLO/RTO/RPO còn mở trước cloud. |

Nguyên tắc giữ nguyên: chỉ dữ liệu riêng giả lập; Core thực thi quyền và nghiệp vụ; retrieval đúng quyền; trạng thái Agent bền vững; Ticket cần xác nhận và chống trùng. Auth/assignment/schema local đã có baseline riêng như mục dưới; các điểm mở về AI/cloud/contract nghiệp vụ còn lại chưa được giải quyết chỉ bằng việc tạo bảng hoặc khung UI.

## Cập nhật implementation local ngày 25/10/2026

Theo yêu cầu tiếp theo, đã tạo toàn bộ model/bảng và Compose full stack. Phạm vi cùng khác biệt nguồn được ghi tại [baseline local](architecture.md#local-data-model) và [data models](architecture.md#local-data-model): auth sessions, mã tài khoản, lịch sử phân công, operator audit, con trỏ phiên bản tài liệu, timestamp xác nhận Ticket không mặc định và vector không cố định chiều. Đây là baseline cấu trúc local; không suy ra các điểm mở về identity cloud, scope retrieval, checkpoint, xác nhận Ticket, concurrency takeover hoặc queue đã hoàn tất chỉ vì bảng tồn tại.


## Đối chiếu sau triển khai UI — 30/10/2026

- **Đã giải quyết local:** auth/account/password/logout, profile/assigned-customer list/detail/pagination; Staff UI/routes/menu/account; rename InsurancePolicy/PolicyStatus/insurance_policies bằng migration thứ tư; invalidation native WebSocket cho account/profile/assignment.
- **Một phần:** FR-001 chưa có public registration/IdP; FR-002 mới read-only; FR-003 thiếu search. Customer layout/menu mới chưa hoàn thiện.
- **Chưa giải quyết:** FR-005–013 về chat/Agent/policy/PDF/Ticket/history/summary/notification; Staff đã có một số route/panel nhưng chưa business APIs. Không có FR-004 trong bảng FR nguồn.
- **Khác baseline cần đọc đúng:** Socket.IO trong bảng ADR nguồn không phải thư viện local; local dùng `ws` receive-only. Native channel không chốt chat transport, fan-out, event replay hoặc queue. Sơ đồ External IdP chưa phải auth local hiện tại.
- **Quyết định còn mở:** policy đang xem vs linkedPolicy conversation (chưa API đổi context); policy–terms/version; New/filter; send/takeover/Ticket concurrency/confirmation/idempotency; checkpoint/tool scope; notifications recipient/read/delivery; benchmark/production.

Xem [G01–G10 và checklist từng màn hình](ui/implementation-status.md), [API E/P](ui/staff/api-map.md) và [hướng làm tiếp](next-steps.md). Những chỉnh sửa UI theo yêu cầu người dùng không tự sửa phạm vi hoặc trạng thái ADR-AI nguồn. Lần này đồng bộ tài liệu trong repo, không cập nhật tài liệu online hay thư mục tham chiếu bên ngoài repo.

## Làm rõ yêu cầu chuyển từ Agent sang Staff — 31/10/2026

Người dùng xác nhận thêm luồng UI: Customer có thể chủ động yêu cầu Staff trong lúc chat với Agent; hoặc Agent gợi ý khi không giải quyết được và khách đồng ý/xác nhận gửi. Core thực thi tạo Ticket + outbox, phát thông báo đúng Staff; Staff tiếp nhận rồi trả lời Customer trong cùng cuộc. Nền của hai nhánh đã có ở UC-005/FR-006/009/013; tài liệu UI được bổ sung để diễn đạt đầy đủ điểm bắt đầu, xác nhận, notification và thao tác trả lời. Cách nói Agent tạo thông báo được hiểu là Agent gọi Business API, không chuyển quyền ghi DB/chọn recipient sang LLM.

Luồng chuyển sang Staff được ghi tại [Customer chat](ui/customer/chat.md), [Staff hội thoại](ui/staff/conversations.md), [notification](ui/staff/notifications.md), API map và checklist. [Customers](ui/staff/customers.md) là phạm vi quản lý khách hàng được người dùng chọn để triển khai tiếp, không phải nơi đặc tả luồng chuyển từ Agent sang Staff. Đây là cập nhật tài liệu theo lựa chọn của người dùng, chưa triển khai chat/handoff/Ticket/notification; endpoint/DTO, routing dự phòng, AI khi đang chờ và cơ chế concurrency/delivery còn cần chốt. Không sửa tài liệu nguồn bên ngoài hoặc duyệt mặc định queue/model/cloud mới.

## Hướng hợp đồng và PDF được người dùng xác nhận — 31/10/2026

Người dùng xác nhận cập nhật tài liệu để bắt đầu đợt triển khai hợp đồng: thông tin nghiệp vụ/metadata lưu trong DB, PDF gốc theo phiên bản lưu ở object storage private; Web hiển thị chi tiết từ DB cùng viewer và nút tải cho cả Customer/Staff. Không cần nhân đôi toàn bộ nội dung PDF thành HTML/DB text. Seed phải bao gồm policy và PDF hoàn toàn synthetic; không bổ sung upload trong app, RAG hoặc luồng chat vào đợt này.

Đây là làm rõ hướng PDF/object storage đã có trong ADR-DATA-002/NFR-007 và mở rộng điểm vào UI hai role, **chưa phải implementation hay phê duyệt provider/library/endpoint cụ thể**. Local hướng S3-compatible Docker; MinIO Community cũ không còn là mặc định hợp lý vì [repository chính thức](https://github.com/minio/minio) đã archive/ngừng duy trì. Provider/edition/image/license còn cần đánh giá. [PDF.js](https://mozilla.github.io/pdf.js/getting_started/) là phương án viewer ưu tiên để đánh giá, chưa thêm dependency.

Cần chốt URL ký ngắn hạn hay streaming, giới hạn thu hồi đã cấp URL/file tải, Range/headers/CORS/CSP, mapping policy–terms/version và loại tài liệu/schema trước code. Giữ Core sở hữu quyền và cấp access; Customer theo ownership, Staff theo active assignment. Chi tiết ở [C05](ui/customer/documents.md#hướng-triển-khai-policypdf-đã-thống-nhất--31102026), [Staff policies](ui/staff/policies.md), [Customer policies](ui/customer/policies.md), [API map](ui/staff/api-map.md) và [thứ tự triển khai](next-steps.md). Chỉ sửa tài liệu hiện có trong repo; không tạo report, không sửa Google Docs/ADR nguồn bên ngoài và không dựng hạ tầng trong lượt này.

Cơ chế local đã chốt (31/10): người dùng chọn MinIO **chỉ local** theo mô hình Compose/private bucket/volume/init job, SDK S3 và signed URL; Core kiểm session/quyền/phiên bản trước cấp, local TTL mặc định 15 phút có cấu hình. Quyết định này thay thế phần provider/access còn mở ở đoạn trên; SeaweedFS và stream qua Core không phải lựa chọn mặc định. Chọn/pin edition/image/digest/license khi triển khai, dùng credential riêng và tách quyền đọc/ghi. AWS S3 là bước sau: giữ contract, thay config/IAM, di chuyển object/kiểm checksum và chạy lại tests tương thích; chưa tạo hạ tầng AWS.
