# CP04 — Nghiệm thu Agent/Copilot

04/11/2026 · **P, đợt Agent sau** · [Contract](../08-copilot-contract.md) · [Chung](../00-staff-contract.md).

## Data model và phạm vi ảnh hưởng

Bảng bên dưới mô tả tác động của phase, gồm cả ghi gián tiếp qua Core. Tên bảng thuộc schema `business` trừ nơi ghi rõ; cột còn đề xuất được đánh dấu **P**. Web không truy cập DB trực tiếp.

| Bảng/model | Cột hoặc dữ liệu liên quan | Thao tác của phase | Quan hệ/ràng buộc cần giữ | Mức ảnh hưởng và nơi bị tác động |
| --- | --- | --- | --- | --- |
| users + auth_sessions | users.id/role/status, auth_sessions.user_id/token_hash/expires_at/revoked_at | Đọc | AuthSession.user_id → User.id; session phải còn hạn, không bị thu hồi | Cao — mọi API dùng session; không trả token/hash trong DTO |
| staff_assignments + customer_profiles + staff_profiles | staff_id/customer_id/is_active/ended_at, assignment_version, user_id/full_name | Đọc | Assignment gắn đúng Customer/Staff; Inbox còn ràng buộc assignment id cụ thể | Cao — Customers, Policy Lookup, Ticket và Inbox cùng phụ thuộc phân công |
| conversations + conversation_handoffs | customer_id/channel_type/support_origin/direct_assignment_id/assigned_staff_id/status/control_version/subject, state/assignment_id/recipient_staff_id/shared_subject/shared_reason/accepted_at/revoked_at | Đọc | Direct đúng assignment lúc tạo hoặc handoff ACCEPTED còn grant; PENDING chỉ shared metadata, không AI subject/transcript | Cao — Inbox filter/deep link/REST/WS phải cùng gate; không suy grant từ status/assigned_staff_id |
| insurance_policies + insurance_products | customer_id/product_id/policy_number/status, premium_amount/payment_frequency/next_due_date, effective_date/expiry_date/sum_assured/benefits_snapshot, product_code/name | Đọc | Policy.customer_id → CustomerProfile.user_id; product_id → InsuranceProduct.id; unique policy_number | Cao — DTO tiền/ngày/snapshot dùng chung Staff/Customer; không OCR PDF để cập nhật DB |
| documents + document_versions | access_scope/policy_id/owner_customer_id/product_id/current_version, document_id/version_number/is_active/checksum_sha256/storage_bucket/storage_object_key | Đọc | FK (policy_id,owner_customer_id) → Policy(id,customer_id); unique (document_id,version_number); policy dùng exact binding trong benefits_snapshot, Products dùng current_version | Cao — đổi version/scope ảnh hưởng viewer, download và nguồn retrieval; bucket/key không ra DTO |
| conversations + messages | channel_type/assigned_staff_id/customer_id/linked_context_conv_id/linked_policy_id/control_version; messages.audience/sequence/citations/tool_calls_metadata | P — tạo/append nội bộ Copilot, nền cột đã có | STAFF_COPILOT gắn source có transcript grant; INTERNAL không xuất Customer; cần chốt uniqueness theo Staff/source trước migration | Cao — không dùng grant của Staff trước reassignment, không append trực tiếp Customer answer từ Copilot |
| Copilot task/checkpoint — P, chưa có model task app | Dự kiến task id, owner, source, context watermark, state/attempt/lease/result | DDL/storage dự kiến, chưa chọn đầy đủ | Core giữ authorization/business fence; checkpoint Agent dùng store/credential riêng, không là transaction nghiệp vụ | Cao — retry/crash/revoke giữa enqueue/tool/return; không biến ConversationStatus thành task state |

**Schema/migration:** P — không chạy migration trong phase tài liệu. Nền Conversation/Message đã có; task ownership/uniqueness/schema checkpoint chưa chốt, phải migration mới khi triển khai.

**Nhất quán và hồi quy:** Core recheck source/current grant ở enqueue/tool/return; UI không gửi draft thay Staff. Kiểm toàn bộ source lifecycle/Private citation exact version/INTERNAL isolation và stale task theo test của phase. Không mở rộng quyền từ model output.

## 1. Phạm vi và điều kiện bắt đầu

CP01–03 + I07 nếu kiểm Ticket; không chặn phần Staff không Agent.

## 2. Model và vị trí thay đổi

Test harness provider/Agent/Core/Web qua Docker; fixtures synthetic approved, traces tối thiểu an toàn; provider credentials ngoài source/log.

| Vị trí từ root repo | Hiện trạng | Trách nhiệm trong phase | Mức ảnh hưởng | Phạm vi cần kiểm lại |
| --- | --- | --- | --- | --- |
| [apps/core/src/conversations/services/conversation-access.service.ts](<../../../../../apps/core/src/conversations/services/conversation-access.service.ts>) | Hiện có | Hiện có source grant; P adapter Copilot phải gọi lại | Cao | REST/WS transcript và source reassignment |
| [apps/core/src/conversations/conversations.module.ts](<../../../../../apps/core/src/conversations/conversations.module.ts>) | Hiện có | Hiện có module; Copilot controller/task adapter còn P | Cao | Không mở public endpoint giả quyền |
| [apps/agent/](<../../../../../apps/agent>) | Hiện có | Owner phần Agent/checkpoint; chỉ ranh giới cần phối hợp, không triển khai trong đợt tài liệu này | Cao | Service identity, scope tools, durable attempt |
| `apps/web/src/components/staff-copilot-panel.tsx` | Dự kiến — chưa có file | P — panel/history/task/citation theo actor/source | Trung bình | Inbox transcript và composer giữ mounted |
| `apps/web/src/lib/copilot-api.ts` | Dự kiến — chưa có file | P — task/read/cancel DTO sau chốt CP01 | Cao | Không gọi provider/Agent trực tiếp từ browser |

## 3. API spec và quyền

Prefix REST `/api/v1`; mọi API trong phase này là **P** trừ API nền được dẫn rõ là E. Quyết định kỹ thuật đề xuất phải review trước code; không sửa schema chỉ từ file plan.

Dùng APIs thật và trusted task identity. Case hỏi kiến thức PUBLIC, policy PRIVATE đúng quyền, thiếu bằng chứng, summary watermark, từ chối yêu cầu soạn nháp Customer, revoke giữa execution, provider timeout. Ticket draft/confirmation theo I07 và Customer T01/T02, không tự tạo từ Copilot.

## 4. Luồng thực hiện

Staff → Core → Agent → scoped tools/retrieval → internal answer → Staff đọc kết quả. Không thay composer hoặc thêm tin Customer. Customer AI transcript/citation boundary độc lập; aiSummary không tự thành confirmedContent.

```mermaid
flowchart TD
  A[Review model và gate] --> B[Core kiểm quyền và version]
  B --> C[Dữ liệu hoặc transaction phù hợp]
  C --> D[UI cập nhật đúng scope, không F5]
  B --> E[Lỗi / mất quyền / unknown result]
  E --> F[Retry hoặc reconcile theo contract]
```

## 5. Test cases

Các ca dưới đây là **kịch bản dự kiến**, chỉ thực thi sau dependency/contract đã chốt trong phần phạm vi; không đánh dấu chức năng đã có.

**Quy ước dữ liệu:** S-A/S-B là hai Staff synthetic; C-A/C-B là hai Customer synthetic khác nhau. Thay alias bằng UUID/token của fixture cô lập; các path HTTP dùng prefix /api/v1 nếu chưa ghi đầy đủ. Chỉ thay assignment, khóa account, inject lỗi hoặc migration trong harness/môi trường test, không trên tài khoản/dữ liệu đang sử dụng.

### CP04-T01 — PUBLIC, PRIVATE và thiếu bằng chứng

**Lớp kiểm thử:** Agent E2E dự kiến.
**Điều kiện và dữ liệu:** Agent thật đã cấu hình theo contract; corpus synthetic Public và policyA applied v1; S-A đủ grant.

**Các bước:**

1. Hỏi câu Public rồi câu chỉ có trong policyA.
2. Hỏi dữ liệu policyB ngoài quyền.
3. Hỏi một dữ kiện không có trong corpus.

**Kết quả mong đợi:** Source/version đúng, deny Private khác; thiếu căn cứ được thừa nhận, không bịa citation/Claim/payment.

### CP04-T02 — Kết quả Copilot chỉ nội bộ

**Lớp kiểm thử:** Browser + Agent E2E dự kiến.
**Điều kiện và dữ liệu:** S-A có quyền transcript của cuộc C-A đã Accept; Agent thật trả kết quả tra cứu/giải thích/tóm tắt. Composer Staff có nháp D0.

**Các bước:**

1. Staff hỏi Copilot và nhận kết quả nội bộ.
2. Kiểm panel không có Use draft, composer vẫn là D0.
3. Gửi lại callback cùng event và quan sát lịch sử/event hai phía.

**Kết quả mong đợi:** Customer không thấy nội dung/tác vụ Copilot; không gọi A12 hoặc thêm tin Customer-facing. D0 giữ nguyên, callback không tạo kết quả trùng; không có luồng soạn nháp Customer trong MVP.

### CP04-T03 — Revoke và provider outage

**Lớp kiểm thử:** Agent E2E barrier dự kiến.
**Điều kiện và dữ liệu:** Agent task đang chạy, result được giữ; có fixture provider timeout.

**Các bước:**

1. Revoke source trong lúc inference.
2. Cho result/tool callback tiếp tục.
3. Ở task khác mô phỏng timeout rồi reconcile/retry.

**Kết quả mong đợi:** Không trả result Private muộn; durable task không mất/trùng; kết quả test thật phân biệt adapter giả, không ghi prompt/secret.

**Dọn sau kiểm thử:** xóa đúng fixture/session/object/schema theo runId; phục hồi fault injection và đóng context/socket test. Không reset DB/credential, sửa bootstrap hoặc xóa volumes. Với PDF kiểm metadata/bytes/hash; với UI kiểm DOM/focus/network, không cần screenshot.

## 6. Gate hoàn tất

- [ ] Model/API/quyền/điểm còn mở đã review trước code phụ thuộc.
- [ ] Tests đúng lớp pass; HTTP/mock/browser E2E thật được phân biệt.
- [ ] Scope/phiên/late-response/concurrency/error và no-F5 được kiểm tương ứng.
- [ ] Cập nhật API map/checklist theo code thật, cleanup fixture/artifact; không tự commit.

Chỉ đánh dấu FR-007/012/Agent boundary sau E2E thật có scope. Không gộp checkpoint write và Ticket commit.

## Sequence diagram

**Luồng dự kiến:** chỉ áp dụng sau khi các dependency và API ở phần phạm vi được chốt.

```mermaid
sequenceDiagram
    actor U as Staff
    participant W as Web
    participant C as Core
    participant D as PostgreSQL
    participant A as Agent
    U->>W: Gửi câu hỏi theo channel
    W->>C: A25 theo contract đã chốt
    C->>D: Session, source grant và durable intent
    D-->>C: Run/attempt theo contract đã chốt
    C->>A: Trusted service envelope và context version
    A->>C: Business API hoặc retrieval scope
    C->>D: Recheck actor, owner và exact source version
    D-->>C: Dữ liệu đúng quyền
    C-->>A: Context allowlist
    A->>C: Result gắn run, attempt và watermark
    C->>D: Recheck fence và quyền trước lưu hoặc trả result
    alt Scope hoặc control version đã đổi
        C-->>W: Result không khả dụng, không Private muộn
    else Hợp lệ
        C-->>W: Kết quả tra cứu/giải thích/tóm tắt nội bộ
        W-->>U: Đọc kết quả; không sửa composer hoặc gửi Customer
    end
```
