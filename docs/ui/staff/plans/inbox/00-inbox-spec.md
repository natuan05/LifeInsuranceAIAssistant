# Kế hoạch làm lại Inbox và chat Staff

Ngày **03/11/2026**. **Đã chốt nghiệp vụ; đã bỏ enum chat CLOSED, đã có I01 model/quyền nội bộ (04/11), I02 read groups/lazy/metadata API đã có; I03 entry/Accept/transcript đã có; I04 UI Staff đã triển khai; I05 public send/Customer UI và I06 realtime local đã triển khai.** Bản thử Inbox/Ticket đã gỡ. Đây là spec nghiệp vụ/UX tổng; [bảy phase triển khai](../03-inbox-contract.md) đã có tài liệu chi tiết. Schema/API/test cụ thể do từng phase sở hữu; các phương án mới vẫn cần review trước code phụ thuộc.

[Chỉ mục Staff](../../README.md) · [API E/P](../00-staff-contract.md#api-theo-chức-năng) · [Checkpoint 03](../03-inbox-contract.md) · [Model nguồn](../../../../specifications/Data_Model.md)

## 1. Mục tiêu và ranh giới

Customer có thể chat riêng với AI, nhắn trực tiếp Staff, hoặc yêu cầu chuyển cuộc AI sang Staff. Staff không được duyệt chat AI chỉ vì phụ trách Customer. Request chuyển giao khác SupportTicket.

Các quyết định đã chốt:

- Inbox Staff chỉ có **All / Requests / Active**. Không có AI active, Closed hoặc New trong filter đích.
- Staff đọc chat trực tiếp gửi tới mình theo quyền. Với chat chuyển từ AI, **chỉ sau Accept thành công** mới được đọc **toàn bộ lịch sử Customer-facing trong chính cuộc đó**, gồm phần Customer đã chat với AI trước chuyển giao.
- Trước Accept, Requests chỉ có metadata yêu cầu tối thiểu; không transcript, preview tin AI/Customer, summary tự suy từ chat riêng, số tin hoặc lastSequence.
- Accordion theo khách, tên/mã khách; từng cuộc ưu tiên tiêu đề và thời gian, giống danh sách chat. Không cần mã CHT hoặc preview tin cuối ở bản đầu.
- **Bỏ counts hoàn toàn khỏi Inbox**: không badge số, tổng số cuộc/khách hoặc counts theo status, không API summary dự phòng. Lazy load dùng hasMore/nextCursor.
- Search tên/mã, tự động và Enter, không nút Search/Clear. Chat cuộn riêng, không Page/Previous/Next cho transcript; panel phụ đóng mặc định.
- Chat mới không có nghiệp vụ đóng/Closed. Ticket giữ miền trạng thái riêng; nút resolve/close Ticket vẫn chưa thuộc implementation hiện có.
- Yêu cầu Staff/Accept không tự tạo hoặc nhận Ticket. Nhánh Ticket hiện tại là Agent gợi ý, Customer xem/xác nhận hợp lệ, Core mới tạo Ticket + outbox.

Account/Customers/Policy đã chạy giữ nguyên. Bỏ counts chỉ áp dụng Inbox, không xóa total/phân trang của Customers/Policy hoặc tự đổi notification unread ở module riêng.

## 2. Data model hiện có và đích thay đổi

Nguồn runtime: apps/core/prisma/schema.prisma; mô hình tham chiếu tại Data_Model.md. Enum chat đã được cập nhật bằng migration mới; I01 đã bổ sung model provenance/consent/acceptance, service policy và receipt/sequence; public workflow vẫn chưa có.

| Đối tượng | Schema hiện tại | Nghiệp vụ đích đã chốt |
| --- | --- | --- |
| ConversationStatus | AI_ACTIVE / PENDING_HANDOFF / STAFF_ACTIVE | Chat mới dùng AI_ACTIVE → PENDING_HANDOFF → STAFF_ACTIVE; CLOSED không dùng cho chat mới/filter/action |
| TicketStatus | OPEN / ASSIGNED / IN_PROGRESS / RESOLVED / CLOSED | Giữ riêng; không dùng làm status chat hoặc tự bật workflow đóng Ticket |
| ConversationChannel | CUSTOMER_SUPPORT / STAFF_COPILOT | Không dùng channel hiện tại để suy chat trực tiếp hay chuyển AI; cần provenance/quyền riêng |
| Message | senderType/senderId/content/citations/toolCallsMetadata/createdAt | SenderType không là delivered/read; chưa có read marker/sequence/clientMessageId trong schema |
| Assignment/controller | StaffAssignment active; Conversation.assignedStaffId | Assignment là điều kiện cần, không đủ quyền đọc lịch sử AI; assignedStaffId đơn lẻ không chứng minh đã Accept |

### 2.1. Xử lý CLOSED và dữ liệu cũ

Đã bỏ CLOSED khỏi ConversationStatus qua migration 202611030001_remove_conversation_closed; TicketStatus.CLOSED giữ nguyên. Customer Support CLOSED cũ chuyển AI_ACTIVE và assignedStaffId NULL, giữ tin nhắn, liên kết và timestamps. Audit CONVERSATION_STATUS_MIGRATED lưu migration, trạng thái và controller trước đổi; không sao chép nội dung chat vào audit. Nếu gặp Copilot CLOSED chưa review quyền sở hữu, migration báo lỗi và rollback toàn bộ.

Chuyển legacy về AI_ACTIVE không phải backfill quyền: không tạo consent/acceptance/Direct provenance hoặc Staff grant. Cuộc thiếu bằng chứng không được đưa vào Inbox/transcript Staff khi triển khai sau này. Core/operator đã cập nhật compatibility; migration lịch sử giữ nguyên, không xóa DB/volume. Chưa có thao tác close/reopen/trả AI trong đợt Inbox.

### 2.2. Một cuộc chat là gì?

Một Conversation là một luồng nhiều tin như một cuộc ChatGPT; tiêu đề chỉ giúp nhận biết, đổi chủ đề trong nội dung không tự tạo cuộc mới. UUID dùng nội bộ/route; không yêu cầu conversationCode/CHT trong schema/UI đợt đầu.

## 3. Bố cục Inbox đích

### 3.1. Filter Staff

| Nhãn | Query đề xuất | Tập dữ liệu đúng quyền |
| --- | --- | --- |
| All | Không filter hoặc filter=all | Hợp của Requests và Active bên dưới; không tất cả chat của khách |
| Requests | filter=requests | Yêu cầu chuyển từ AI đã được Customer xác nhận, gửi tới Staff hợp lệ, chưa Accept; chỉ metadata |
| Active | filter=active | Chat trực tiếp Customer gửi Staff hoặc cuộc AI mà Staff hiện tại đã Accept hợp lệ |

AI_ACTIVE chỉ là trạng thái phía Customer/AI, không hiển thị cho Staff và không cho Staff chủ động đọc/takeover chat AI riêng. Ticket tồn tại hoặc Staff đọc notification không tạo quyền chat. Không filter CLOSED, không số trên menu.

### 3.2. Accordion theo khách

Dòng khách: tên + mã, mở/đóng nhiều nhóm, lazy load các cuộc phù hợp. Không có số cuộc cạnh tên hoặc tổng phía trên. Bàn phím Enter/Space, aria-expanded/controls; cuộc là Link có aria-current. Deep link mở đúng nhóm sau khi Core cho phép, không tự tải transcript mọi khách.

### 3.3. Nội dung từng cuộc

Active hiển thị tiêu đề/fallback thời gian, thời gian hoạt động và nhãn nhỏ khi cần phân biệt Direct/Transferred. Requests dùng tiêu đề/yêu cầu do Customer chủ động cung cấp hoặc xác nhận chia sẻ; fallback “Yêu cầu Staff hỗ trợ”, không lấy câu đầu/tiêu đề AI riêng làm metadata trước Accept. Không preview tin cuối, mã CHT hoặc badge đếm.

Tiêu đề render text an toàn. Lịch sử AI chỉ xuất hiện sau gate quyền, không giấu dữ liệu đã tải bằng CSS. Quy tắc đặt/sửa subject cụ thể còn cần chốt trong kế hoạch schema/DTO.

### 3.4. Search và tải thêm

Tìm fullName/accountCode, trim/case-insensitive/literal, không bỏ dấu tự động; tối đa 100 ký tự. Đề xuất debounce 300ms, Enter chạy ngay/hủy debounce, IME không submit sớm. Không tìm message/email/phone/policy/Ticket. Xóa nội dung rồi debounce/Enter để bỏ lọc.

Áp visibility/quyền rồi search/filter trước group và cursor; không tải toàn tập về FE. Không counts/total/statusCounts/matchingConversationCount trong response hoặc UI. PageInfo nextCursor/hasMore đủ cho lazy load. Metadata thời gian/sort của Requests chỉ từ yêu cầu đã được phép chia sẻ, không từ tin AI riêng mới nhất.

Đổi filter/search hủy response cũ, reset cursor, giữ focus. Cuộc đang đọc còn quyền có thể giữ ngoài kết quả với thông báo ngắn; mất quyền phải clear. Không F5 hoặc remount sidebar vì từ khóa.

### 3.5. Chat và Requests ở vùng chính

Active: tên/mã khách, tiêu đề, transcript cuộn, composer cố định; Customer bên trái, AI/Staff bên phải có nhãn, SYSTEM chỉ nếu Customer-facing. Panel phụ đóng mặc định. Mobile list → chat/back giữ context.

Requests: vùng chính chỉ thông tin yêu cầu tối thiểu và **Accept**; không gọi A10 rồi che transcript. Chỉ sau Core commit Accept mới tải transcript. Không dùng skeleton/preview của tin cũ làm nội dung request. Trước Accept không có composer gửi tin vào cuộc đó.

### 3.6. Cuộn lịch sử

Đề xuất mở 50 tin mới nhất theo sequence tăng dần, cuộn xuống cuối; cuộn lên tải batch cũ và giữ anchor/offset. Quyền xem toàn bộ lịch sử không đồng nghĩa tải mọi tin một lần. Có tin mới khi đang đọc phía trên thì giữ vị trí/hiện nút xuống tin mới, không cướp focus.

Không phân trang đánh số trong transcript. Dùng before/after cursor, dedup theo sequence/id; chuyển cuộc hủy request và tách nháp. Logout/mất quyền xóa nội dung/nháp/cache riêng; không lưu transcript trong localStorage.

## 4. Quyền và hành vi trạng thái

| Trường hợp | Metadata Inbox | Transcript | Gửi Staff |
| --- | --- | --- | --- |
| Chat AI riêng, chưa yêu cầu Staff | Không | Không | Không |
| Chuyển giao chờ Accept | Chỉ request do Customer xác nhận chia sẻ | Không, kể cả biết UUID/link Ticket | Không |
| Chuyển giao đã Accept bởi Staff hiện tại và assignment còn hợp lệ | Có | Toàn bộ transcript Customer-facing trong chính cuộc đó, trước và sau Accept | Theo allowedActions Core |
| Chat trực tiếp Customer gửi Staff hợp lệ | Có | Lịch sử cuộc trực tiếp | Theo allowedActions Core |
| Chỉ có assignment/assignedStaffId hoặc liên kết Ticket, chưa có bằng chứng gate phù hợp | Không tự cấp | Không tự cấp | Không tự cấp |
| Mất assignment/phiên hoặc legacy chưa phân loại | Theo kiểm quyền mới; không lộ nội dung cũ | Không | Không |

Core kiểm điều kiện trên ở list/group/lazy/detail/messages/search/cursor/events và mọi mutation. Không suy provenance/consent từ LLM hoặc senderType/body client. Chat trực tiếp là một cuộc được tạo cho Staff; không cho đổi flag của chat AI hiện hữu sang Direct để bỏ qua Accept.

“Toàn bộ lịch sử” gồm tin Customer, AI và Staff đã hiển thị cho Customer trong cuộc được chuyển, không gồm STAFF_COPILOT, ghi chú nội bộ, raw tool metadata hoặc tài liệu ngoài quyền. Phân loại audience của SYSTEM/citations cần contract trước khi trả dữ liệu. Có cursor từ trước/biết UUID cũng không vượt gate.

Accept cần assignment hiện hành + yêu cầu Customer hợp lệ + phiên bản/control lock/idempotency; lưu bằng chứng Staff nhận và quyền toàn bộ lịch sử cùng transaction. Agent chạy dở không được ghi sau chuyển mode. Không có yêu cầu Customer thì không proactive takeover AI riêng. Nếu assignment đổi, thu hồi quyền Staff cũ; Staff mới không tự kế thừa acceptance, chính sách tái định tuyến/xác nhận cần kế hoạch riêng.

## 5. API spec đề xuất

**A08/A09 read metadata đã E từ I02 (04/11); A10/A11 và Customer entry/history đã E từ I03; A12 send/reconcile đã E từ I05; A13 vẫn P.** Prefix /api/v1, session/role Core; no-store, Origin/JSON/X-Auth-Request/X-CSRF-Token cho ghi. Query allowlist, lỗi an toàn, UUID/cursor/limit rõ; lọc quyền trước truy vấn trả dữ liệu.

### 5.1. Nhóm khách không counts

A08 `GET /staff/inbox/customers?filter=requests&search=Synthetic&limit=20&cursor=...`; customerId tùy chọn thu hẹp scope. filter chỉ all/requests/active, không status enum. Đề xuất limit default 20/max 50.

```json
{
  "items": [{
    "customer": {"id": "8b4bb0aa-c9a4-4b86-8846-0e5a1e70f301", "fullName": "Synthetic Customer A", "accountCode": "CUS-000001"},
    "lastActivityAt": "2026-11-03T08:00:00.000Z"
  }],
  "pageInfo": {"nextCursor": null, "hasMore": false}
}
```

Chỉ khách có ít nhất một request/cuộc đủ điều kiện hiển thị; sort theo hoạt động được phép của các item phù hợp rồi customerId. Lấy limit+1 để xác định hasMore, không COUNT/tổng hợp badge. A07 summary loại khỏi phạm vi, không giữ endpoint dự phòng. Cursor opaque/versioned ràng buộc actor/search/filter/sort; vẫn kiểm quyền từng request.

### 5.2. Lazy list của một khách

A08 `GET /staff/inbox/customers/:customerId/conversations?filter=all&limit=10&cursor=...`; limit default 10/max 50, cursor riêng. Ngoài assignment: 404. Có assignment nhưng không có cuộc đủ gate: items rỗng, không hé lộ chat AI khác.

```json
{
  "items": [{
    "id": "92fe33d7-4156-4d22-b3b4-e7fe7882c101",
    "subject": "Yêu cầu Staff hỗ trợ",
    "status": "PENDING_HANDOFF",
    "entryType": "REQUEST",
    "activityAt": "2026-11-03T08:00:00.000Z"
  }],
  "pageInfo": {"nextCursor": null, "hasMore": false}
}
```

entryType là DTO đề xuất REQUEST/DIRECT/TRANSFERRED, không phải enum/cột hiện có. Request item không có lastMessage, preview, lastSequence, aiSummary, tool metadata hoặc subject tự lấy từ chat riêng. Active item chỉ thêm thông tin đã được phép; không counts hoặc conversationCode.

### 5.3. Mở một cuộc hoặc yêu cầu

A09 `GET /staff/conversations/:conversationId`. Chờ Accept: trả customer summary + metadata request đã chia sẻ + allowedActions `{readMessages:false,accept:true,send:false}`; không lastSequence hoặc dữ liệu transcript. Active đủ gate: metadata cùng allowedActions readMessages/send do Core tính, context policy vẫn kiểm quyền riêng. Ngoài quyền/Copilot/chat AI chưa yêu cầu: 404.

### 5.4. Batch tin nhắn phục vụ cuộn

A10 `GET /staff/conversations/:conversationId/messages?limit=50&before=...`. **Chỉ sau gate Direct hoặc Accept**. Chưa Accept trả 404 an toàn, không trả items/length/sequence; filter=active, ticketId hoặc cursor không tạo quyền.

Batch mới nhất khi vắng before/after; hai query loại trừ, exclusive, limit đề xuất 1–100/default 50. Items tăng dần theo sequence; bigint trả string. Sau Accept không cắt lịch sử từ acceptedAt: batch before phải đi tới các tin Customer–AI cũ trong chính cuộc đó.

```json
{
  "items": [{"id": "d16567a4-5ba0-4fbf-b7ce-3a2540ad2101", "sequence": "128", "senderType": "AI_AGENT", "content": "Nội dung giả lập đã hiển thị cho Customer trước chuyển giao.", "createdAt": "2026-11-03T07:00:00.000Z"}],
  "pageInfo": {"beforeCursor": "opaque-before", "afterCursor": "opaque-after", "hasMoreBefore": true, "hasMoreAfter": false}
}
```

Không raw tool payload/Copilot; citations kiểm document/version/quyền trước trả. Tải bù after tới hết backlog, không dựa riêng event.

### 5.5. Accept chuyển giao

A11 E `POST /staff/conversations/:conversationId/accept` đã triển khai I03; /takeover chỉ là path đề xuất cũ, không phải alias runtime. Body `{expectedVersion,clientRequestId}`. Chỉ nhận PENDING_HANDOFF có yêu cầu Customer hợp lệ; không nhận AI_ACTIVE chưa được chuyển.

Core lock/recheck session/assignment/consent/version, ghi acceptance/STAFF_ACTIVE/controller/quyền lịch sử + sự kiện bền vững atomic. Không tạo/accept/close Ticket. Retry cùng key/payload trả kết quả đã commit sau recheck quyền, khác payload 409; hai Staff tranh nhận chỉ một thành công. Chỉ response thành công mới cho FE gọi A10. Receipt/retention/DTO chi tiết thuộc kế hoạch nhỏ trước code.

### 5.6. Gửi tin và reconcile

A12 E từ I05: POST /staff/conversations/:conversationId/messages với clientMessageId/expectedVersion/content; GET cùng path /by-client-id/:clientMessageId để tra tin của chính actor sau timeout. Chỉ Direct hợp lệ hoặc acceptance hiện hành + STAFF_ACTIVE + quyền điều khiển mới gửi. Core gán sender, sequence và ACK sau commit; chống trùng, khác nội dung/cùng key 409. Không sinh key mới khi chưa rõ kết quả. Limits/replay/receipt và UI đã theo [I05](05-messaging-customer.md).

### 5.7. Đầu Customer và handoff riêng

Customer ownership API đọc/gửi/reconcile cùng conversation vẫn cần spec nhỏ; Core tạo Direct provenance hoặc xác nhận yêu cầu chuyển AI từ đúng Customer, không tin cờ mode/consent do LLM tự khai. Giao diện phải nêu Customer đang đồng ý cho Staff tiếp nhận **toàn bộ lịch sử cuộc này**; xác nhận tạo Ticket không tự là xác nhận chia sẻ chat.

Yêu cầu Staff ghi trạng thái/chứng cứ handoff + sự kiện thông báo bền vững, không SupportTicket. Agent có thể gợi ý chuyển Staff nhưng chỉ sau Customer đồng ý. Nhánh Agent gợi ý **tạo Ticket** là nghiệp vụ khác, xác nhận nội dung Ticket riêng và Ticket + outbox atomic. Phương án cụ thể về AI pending/routing và create/confirm/reconcile nằm ở [I03](03-handoff-transcript.md), UI Customer/send ở [I05](05-messaging-customer.md); đều là đề xuất chưa implement.

### 5.8. Lỗi và contract UI

401 clear dữ liệu/login; 403 lỗi CSRF/action; 404 an toàn khi không có quyền transcript; 409 stale/idempotency/state; 429 rate limit; đọc lỗi mạng/5xx retry đúng vùng. Foundation có `{statusCode,code,message,requestId,timestamp}`; code nghiệp vụ cụ thể còn P. Không dùng CONVERSATION_CLOSED trong contract chat mới. Timeout ghi phải reconcile, không báo chắc chắn đã thành công/thất bại từ state local.

## 6. Schema/migration cần thiết trước API ghi

Đã hoàn tất I01 bằng migration 202611040001_inbox_foundation. Các mục model/quyền bên dưới đã có nền DB/service; workflow/DTO/cursor/recipient public tiếp tục trong phase sở hữu:

1. Legacy sau migration: AI_ACTIVE/controller NULL không chứng minh consent hoặc Accept. Xử lý provenance/quyền an toàn, không tạo Staff grant hàng loạt; TicketStatus giữ nguyên.
2. Provenance Direct vs AI, handoff consent chia sẻ toàn bộ lịch sử, request/acceptance staff/time/version; assignedStaffId/status hiện tại không đủ chứng cứ. Dữ liệu cũ thiếu bằng chứng không tự cấp quyền.
3. Subject/audience metadata an toàn trước Accept; sequence/order/backfill và cursor, indexes theo truy vấn đủ gate. Không thêm conversationCode hoặc trường counts.
4. Control version/last activity/messageSequence và clientMessageId/command receipt khi phase tương ứng cần; mọi writer cập nhật atomic. LastMessage FK nếu có phải cùng conversation; không xuất preview riêng tư.
5. Chuyển assignment/thu hồi acceptance/event recipient; policy liên kết phải cùng customer. Không coi Ticket assignee là chat grant.

Không sửa migration đã apply, reset DB, xóa dữ liệu/volume hoặc bổ sung bootstrap seed chat/Ticket trong lượt tài liệu. Backfill permission cần review dữ liệu synthetic hiện có; không tự xóa để né migration.

## 7. Realtime/catch-up để chat thực sự

I06 đã có chat/scope/notification invalidation và REST catch-up; không delivery/read ACK. Event chat do Core chọn recipient theo **cùng gate** với REST, không phát transcript/preview/sequence chat AI hoặc pending cho Staff. Pending chỉ thông báo metadata yêu cầu; Accept commit mới cho Staff nhận event/tải toàn bộ lịch sử được phép.

Direct recipient phải hợp lệ; mất assignment/phiên clear scope. Reconnect REST revalidate và catch-up, dedup/thứ tự ổn định. Handoff notification và Ticket notification là hai loại sự kiện riêng; chỉ Ticket creation ghi Ticket+outbox. Queue/worker/transport/Agent fence còn cần kế hoạch trước code, không tuyên bố exactly-once.

## 8. Routes và state FE

Đích: /staff/inbox?filter=requests&search=... và /staff/inbox/:conversationId giữ query, customerId tùy chọn. Không status=AI_ACTIVE/CLOSED hoặc cursor/transcript/signed URL trên URL. All vắng filter; API chỉ nhận all/requests/active.

Legacy all→all, request→requests, recent→active; new/AI-active/Closed link cũ không mở lịch sử bị ẩn, chuẩn hóa về All và recheck Core. Mapping này chưa implement. Back/Forward giữ lựa chọn/nhóm/search/scroll đúng scope; không F5. Link Ticket biết conversationId cũng không bỏ qua Accept; trước grant chỉ tới request tối thiểu nếu được phép.

## 9. Tickets và thông tin phụ trong đợt làm lại

Tickets là trang riêng; Agent gợi ý, Customer xác nhận nội dung rồi Core tạo Ticket + outbox. Ticket có thể liên kết cuộc, nhưng TicketStatus/assignee/accept/close không thay status/grant chat. Yêu cầu Staff và chat trực tiếp không bắt buộc Ticket. Không tạo Ticket khi bấm Accept chat; không tự cấp transcript khi Staff xem/nhận Ticket.

Form Ticket thủ công từng được đề xuất trong MVP là backlog cũ, không thuộc phạm vi Inbox đang chốt; cần xác nhận riêng trước khi triển khai. Nội dung/source/version/confirmation và Ticket workflow phải có spec riêng, không dùng aiSummary/extractedDetails làm nguyên văn đã xác nhận. TicketStatus.CLOSED giữ nguyên; resolve/close chưa là chức năng được triển khai.

## 10. Thứ tự triển khai và checkpoint review

1. Cập nhật quyết định trong tài liệu: đã làm ở lượt này; không đồng nghĩa đủ điều kiện bắt đầu code.
2. **Đã có [I01–I07](../03-inbox-contract.md)**: model/quyền → read metadata → Customer entry/handoff/Accept/history → Staff UI → send/Customer UI → realtime/notification handoff → Ticket riêng. Mỗi file có vị trí code, API/DTO/errors, Mermaid, test và điều kiện hoàn tất. I01–I06 đã hoàn tất local 04/11; I07 chưa implement.
3. Review model/gate rồi mới migration; đọc pending không đợi quyền transcript. A10 phải có deny-before-Accept từ đầu, không mở tạm quyền chỉ để review FE.
4. Core Accept/Direct grant và API transcript trước khi review luồng thật sau Accept. FE vẫn ưu tiên chat, request chưa nhận chỉ metadata/Accept, không trang history nhiều bảng.
5. Sau các gate mới send/idempotency/Agent fence/Customer/realtime. Không đánh dấu chat hai chiều xong từ GET hoặc mock UI. Ticket/Copilot/notifications theo phần riêng.

Account/Customers/Policy giữ nguyên; không viết code Inbox trước tài liệu triển khai và review phần phụ thuộc.

## 11. Ma trận kiểm thử/nghiệm thu

- Quyền: AI riêng biến mất khỏi group/list/detail/messages/search/events; assignment hoặc UUID/cursor/Ticket không cấp quyền. Pending không transcript/preview/summary/lastSequence/số tin, kể cả gọi API trực tiếp.
- Accept: xác nhận chia sẻ đầy đủ, khóa/version/idempotency; chưa commit không được đọc. Sau commit Staff hiện hành đọc được cả các tin Customer–AI **trước requestedAt/acceptedAt**, đúng một cuộc; không Copilot/tool/internal payload.
- Direct: chỉ cuộc Customer thực sự gửi tới Staff đúng quyền; đổi flag của AI cũ không bypass gate. Reassignment không kế thừa grant tự động.
- Counts: không badge/tổng số/response fields counts/total/statusCounts/matchingConversationCount hoặc endpoint A07. hasMore/nextCursor chính xác khi 0/1/nhiều trang, không group ở FE.
- Closed legacy: không filter/action chat mới, không map cấp quyền; migration không làm mất dữ liệu, TicketStatus.CLOSED giữ nguyên.
- Search/accordion/cursor: tên-mã/literal/IME/abort, keyboard/deep link/Back–Forward, nhiều khách/cuộc, không lấy subject riêng tư trước Accept.
- Scroll: batch mới nhất, prepend giữ anchor, tải hết được lịch sử trước handoff, dedup/catch-up/retry và không F5.
- Ghi/realtime: timeout/reconcile, Agent muộn, hai bên nhận/gửi, sự kiện đúng recipient/gate, Ticket không tự xuất hiện khi chuyển Staff.
- Chỉ synthetic; Core/browser/E2E tách biệt; DOM/network, không screenshot hoặc Markdown report mới.

## 12. Checklist trước khi viết code lại

- [x] Chốt All/Requests/Active, không AI/Closed/New; bỏ counts hoàn toàn khỏi Inbox.
- [x] Chốt gate riêng: Direct hoặc Accept mới đọc transcript; pending chỉ metadata.
- [x] Chốt sau Accept thấy toàn bộ lịch sử Customer-facing của chính cuộc AI đã chuyển.
- [x] Tách Ticket khỏi handoff; bỏ ConversationStatus.CLOSED bằng migration mới, có audit/bảo toàn lịch sử và giữ TicketStatus.CLOSED.
- [x] Cập nhật spec/API map/routes và tài liệu liên quan; I01/I02 đã có Core, I04 UI Inbox đã nối.
- [x] Viết bảy tài liệu phase chi tiết tại [chỉ mục triển khai](../03-inbox-contract.md).
- [x] I01 model/quyền/migration/service tests hoàn tất; không backfill grant legacy.
- [ ] Chốt schema/DTO/cursor/error/recipient/reassignment/Agent pending policy theo từng phần; migration model quyền I01 đã có, A08/A09 đã có; API transcript/Accept đã có từ I03; public send chưa triển khai.

## Bổ sung đã chốt sau test tay 04/11/2026

- Người dùng xác nhận các chức năng I04/I05 còn lại pass; giữ runtime hiện hành.
- Sau Staff Accept, Customer và Staff phải thấy một tin hệ thống trong transcript về việc đã tiếp nhận/sẽ phản hồi sớm nhất. Lưu SYSTEM Customer-visible cùng transaction Accept, sequence/dedup theo handoff, không toast-only hoặc worker tạo muộn. Đã triển khai; chi tiết [I06-A](06-realtime-routing.md).
- Staff có AI Copilot trong panel bên phải của màn chat: hỏi, tóm tắt và gợi ý trả lời/citations đúng quyền. Thread STAFF_COPILOT nội bộ, không lẫn lịch sử Customer; Staff duyệt rồi chủ động gửi nháp. Chưa triển khai; [C01](../08-copilot-contract.md#c01--kế-hoạch-ai-copilot-riêng-cho-staff) sở hữu kế hoạch/contract/gate/test, không sửa thêm UI Customer hoặc tự tạo Ticket.

## Runtime và UX đã nghiệm thu — 04/11/2026

I01–I06 đã E: model/gate/metadata/consent/Accept/full transcript, send/reconcile, SYSTEM, outbox/realtime/handoff notification. I07 và Copilot còn P. User đã test tay I04/I05 pass; kết quả đó không nghiệm thu Copilot hoặc Agent.

Inbox không Refresh inbox/conversation/messages hoặc Message saved; ACK hiển thị tin đã commit. Pending/unknown/retry vẫn rõ. Search debounce300ms/Enter/IME, All/Requests/Active, không counts. Direct hoặc Customer consent+Staff Accept mới transcript; có grant thì cả lịch sử Customer-facing trước/sau trong chính cuộc, không Copilot/internal.

Realtime cập nhật nền không đưa revision vào key remount directory. Giữ accordion/DOM/focus/nháp/scroll và các trang cursor đã tải; refetch từng page rồi thay kết quả đồng nhất, xóa hàng đã bị gỡ. Scope/actor/phiên đổi xóa dữ liệu ngay. 32 browser Inbox/send/realtime regression đã pass ở đợt sửa này, mock không thay Core authorization.

Panel phụ đóng mặc định; mobile list→chat/back. Customers không nhúng chat/Ticket. Request/Accept không tạo Ticket, Ticket read/accept không mở transcript. Copilot theo contract08 và CP01–CP04; không từ UI mẫu suy thêm Agent/citation/checkpoint đã có.
