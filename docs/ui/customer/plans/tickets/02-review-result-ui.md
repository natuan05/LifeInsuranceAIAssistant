# T02 — Customer Ticket UI

**Phương án A đã duyệt:** Customer dùng form thủ công hoặc xem/sửa/xác nhận draft Agent, theo dõi list/detail. Ticket mới hiển thị OPEN. [C07](../07-tickets-contract.md) · [T01](01-confirmation-core-contract.md).

## 1. Vị trí và dữ liệu

| Vị trí từ root repo | Trách nhiệm |
| --- | --- |
| [customer-ticket-confirmation.tsx](../../../../../apps/web/src/components/customer-ticket-confirmation.tsx) | Popup review, revision và xác nhận draft |
| [customer-tickets.tsx](../../../../../apps/web/src/components/customer-tickets.tsx) | Form thủ công, list và detail |
| [ticket-api.ts](../../../../../apps/web/src/lib/ticket-api.ts) | Draft/manual/confirm/list/detail/receipt wrappers |

UI đọc/ghi nghiệp vụ qua T01/I07. Source có các component này; khả năng chạy đầy đủ cần kiểm cùng lỗi API và concurrency tại I07. Mức ảnh hưởng cao ở snapshot/version, actor state và thông báo kết quả.

## 2. Luồng và API

### 2.1. Draft Agent

Mở popup → GET own draft → xem title/description/policy → tùy chọn sửa qua PUT expectedVersion → nhận revision và review lại → chủ động xác nhận → POST draftId/expectedDraftVersion/confirmation/key → hiển thị mã Ticket OPEN sau commit.

Phạm vi đã chốt cho phép sửa title, description và policy liên quan theo ownership. UI hiện có edit title/description; cần kiểm và hoàn thiện phần chọn policy trước nghiệm thu đầy đủ. Cancel/Escape đóng popup, không tạo Ticket. Summary/nguồn cần hiển thị theo contract Agent/I07.

**Phương án A cho nội dung Agent:** popup review và detail hiển thị sáu mục Yêu cầu, Bối cảnh, Khách cung cấp, Kết quả đã xác minh, Việc đã thử và Phần còn vướng. Mỗi finding có nguồn từ DTO Core. Nhóm rỗng hiển thị chưa có nội dung, không suy thành không có quyền lợi. Các mục có thể thu gọn nhưng Customer phải mở đọc được đầy đủ trước xác nhận, không cắt ngầm vào description.

Form sửa title/description/policy dùng revision server. Sau sửa, UI tải và hiển thị summary/nguồn của revision tương ứng trước cho phép xác nhận. Browser không có thao tác tự gắn nhãn verified hoặc thêm source refs. Draft đang thiếu summary hợp lệ cần trạng thái chờ hoàn thiện, không tự điền từ raw transcript. Kết quả sau commit dùng snapshot đã lưu. Khi mở nguồn, recheck quyền và exact version qua Core; nguồn không khả dụng hiển thị rõ.

### 2.2. Form thủ công

Trang Tickets → Tạo yêu cầu mới → nhập title/description/policy tùy chọn → gửi POST manual với request key → hiển thị kết quả persisted và cập nhật list/detail. Customer chủ động gửi form là xác nhận nội dung luồng thủ công.

### 2.3. Trạng thái và retry

- Hiển thị OPEN cho kết quả tạo mới của cả hai luồng. Staff tiếp nhận chuyển IN_PROGRESS qua nghiệp vụ Staff.
- Conflict/expiry yêu cầu tải và xem lại draft; không tự confirm version mới.
- Double click dùng cùng intent/key. Timeout tra receipt bằng key gốc và không tạo key mới cho cùng lần gửi chưa rõ kết quả.
- Own list/detail dùng API Customer. Logout/đổi actor/revoke xóa state và bỏ response đến muộn.
- Review/detail hiển thị DTO đã được phép. Phần giảm/che dữ liệu còn P theo [ma trận dữ liệu](../../../../configuration-and-data.md#customer-sensitive-data).

## 3. Test cases

Các ca là tiêu chí hồi quy browser/network/gateway, chưa chạy lại trong lần sửa tài liệu.

| Mã | Ca | Kết quả mong đợi |
| --- | --- | --- |
| T02-T01 | Sửa draft rồi review/xác nhận | Request dùng revision mới, kết quả OPEN khớp nội dung đã xem |
| T02-T02 | Form thủ công và double submit | Một Ticket persisted, list/detail cập nhật đúng mã/status |
| T02-T03 | Cancel/Escape khi review | Không gửi request tạo Ticket, focus trở lại vị trí phù hợp |
| T02-T04 | Draft stale/hết hạn | Hiển thị lỗi an toàn, Customer phải xem lại trước xác nhận |
| T02-T05 | Mất ACK sau commit | Receipt bằng key cũ trả đúng Ticket, không báo thành công trước commit |
| T02-T06 | Owner khác/đổi actor/revoke | Safe deny/clear state, không hồi dữ liệu từ response cũ |
| T02-T07 | Policy ngoài quyền, keyboard/mobile/zoom 200% | Validation/quyền đúng, nội dung đọc đủ, controls/focus sử dụng được |
| T02-T08 | Ticket liên kết chat và canary PII | Giữ transcript gate riêng; projection không tự khôi phục PII đã loại |
| T02-T09 | Review/detail summary dài hoặc có nhóm rỗng | Đọc được đủ sáu nhóm/nguồn, keyboard/mobile phù hợp, không tự tạo dữ kiện |
| T02-T10 | Revision hoặc nguồn thay đổi khi popup đang mở | Customer review lại đúng version, không confirm snapshot cũ hoặc nguồn ngoài quyền |

## 4. Checklist

- [x] Hai luồng tạo, sửa draft và OPEN đã được duyệt.
- [x] Review component và Customer Tickets có trong source.
- [ ] Kiểm đủ trường sửa draft và API error/replay/concurrency.
- [ ] Nghiệm thu browser/gateway với fixture cô lập.
- [ ] Nghiệm thu nguồn Agent thật sau khi proposal/summary mapping được tích hợp.
- [x] Review/detail sáu nhóm và nguồn đã được duyệt theo phương án A.
- [ ] Triển khai UI summary/nguồn và kiểm tra khớp snapshot với revision xác nhận.
