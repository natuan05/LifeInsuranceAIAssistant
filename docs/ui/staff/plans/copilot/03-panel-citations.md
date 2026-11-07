# CP03 — Panel Staff Copilot

04/11/2026 · **P, sau CP02** · [Contract](../08-copilot-contract.md) · [Chung](../00-staff-contract.md).

## 1. Phạm vi và điều kiện bắt đầu

Panel bên chat đúng mẫu repo UI; tra cứu/giải thích/tóm tắt/citations. Phạm vi xác nhận 06/11/2026 không có soạn nháp câu trả lời hoặc Use draft.

## 2. Model và vị trí thay đổi

`staff-copilot-panel.tsx`, `lib/copilot-api.ts`, rail trong `staff-inbox.tsx`, composer; giữ mounted transcript/PDF và per-source memory scoped actor.

## 3. API spec và quyền

Prefix REST `/api/v1`; mọi API trong phase này là **P** trừ API nền được dẫn rõ là E. Quyết định kỹ thuật đề xuất phải review trước code; không sửa schema chỉ từ file plan.

Dùng A24–26/task lookup sau khi CP01 chốt contract. Mở citations qua Core exact version, không URL do LLM tự cấp. Kết quả chỉ ở panel nội bộ; không đưa vào composer hoặc gọi A12.

## 4. Luồng thực hiện

Rail mở panel → source header → history/quick prompts/task state → answer+watermark+citation. Pending source không enable. Đóng/mở/chuyển cuộc giữ đúng scope, không lẫn context; loading/Agent outage/retry/quota/cancel có UI. Revoke xóa nội dung ngoài quyền; không tự gửi Customer. Chính sách task khi logout/hết phiên chờ G3.

```mermaid
flowchart TD
  A[Review model và gate] --> B[Core kiểm quyền và version]
  B --> C[Dữ liệu hoặc transaction phù hợp]
  C --> D[UI cập nhật đúng scope, không F5]
  B --> E[Lỗi / mất quyền / unknown result]
  E --> F[Retry hoặc reconcile theo contract]
```

## 5. Test cases

Browser DOM tests keyboard/Escape/focus375px/200%, no-F5, không có Use draft, composer giữ nguyên, stale source/late task, citations denied. E2E thật đủ grant hỏi AI → đọc kết quả nội bộ; assert không thêm tin vào chat Customer. Không screenshot.

Các ca dưới đây là **kịch bản dự kiến**, chỉ thực thi sau dependency/contract đã chốt trong phần phạm vi; không đánh dấu chức năng đã có.

**Quy ước dữ liệu:** S-A/S-B là hai Staff synthetic; C-A/C-B là hai Customer synthetic khác nhau. Thay alias bằng UUID/token của fixture cô lập; các path HTTP dùng prefix /api/v1 nếu chưa ghi đầy đủ. Chỉ thay assignment, khóa account, inject lỗi hoặc migration trong harness/môi trường test, không trên tài khoản/dữ liệu đang sử dụng.

### CP03-T01 — Kết quả nội bộ không sửa composer hoặc gửi Customer

**Lớp kiểm thử:** Browser dự kiến.
**Điều kiện và dữ liệu:** CP02 trả kết quả tra cứu/giải thích/tóm tắt hợp lệ; composer Staff đang có nháp D0.

**Các bước:**

1. Mở Copilot và gửi câu hỏi, nhận kết quả nội bộ.
2. Kiểm panel không có chức năng soạn nháp Customer hoặc Use draft.
3. Đóng/mở panel, kiểm composer và lịch sử Customer.

**Kết quả mong đợi:** D0 giữ nguyên, không gọi A12, không thêm tin Customer-facing. Kết quả chỉ nằm trong Copilot; yêu cầu soạn nháp Customer được xử lý theo giới hạn MVP.

### CP03-T02 — Citations đúng version và scope

**Lớp kiểm thử:** Browser + API dự kiến.
**Điều kiện và dữ liệu:** Kết quả có citation applied v1 và fixture forged/out-of-scope.

**Các bước:**

1. Bấm citation hợp lệ qua Core.
2. Bấm citation ngoài quyền hoặc revoke source.
3. Đổi cuộc chat trong khi request citation pending.

**Kết quả mong đợi:** Chỉ exact version được cấp; denied không mở file; response nguồn cũ không ghi đè source mới.

### CP03-T03 — Keyboard/mobile và late task

**Lớp kiểm thử:** Browser dự kiến.
**Điều kiện và dữ liệu:** Panel mở tại375px/zoom 200%, task A đang pending.

**Các bước:**

1. Tab qua prompt/kết quả/citations, Escape đóng rồi mở lại.
2. Đổi source sangB.
3. Trả taskA muộn hoặc401.

**Kết quả mong đợi:** Focus trở về control mở, không tràn; kết quả/taskA không lẫnB;401 clear Private, không F5.

**Dọn sau kiểm thử:** xóa đúng fixture/session/object/schema theo runId; phục hồi fault injection và đóng context/socket test. Không reset DB/credential, sửa bootstrap hoặc xóa volumes. Với PDF kiểm metadata/bytes/hash; với UI kiểm DOM/focus/network, không cần screenshot.

## 6. Gate hoàn tất

- [ ] Model/API/quyền/điểm còn mở đã review trước code phụ thuộc.
- [ ] Tests đúng lớp pass; HTTP/mock/browser E2E thật được phân biệt.
- [ ] Scope/phiên/late-response/concurrency/error và no-F5 được kiểm tương ứng.
- [ ] Cập nhật API map/checklist theo code thật, cleanup fixture/artifact; không tự commit.

CP03 không làm trong đợt Staff trước Agent. Sau CP03 mới nghiệm thu CP04/Agent E2E; mock UI không thay chứng cứ AI.

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
    W->>C: Copilot prompt theo source context
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
