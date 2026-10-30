# Staff — chức năng còn thiếu và khác biệt cần xử lý

Đối chiếu code **30/10/2026**, thay cho bảng cũ chỉ so với HTML/JS mô phỏng. [Checklist tiến độ và gap G01–G10](../implementation-status.md) · [Chỉ mục](README.md) · [API](api-map.md).

## Đã giải quyết so với review mẫu ban đầu

- [x] Identity/session/login/password/logout thật, guard và account menu; không hard-code Staff.
- [x] Customers list/detail riêng, pagination theo assignment; không dùng All làm danh bạ.
- [x] Routes/deep link/Back–Forward và layout Staff giữ socket; rail active theo panel.
- [x] Bỏ preview/fixture, thẻ Ticket/Claim giả, số đếm mẫu và badge DB synced không có bằng chứng.
- [x] Bỏ Preferences/font picker, thống nhất Staff Lexend; fullscreen/English và dismiss password reminder.
- [x] Có invalidation local cho account/profile/assignment, refresh nền tránh nháy khi focus.
- [x] InsurancePolicy/PolicyStatus/insurance_policies và migration rename; quan hệ nhiều policy/Customer ở model.

## Gap đang mở

| Ưu tiên | Gap | Hiện trạng và cách xử lý |
| --- | --- | --- |
| P0 | G01–G03: policy/context/PDF | Chỉ có khung lookup/vùng policy, chưa A14–20. Phân biệt policy đang xem và gắn chat; chốt version áp dụng/PDF access |
| P0 | G04: queue/chat/takeover/Ticket | Route và panel có; chưa A07–13/A21–23, confirmation, idempotency, Agent fence hoặc worker. Không bật nút nghiệp vụ bằng state local |
| P1 | G05: search/retry/copy | A05 chưa search; lỗi list Back to list có thể về cùng URL. Disabled lookup còn placeholder CCCD/phone; New còn tooltip từ mẫu, nghĩa chưa chốt |
| P1 | G06: Copilot | Panel trống, chưa A24–26/checkpoint/retrieval/citations; không coi font/rail là triển khai Agent |
| P1 | G07: notifications | Chưa chuông/list/read marker/A27–28/outbox delivery; model Customer recipient chưa có |
| P1 | G08–G09: UI Customer/QA/vận hành | Customer auth/profile dùng được nhưng layout cũ; mobile Inbox có dữ liệu, keyboard và CI E2E còn thiếu. Chưa benchmark production |
| P2 | G10: tiện ích | Global search/templates/attachment disabled; chỉ làm khi có yêu cầu và contract. Font picker đã loại, không còn backlog |

Thứ tự và điều kiện đóng từng gap ở bảng tiến độ chung. Các nhận xét JS mẫu dưới đây giải thích nguồn rủi ro thiết kế; không mô tả rằng mock đó vẫn đang chạy.

## Các chi tiết mẫu phải chốt hoặc lược bỏ

| Chi tiết | Nhận định và hướng đề xuất |
| --- | --- |
| Dismiss | JS đổi `category='dismissed'`, làm yêu cầu biến khỏi list; không có nghiệp vụ từ chối/reassign tương ứng. Ẩn ở MVP hoặc định nghĩa “ẩn cá nhân” có thể khôi phục; không đổi trạng thái business bằng UI. |
| New | Không tương đương `AI_ACTIVE`; mẫu dùng hợp đồng mới. Chốt nghĩa “mới” hoặc bỏ, không gán enum mới. |
| High Priority / Tier VIP / Assignee | Nhãn/giá trị mẫu không là dữ liệu đã có. Chưa có nguồn/chính sách priority/tier trong model đã đọc; assignee cần tách Staff phụ trách Customer với Staff đang điều khiển chat và assignee Ticket. |
| CCCD / tìm CCCD | Model nguồn có citizen_id nhưng API local cố ý không trả. Chưa được bật hiển thị/tìm kiếm; cần lý do nghiệp vụ, allowlist/masking và audit được duyệt. Không mở rộng DTO chỉ để giống ảnh. |
| Quota đã dùng, beneficiary, tài khoản ngân hàng | Chưa có contract đọc tương ứng; `benefits_snapshot` không tự xác nhận hạn mức đã dùng. Ẩn/hiện chưa có dữ liệu; chốt nguồn và quyền trước khi bổ sung. |
| Attach documents | Mẫu chỉ có icon. ADRs Summary Object Storage loại upload/ingestion trong app; MVP chỉ xem/tải PDF có sẵn. Không tự dựng upload API. Nếu muốn chia sẻ tài liệu có sẵn qua chat cần chốt reference và kiểm quyền người nhận. |
| Đóng/kết thúc Ticket, xử lý Claim | SRS II.1 ngoài phạm vi; dù model có RESOLVED/CLOSED vẫn không thêm nút xử lý/chi trả. |
| Trả lại AI / đóng hội thoại | Toggle mock không là state machine đã duyệt. Cần xác định thẩm quyền, phiên Agent/resume và khi khách đang chờ; tạm chỉ đọc CLOSED trong lịch sử. |
| Global Search | Không có contract tìm xuyên mọi loại tài nguyên. Có thể dẫn tới search theo module; tránh trả dữ liệu ngoài assignment hoặc lộ count. |

## Những điểm phải quyết định trước backend

1. Chọn mapping All/Requests/Active/New và điều kiện đếm; danh sách conversation theo conversationId, không theo customerId.
2. Chốt tiếp nhận Ticket không gắn chat; liên kết nhận Ticket và takeover nguyên tử/nhất quán ra sao. Không sửa confirmation hoặc tạo Ticket thay Customer từ Staff.
3. Chốt nội dung Ticket khách duyệt, provenance/manual-vs-AI, state transitions/version/idempotency và lookup khi timeout.
4. Chốt takeover đồng thời, Agent đang chạy, read marker và retry message. Native WebSocket invalidation hồ sơ đã có; transport/events cho chat/Ticket/notification và queue vẫn chưa chốt.
5. Chốt nguồn trường hồ sơ/hợp đồng, tính quyền lợi/hạn mức và version hợp đồng–điều khoản áp dụng; không tự mặc định currentVersion.
6. Chốt Copilot history/thread/checkpoint, job status/resume và scope khi đổi người/khách/hợp đồng.
7. Chốt metadata citations, mở PDF có hạn và xử lý thu hồi quyền. Không đẩy raw tool logs hoặc URL ký vào transcript.

## Điều kiện để gọi là triển khai chức năng thật

- [ ] S01–S07 có điều hướng vào/ra, trạng thái đang tải/rỗng/lỗi và kiểm quyền khi mở link trực tiếp.
- [ ] S03 tìm đúng tập phân công; S04 nhiều hợp đồng, sản phẩm và PDF đúng quyền/version.
- [ ] S05 tiếp quản/gửi tin dựa trên kết quả Core, retry không trùng và Agent bị chặn ghi khi takeover.
- [ ] S06 là dữ liệu Ticket thực, không giả lập từ danh sách khách; confirmation giữ nguyên.
- [ ] S07 có danh sách/read marker bền vững và đồng bộ lại được; toast không thay notification.
- [ ] AI/Copilot có nguồn/giới hạn, không cam kết chi trả; dữ liệu fixture tách khỏi nguồn nghiệp vụ.

Các checklist trên là điều kiện nghiệm thu nghiệp vụ còn lại. Bằng chứng phần đã làm và giới hạn kiểm tra được ghi trong bảng tiến độ chung; không coi khung route hoặc socket invalidation là hoàn thành các điều kiện này.
