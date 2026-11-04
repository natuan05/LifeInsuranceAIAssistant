# I04 — Giao diện Inbox Staff, accordion và chat cuộn

Ngày 03/11/2026 · **Đã triển khai/kiểm chứng 04/11/2026** · [Chung](../03-inbox-contract.md) · Trước: [I02](02-inbox-read-api.md), [I03](03-handoff-transcript.md) · Tiếp: [I05](05-messaging-customer.md).

## 1. Kết quả để review

Giao diện Staff dùng Core thật: All/Requests/Active, accordion theo khách, search tự động/Enter, Accept request, xem chat cuộn. Không dựng lại màn history bằng các bảng metadata. Composer chưa gửi trong I04; không nút Send/Templates/attachment giả. Tới I05 mới bật chức năng gửi.

Account/Customers/Policy/PDF và sidebar chung giữ hành vi đã kiểm thử. Nội dung Inbox thay tại slot của workspace, không viết lại toàn Staff shell.

## 2. File và tích hợp

| File hiện có | Thay đổi |
| --- | --- |
| `apps/web/src/components/staff-reference-workspace.tsx` | Nhận filter mới/mount Inbox, bỏ logic khung legacy cho Inbox; không sửa data flow Customers/Policies |
| `apps/web/src/components/staff-reference-template.tsx` | Thay nhãn sidebar All/Requests/Active; bỏ New/chi tiết thừa ở nhánh Inbox |
| `apps/web/src/components/staff-portal.tsx` | Giữ key theo actor.id, không theo query/route |
| `apps/web/src/components/auth-screen.tsx` | Truyền session.csrfToken trong memory xuống action Accept; giữ refresh/focus/expiry đã tối ưu |
| `apps/web/src/app/staff/(workspace)/inbox/page.tsx` và `[conversationId]/page.tsx` | Hiện là route shell; giữ ownership render ở workspace, không mount thêm bản chat trùng |
| `apps/web/src/lib/auth-api.ts` | coreRequest hiện chỉ ném AuthError(status); không đổi toàn bộ caller để parse lỗi Inbox |

File **cần tạo**: `apps/web/src/lib/conversation-api.ts`, `components/staff-inbox.tsx`, `staff-inbox-directory.tsx`, `conversation-transcript.tsx`, `handoff-request-panel.tsx`. Chỉ thêm hook hỗ trợ khi có lifecycle thực sự cần tách. API wrapper Inbox parse error code/requestId có allowlist, dùng coreApiUrl/credential/no-store hiện có, nhận AbortSignal; không tạo package/network stack mới.

Đọc guide Next trong node_modules theo AGENTS trước viết code, nhất là History API/useSearchParams/navigation. Tailwind4 prefix `tw:`; không stylesheet, inline style, CSS Modules hoặc @apply.

## 3. Bố cục và hành vi

```text
Sidebar chung | Danh sách nhóm khách       | Cuộc đang chọn
All           | ô tìm tên hoặc mã         | header tên/mã + tiêu đề
Requests      | ▾ Customer A · CUS-...     | request metadata + Accept
Active        |   Chủ đề 1 · thời gian    | HOẶC transcript cuộn
              |   Chủ đề 2 · thời gian    | không panel details mặc định
              | ▸ Customer B · CUS-...     |
```

Desktop dự kiến từ 1024px: list 280–360px, chat min-width0 chiếm phần còn lại, mỗi vùng tự cuộn. Hệ thống layout có min-height0 để không đẩy composer/transcript xuống ngoài màn. Không lồng nhiều scrollbar toàn trang. Mobile: chỉ list hoặc chat, nút quay về **danh sách Inbox** giữ context; không thêm nút Customer profile/Back to Inbox thừa trên desktop.

Icon thu gọn list nằm trong header list, aria-label/tooltip và aria-expanded, không chữ “Hide results”. Thu gọn giữ chỗ mở lại và lựa chọn hiện tại. Panel metadata phụ đóng mặc định, không tự bật khi mở cuộc/Accept.

### 3.1. Accordion

Tên + mã Customer, không số cuộc/badge/tổng số. Có thể mở nhiều nhóm. Enter/Space trên button; aria-expanded/controls, list item dùng Link/aria-current. Mỗi nhóm lazy request một lần cho key actor/filter/customer, có retry/tải thêm riêng. Đóng nhóm không tự tải thêm hoặc xóa cuộc đang đọc.

Active row: subject, thời gian an toàn, nhãn Direct/Transferred nếu cần. Pending row: chỉ sharedSubject/request time/status Requests; không lastMessage/AI preview. Không mã CHT hoặc số thứ tự giả.

### 3.2. Search

Placeholder “Customer name or code”; input draft tách applied search. Debounce 300ms, Enter chạy ngay và hủy timer; event.isComposing/compositionstart/end để không submit IME sớm. Không Search/Clear buttons; xóa input là bỏ lọc sau debounce/Enter.

Trim/case/literal/100 ký tự theo I02, không thêm email/phone/policy/message search ở FE. Đổi search/filter abort group/list requests cũ, reset cursors, giữ focus, không remount workspace. Stale response không ghi đè key mới. Không prefetch mọi transcript khi render rows.

### 3.3. Request và Accept

Khi A09 readMessages=false: chỉ request metadata và Accept, không gọi A10. Accept dùng CSRF session memory, expectedVersion A09 và UUID key một lần cho action; disable khi pending. ACK thành công hoặc reconcile chứng minh commit mới gọi A10. Timeout giữ cùng key/payload và hiển thị trạng thái “Đang kiểm tra kết quả”, không tự tạo key mới.

STALE_CONVERSATION revalidate A09, không auto-Accept lần nữa. Mất quyền clear ngay, 401 auth xử lý đúng Staff login. Không tạo Ticket từ Accept.

### 3.4. Transcript

Initial latest batch50 tin, render tăng dần, cuộn cuối sau mount nội dung. Customer trái; AI/Staff phải nhưng có nhãn tác giả, không gộp AI thành Staff. SYSTEM Customer-facing hiển thị nhẹ. Render text có xuống dòng, không dangerouslySetInnerHTML. Citations chỉ link quyền riêng khi có contract.

Cuộn gần đầu tải before, tối đa một request cùng direction/key. Trước prepend lưu first visible message id + offset hoặc scrollHeight delta; sau DOM cập nhật khôi phục anchor. Không dùng inline style để bố trí. Không jump cuối khi tải lịch sử/realtime refresh.

Merge dedup theo id/sequence, sort bằng BigInt hoặc comparator thập phân an toàn, không Number(sequence). Đang ở cuối mới auto-scroll tin mới; đang đọc trên giữ vị trí và nút xuống tin mới **không badge đếm**. Chuyển cuộc abort read cũ; lỗi batch cũ giữ history đang có và retry tại đầu.

## 4. API sử dụng và state

Không thêm Core API I04; consume A08 groups/lazy, A09 metadata, A11 Accept + command lookup, A10 before/after từ I02/I03. Không A07/read marker/Copilot/Ticket endpoints.

| State | Render / network |
| --- | --- |
| Chưa chọn | Directory + lời nhắc ngắn, không request transcript |
| Loading groups | Skeleton vùng list, input/sidebar còn dùng |
| Không có cuộc | Empty state theo filter, không “0 conversations” |
| Pending selected | Request panel, không A10/composer |
| Active selected | A09 rồi A10 sau readMessages gate |
| Network read fail | Retry vùng list/chat, không F5 |
| Quyền bị thu hồi | Abort, clear transcript/selection cache liên quan, metadata recheck |
| Lỗi background chưa xác minh quyền | Không để nội dung Private tiếp tục tương tác; theo fail-closed auth hiện có |

Keys: actorId + conversationId cho transcript; actorId/filter/appliedSearch/customerId cho directory. Revisions để retry không làm logical key đổi hoặc remount input. Cache/scroll/expanded groups trong memory, xóa khi logout/actor/scope đổi; không localStorage transcript/CSRF.

## 5. URL và điều hướng

`/staff/inbox?filter=requests&search=...`; All bỏ filter hoặc all. Deep link `/staff/inbox/:conversationId` giữ query; customerId tùy chọn thu hẹp list. Không cursor, transcript, signed URL trên URL.

Legacy request→requests, recent→active, all→all; new/AI-active/Closed hoặc unknown normalize về All bằng replace, recheck Core. Không tạo enum mới từ nhãn URL.

Query cùng màn dùng History API tích hợp useSearchParams sau khi đọc guide; chọn cuộc dùng Next Link/router. Back/Forward khôi phục applied search/filter/expanded group/selection/scroll trong memory đúng actor, không document navigation. Cuộc còn quyền nhưng ngoài kết quả được giữ với notice nhỏ; quyền mất phải clear, không giữ vì deep link.

Deep link A09 cấp quyền trước, mở đúng group theo customer từ safe response, không suy từ URL rồi tải history. Không đổi customer/profile breadcrumb của màn Customers/Policy.

## 6. Sơ đồ lifecycle

```mermaid
flowchart TD
  URL[URL và actor] --> Q[Load groups theo query key]
  Q --> G[Mở nhóm tải lazy list]
  G --> S[Chọn cuộc]
  S --> D[GET A09]
  D --> P{readMessages?}
  P -->|Không| R[Request panel]
  R --> A[Accept và reconcile]
  A -->|Commit xác nhận| D
  P -->|Có| T[Latest transcript]
  T --> B[Cuộn lên before giữ anchor]
  T --> N[Tin mới qua after, không cướp scroll]
  D -->|401 hoặc mất quyền| C[Clear Private và abort]
```

## 7. Các bước triển khai

1. API wrapper/errors/AbortSignal, route/query normalization và tests state.
2. Thay nhãn sidebar/mount Inbox slot; regression các màn còn lại.
3. Search/accordion/cursor/local retry/deep links.
4. Request Accept/reconcile; chứng minh không có A10 trước commit.
5. Transcript/order/scroll/anchor/mobile/keyboard; không bật gửi.
6. Review DOM/accessibility/network và E2E đọc/Accept với Docker Core thật; cập nhật checklist đúng phạm vi.

## 8. Test plan

File **cần thêm**: `apps/web/tests/browser/staff-inbox.spec.mjs`; E2E thật tách `staff-inbox.integration.spec.mjs` để không nhầm với mock network. Dùng Playwright config Docker hiện có, screenshot/video/trace off. Fixture thật tự tạo/dọn qua test container; không thêm data generator production.

| ID | Kiểm tra browser | Kết quả |
| --- | --- | --- |
| I04-T01 | Debounce/Enter/IME/xóa input | Đúng tên/mã, không submit sớm hoặc request trùng/tải trang |
| I04-T02 | Response search cũ chậm | Không ghi đè query mới, focus giữ |
| I04-T03 | Nhiều accordion + keyboard/lazy | aria đúng, không tải transcript hàng loạt/counts |
| I04-T04 | Pending select/Accept success/timeout/conflict | Không A10 trước commit; cùng key reconcile; active sau ACK |
| I04-T05 | 150 tin, prepend/tie/sequence lớn | Giữ anchor, sort/dedup đúng, không page number |
| I04-T06 | Tin mới khi đọc trên | Không jump/cướp focus, nút xuống không count |
| I04-T07 | Deep link/Back–Forward/legacy queries | URL context/scroll đúng, no document reload |
| I04-T08 | 401/403/404/network/timeout | Clear Private khi mất quyền, retry đúng vùng |
| I04-T09 | Desktop/mobile/list collapse | Không horizontal overflow, icon toggle/focus đúng, không details tự mở |
| I04-T10 | Chuyển Account/Customers/Policies, focus tab | Tính năng cũ pass, workspace ổn định/auth không spam |

Chứng minh no-F5 bằng document request counter, performance navigation entries và sentinel trên window giữ nguyên; không chỉ nhìn spinner. Chứng minh không remount bằng focus/draft/list state, không dùng screenshot.

Manual: tìm mã khách → mở hai nhóm → chọn request chỉ thấy thông tin đã chia sẻ → Accept → cuộn tới tin AI cũ → Back/Forward → đổi màn rồi quay lại. Không giả rằng send/realtime đã xong.

## 9. Điều kiện hoàn tất

- [x] UX đúng All/Requests/Active, không counts/Search/Clear/metadata thừa.
- [x] DOM/keyboard/mobile/scroll/no-F5 tests pass; HTTP và E2E thật báo riêng.
- [x] Accept đúng gate, transcript có history trước handoff, không gọi A10 lúc pending.
- [x] Composer gửi chưa bật; tại mốc I04 I05 chưa hoàn tất, không nhận cả phần AI vào milestone này.


## 10. Implementation và kiểm chứng 04/11/2026

- Code: `lib/conversation-api.ts`, `staff-inbox.tsx`, `staff-inbox-directory.tsx`, `conversation-transcript.tsx`; mount tại slot `StaffReferenceWorkspace`. CSRF từ session trong bộ nhớ, không gọi auth/me riêng trước Accept.
- All/Requests/Active, normalize legacy, debounce 300ms/Enter/IME; không counts/Search/Clear/New. Nhiều nhóm mở độc lập; tải thêm bằng cursor, retry theo vùng. Query dùng History API, lựa chọn dùng Next Link; Back/Forward không reload document.
- Pending chỉ metadata; Accept giữ UUID/payload gốc khi chưa biết kết quả, reconcile rồi replay cùng command nếu chưa tìm thấy receipt. Conflict chỉ revalidate, không auto-Accept. Mất quyền xóa transcript/cache; 401 về Staff login.
- Transcript latest/before/after, thứ tự BigInt, dedup, giữ anchor khi prepend và nút Jump to latest khi đang đọc trên. Bộ nhớ chỉ trong phiên UI theo actor; không lưu transcript/CSRF vào browser storage. Citation chỉ hiển thị label/page đã được Core cấp, chưa tạo link PDF không có policy context.
- `npm run lint --workspace apps/web`, `npm run typecheck --workspace apps/web`, Docker build Web pass. Browser: `npm run test:browser --workspace apps/web -- staff-inbox.spec.mjs staff-inbox.integration.spec.mjs staff-account.spec.mjs staff-session.spec.mjs staff-customers.spec.mjs staff-policies.spec.mjs`.
- 15 ca Inbox browser mock kiểm UI/network/keyboard/IME/no-F5/scroll/mobile/error/reconcile; 1 browser E2E gateway thật tạo Customer consent/request, Staff Accept, đọc 125 tin Customer-facing trước handoff, chặn internal/AI riêng/Staff khác. 78 ca Account/Session/Customers/Policy/PDF hồi quy. Không đồng nhất HTTP test với browser E2E.
- Fixture thật dùng `apps/core/test/support/browser-inbox-fixture.cjs` trong core-tests, session ngắn hạn qua pipe riêng và tự dọn theo runId; không thay bootstrap hoặc dữ liệu người dùng. Không có screenshot/report Markdown/credential file mới.
- Tại mốc I04 chưa gửi tin nhắn/UI Customer/realtime; I05/I06 hiện đã bổ sung gửi hai đầu, SYSTEM, outbox/realtime/catch-up và handoff notification. Refresh Inbox/chat đã được loại; các kết quả I04 bên trên là mốc lịch sử, không mô tả thiếu realtime ở hiện tại.
