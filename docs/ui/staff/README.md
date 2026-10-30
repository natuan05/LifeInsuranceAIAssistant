# Staff — bản đồ màn hình và phạm vi triển khai

Đối chiếu code ngày **30/10/2026**. [Checklist tiến độ chung](../implementation-status.md) là đầu mối trạng thái; các phần nghiệp vụ dự kiến bên dưới không tự trở thành chức năng đã có.

[Thứ tự đọc](../README.md) · [Routes](routes.md) · [Menu](../menu.md) · [API hiện có/đề xuất](api-map.md) · [Gap](gap-review.md)

## Căn cứ và cách hiểu

| Nguồn | Nội dung áp dụng |
| --- | --- |
| [SRS](../../specifications/Requirement.md), II.1–3 và IV | FR-001/002/003/006/007/008/009/010/011/012/013, UC-005/006/007, NFR-001–008. SRS không liệt kê FR-004 trong bảng FR; không tự bổ sung mã đó. |
| [Application Architecture](../../specifications/Application_Architecture.md), §2–3 | Workspace/Copilot sidebar; Web → Core → Agent, tài liệu và thông báo theo quyền. |
| [Data Model](../../specifications/Data_Model.md), bảng 7–15 | Tên dữ liệu, quan hệ khách–hợp đồng–tài liệu, conversation khác Ticket, message có citations. Bảng tồn tại không đồng nghĩa có API hoặc thao tác UI. |
| [ADRs](../../specifications/ADRs.md), Application/Data và ADR-AI | Bối cảnh thiết kế; các lựa chọn đề xuất vẫn mở. Không chốt provider, transport, queue hoặc backend checkpoint từ giao diện. |
| [Baseline local](../../architecture.md), local-api/local-data-model | Auth email, active assignment, allowlist và ràng buộc đã triển khai được ưu tiên khi nguồn cũ khác baseline. |
| [Menu MVP](../menu.md) | Bổ sung đã ghi nhận: Ticket khách tự điền, thông báo tin chưa đọc. Đây là kế hoạch MVP trong repo, không gán thành yêu cầu nguyên văn SRS. |
| `insurance_ui/staff-management.html/.css/.js` | Mẫu hình thức và hành vi mô phỏng. Ảnh người dùng cung cấp là tham chiếu bố cục; dữ liệu/kết quả nghiệp vụ trong mẫu không có thẩm quyền. |

## Các màn hình/chế độ chức năng

Inbox giữ bố cục mẫu; Customer management và tài khoản là màn hình riêng. Điều hướng list/detail đã dùng route theo [bảng routes](routes.md); rail là trạng thái panel client trong Inbox.

| Mã | Màn hình/chế độ | Vị trí trong mẫu và điều hướng cần có | Nguồn |
| --- | --- | --- | --- |
| S01 | [Đăng nhập, tài khoản](account.md) | Trang riêng; staff card mở tài khoản và có đăng xuất thật | FR-001, baseline auth |
| S02 | [Tổng quan/hàng đợi](home.md) | Sidebar + danh sách công việc; không cần dashboard số liệu mới | FR-006/010/013, menu MVP |
| S03 | [Khách được phân công, hồ sơ](customers.md) | Customers list/detail riêng; Case Details chỉ ở Inbox | FR-002/003 |
| S04 | [Tra cứu hợp đồng, sản phẩm, tài liệu](contracts.md) | Policy Lookup toàn màn hình và lookup nhanh; bổ sung sản phẩm/PDF | FR-008, UC-007, NFR-007 |
| S05 | [Hội thoại, takeover, lịch sử và Copilot](conversations.md) | Cột chat + rail + sidebar nội bộ; mở từ khách/Ticket/thông báo | FR-006/007/011/012, UC-006 |
| S06 | [Danh sách và chi tiết Ticket](tickets.md) | Tickets phải có dữ liệu Ticket riêng, kể cả Ticket không gắn chat | FR-009/010, UC-005, menu MVP |
| S07 | [Thông báo](notifications.md) | Bổ sung chuông và danh sách đọc/chưa đọc | FR-013, NFR-005/006 |

## Gắn menu mẫu với nghiệp vụ

| Nhãn mẫu | Cách dùng dự kiến — cần duyệt trước contract |
| --- | --- |
| All | Tất cả hội thoại được phép xem, không phải tất cả khách của công ty |
| Requests | Hội thoại `PENDING_HANDOFF`; Ticket hỗ trợ độc lập ở S06 |
| Active | Hội thoại `STAFF_ACTIVE`; cần phân biệt đang do tôi/người khác hỗ trợ theo quyền |
| New | Mẫu hiểu là hợp đồng mới cấp. Không có quy tắc “mới” trong SRS; chưa biến thành trạng thái conversation. Có thể đổi thành “AI đang hỗ trợ” (`AI_ACTIVE`) nếu được duyệt. |
| Tickets | Danh sách Ticket thực, không alias của All |
| Policy Lookup | Tra cứu thủ công trong active assignment; xem sản phẩm công khai ở tab riêng |
| Preferences | Đã bỏ theo yêu cầu; Staff dùng Lexend cố định. Thu gọn sidebar/panel vẫn là tiện ích client |

Conversation status từ model: `AI_ACTIVE`, `PENDING_HANDOFF`, `STAFF_ACTIVE`, `CLOSED`. Ticket status là miền khác: `OPEN`, `ASSIGNED`, `IN_PROGRESS`, `RESOLVED`, `CLOSED`. Không đồng nhất `Pending` trên Case Details với cả hai; phải ghi nhãn rõ. Có trạng thái trong model không cấp quyền đóng/giải quyết Ticket trong MVP.

## Trạng thái triển khai

- [x] S01: login/session/account/password/logout qua A01–04; menu hai hành động, trang Personal information theo style Staff.
- [x] S03 cơ bản: danh sách/chi tiết khách qua A05–06, pagination URL và read-only profile; tách khỏi Inbox.
- [x] Shared layout/routes, fullscreen, English, Lexend tự host, rail active theo panel, đóng lời nhắc password; không có preview/iframe/fixture nghiệp vụ.
- [x] WebSocket invalidation local cho account/profile/assignment; refresh nền không xóa nội dung khi quay lại tab. Vẫn kiểm phiên khi focus/visible.
- [x] Dọn nhánh Staff cũ trong CustomerWorkspace, CSS login/font-picker/modal/toast/thẻ mẫu không còn dùng. Customer/account/connection đang hoạt động được giữ.
- [ ] S03 search và retry lỗi; xem G05 trong bảng tiến độ.
- [ ] S04 policy/product/PDF thật và context nhiều policy: A14–20.
- [ ] S02/S05 queue/transcript/takeover/send/history/Copilot: A07–13/A24–26.
- [ ] S06 Ticket thật: A21–23. S07 notifications: A27–28.

Customer detail ưu tiên Insurance policies ở vùng chính, Personal information ở cột phụ. Policy hiện ghi rõ chưa kết nối; không suy ra Customer không có hợp đồng. Sidebar Customers không có chat/composer/takeover. Cột giữa sidebar/chat trong Inbox sẽ là danh sách hội thoại theo conversationId; một Customer có thể có nhiều hội thoại.

Staff workspace chuyển trực tiếp cấu trúc từ HTML/CSS người dùng gửi sang React; CSS scope `.staff-inbox` kết hợp Tailwind prefix `tw:`. Các nút gửi/takeover/search không có API được disabled; rail và route vẫn điều hướng được. Kết quả nghiệp vụ luôn lấy từ Core, không từ JS mẫu.

## Policy và nhiều hợp đồng

Nhãn UI giữ **Policy Lookup**, thuật ngữ tiếng Anh dùng Policy. Tài liệu tiếng Việt dùng “hợp đồng bảo hiểm”. Prisma `InsurancePolicy`, enum `PolicyStatus`, bảng `business.insurance_policies`, quan hệ `policies`; giữ `policyNumber/policyId/linkedPolicyId` và cột `policy_number/policy_id/linked_policy_id`. Migration `202610300001_rename_insurance_policies` đã chuẩn hóa tên; migration cũ giữ nguyên. Tên file `contracts.md` chỉ giữ tương thích liên kết tài liệu.

Một Customer có nhiều policy đã được model hỗ trợ; UI chọn policy/context/API chưa triển khai. Policy đang mở để xem không tự thay linkedPolicy của conversation. Cần contract thay context và quyền/phiên bản trước khi nối header/Copilot/Ticket; xem G01–G03.

## Hướng triển khai tiếp

Theo [checklist và thứ tự ưu tiên](../implementation-status.md): hoàn thiện S03 search/retry; policy read/context/PDF; Inbox/Ticket business; Copilot và notifications. Đây là đề xuất kế hoạch, không phải duyệt endpoint/queue/model mới. Chỉ kênh invalidation local đã có, chưa có realtime chat/Ticket/notification hoặc outbox worker.
