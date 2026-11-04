# CH03 — AI answers, citations và lời gợi ý có xác nhận

04/11/2026 · **Bị phụ thuộc CH02/Agent, chưa triển khai** · [C06](../06-chat-contract.md) · Cần CH01+[CH02](02-agent-boundary.md).

## 1. API/file

Mở rộng `customer-conversations.tsx`, `conversation-transcript.tsx`, `lib/conversation-api.ts`; dùng Message REST I05 làm nguồn answer committed và trạng thái turn/discovery **P** do CH02 chốt trước code. Không browser gọi Agent/provider hoặc tự append answer như server đã lưu. Không đọc Copilot Staff. Nếu cần SSE/tokenstream phải contract riêng, không suy ra từ WS invalidation.

## 2. Trải nghiệm

AI thinking/queued/error gắn đúng trigger/turn, không chiếm ConversationStatus. Retry inference nếu có phải cùng lệnh turn do CH02 quy định; không gửi lại message Customer bằng key mới. Chỉ render content đã xử lý an toàn; Markdown nếu cần phải có sanitizer và allowlist link theo dependency được review. Answer cuối lấy qua REST có sequence, không nhân đôi nội dung khi nhận lại message đã commit.

Citation có title/version/page rõ từ DTO authorized, bấm mở D01/D02 exact version và page hợp lệ; không URL ký trong Message. Quyền mất/tài liệu thiếu hiển thị unavailable, không mở bản newest. Không có nguồn hoặc câu trả lời chưa chắc nói rõ hạn chế, không hứa claim/chi trả.

Gợi ý Staff chỉ mở consent dialog I03, Customer Cancel không tạo request; consent vẫn toàn bộ lịch sử và Staff Accept. Gợi ý Ticket chỉ mở T02 review khi I07 thật, không bấm một nút lập tức ghi Ticket hoặc coi consent handoff thay xác nhận Ticket. Chưa có tool thì không hiện action chết. Không đưa tool trace/raw LLM JSON vào giao diện Customer.

```mermaid
flowchart TD
  A[Customer message đã commit] --> B[Turn progress theo Core]
  B --> C[AI answer committed qua REST]
  C --> D[Citation → authorized PDF]
  C --> E[Gợi ý Staff → dialog consent → I03]
  C --> F[Gợi ý Ticket → T02 review → I07]
  B --> G[Safe error/reconnect, không duplicate send]
```

## 3. Test và gate

Đề xuất `customer-agent-chat.spec.mjs` mockUI và E2E với Agent thật riêng theo Docker setup đã chốt; không lưu raw prompt/PII vào snapshot/report.

| ID | Case | Kỳ vọng |
| --- | --- | --- |
| CH03-T01 | Queued/running/answer/reconnect | Đúng trigger/sequence, không trùng hoặc stuck typing |
| CH03-T02 | Citation forged/outsideowner/page thiếu/tài liệu bị thu hồi | Core deny và UI an toàn, không mở kho file |
| CH03-T03 | XSS/Markdown độc hại/tool output | Text/link an toàn, không thực thi hoặc lộtool trace |
| CH03-T04 | Gợi ý handoff rồi Cancel/confirm hoặc Cancel review Ticket | Chỉ explicit action hợp lệ mới businesswrite |
| CH03-T05 | Handoff trong lúc inference, timeouts/429/401 | Answer muộn không xuất hiện, không F5, draft/focus giữ đúng |

- [ ] CH02 stable, E2E với Agent thật và quyền nguồn pass, không chỉ mocktext.
- [ ] C06/FR-005 coverage cập nhật riêng; Copilot/Claim/payment vẫn ngoài scope.
