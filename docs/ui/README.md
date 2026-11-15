# UI — tài liệu Application

Tài liệu mô tả Customer Portal và Staff Workspace. Tài liệu dùng tiếng Việt, giao diện dùng tiếng Anh.

## Thứ tự đọc

1. [Menu và phạm vi](menu.md): chức năng của từng vai trò.
2. [Tiến độ](implementation-status.md): phần đã có và phần còn thiếu.
3. Chọn chức năng trong [Staff](staff/plans/README.md) hoặc [Customer](customer/plans/README.md), rồi đọc contract và phase liên quan.
4. [Spec đồng bộ Application](../application-code-alignment-spec.md): các sửa đổi Phase 0–5 còn phải hoàn tất.

Tra cứu khi cần: [API và routes](staff/plans/00-staff-contract.md), [kiến trúc](../architecture.md), [Data Model](../specifications/Data_Model.md), [quyền và dữ liệu](../configuration-and-data.md). Cài đặt/vận hành tại [Getting Started](../getting-started.md).

## Quy ước test case và sequence diagram

Mỗi test case ghi lớp kiểm thử, điều kiện/dữ liệu, các bước và kết quả mong đợi. Dùng mã riêng của chức năng để liên kết với suite. Test case là tiêu chí; checkbox chỉ đóng khi phần tương ứng đã được kiểm.

- **API/service/DB:** kiểm validation, quyền, transaction và dữ liệu lưu. Ca concurrency/migration cần DB thật.
- **Browser mock:** kiểm state, DOM, focus, navigation và lỗi UI.
- **Gateway E2E:** kiểm UI với Core/DB/storage thật. Ghi rõ dependency nào còn giả lập.
- Dùng S-A/S-B cho Staff, C-A/C-B cho Customer và fixture hoàn toàn synthetic. Prefix API rút gọn là `/api/v1`. Mutation dùng session/Origin/CSRF theo endpoint.
- Fixture và fault injection thuộc harness cô lập. Mỗi suite tự dọn theo runId, đóng context/socket và phục hồi lỗi đã inject; giữ dữ liệu, credentials và Docker volumes đang dùng.
- Kiểm UI bằng DOM/network; PDF bằng metadata/bytes/hash. Không screenshot/video/trace. Host chỉ chạy tool/test runner; Web/Core chạy Docker qua gateway.

Chỉ dùng sơ đồ khi cần giải thích luồng cụ thể: actor, API, bước kiểm quyền, transaction/commit, trạng thái và nhánh lỗi. Phase đơn giản có thể mô tả bằng các bước ngắn; không cần sơ đồ chung “Web gọi Core rồi cập nhật UI”.

## Quy ước data model, vị trí code và mức ảnh hưởng

Phase giữ bảng DB đầy đủ để team theo dõi nguồn dữ liệu và phạm vi ảnh hưởng: bảng/model, cột dùng hoặc thay đổi, thao tác đọc/ghi, FK/unique/index/version và caller cần hồi quy. Với UI, bảng mô tả cả tác động gián tiếp qua API; Web không truy cập DB trực tiếp.

Khi thay persistence hoặc nghiệp vụ, ghi bảng/cột bị đổi, FK/unique/version liên quan, thứ tự khóa/transaction và kế hoạch migration/backfill. Chi tiết model dùng [Data Model](../specifications/Data_Model.md); quyền và projection dùng [quy tắc dữ liệu](../configuration-and-data.md). Bảng/cột chưa triển khai ghi **P**; giữ lịch sử migration đã apply.

Chỉ ghi mức ảnh hưởng khi giúp xác định hồi quy: **thấp** cho state cục bộ, **trung bình** cho DTO/component dùng chung, **cao** cho quyền, transaction/concurrency hoặc migration. Giữ các bảng phụ thuộc của chức năng kể cả khi không đổi schema; phân biệt dữ liệu hiện có với phần đề xuất.

## Cấu trúc và ownership

| Tài liệu | Nội dung |
| --- | --- |
| menu.md | Phạm vi màn hình theo vai trò |
| implementation-status.md | Trạng thái triển khai và phần còn thiếu |
| staff/plans/00-staff-contract.md, customer/plans/00-customer-contract.md | API/routes và quy tắc dùng chung theo vai trò |
| plans/01–09 contracts | Hành vi, API và ranh giới của từng chức năng; liên kết phase triển khai |
| plans/<function>/*.md | Code/API thay đổi, luồng cụ thể và test case |

## Quy tắc cập nhật

- Giữ mỗi quy định ở tài liệu sở hữu; phần khác chỉ dẫn khi cần đọc sâu. Đặt tên chức năng trước mã phase.
- **E**: đã có source thực thi trong phạm vi nêu. **P**: kế hoạch chưa triển khai. Runtime hiện tại và việc còn làm phải tách rõ.
- Giữ nguyên test case và trạng thái nghiệm thu khi chỉnh câu chữ. Kết quả chạy trả ngắn trong trao đổi/công cụ kiểm thử, không chèn nhật ký hoặc số test pass vào tài liệu chức năng.
- Dùng ví dụ synthetic chung cho team; không phụ thuộc máy, tài khoản hoặc đường dẫn cá nhân.
- Tên tài liệu hợp đồng bảo hiểm là `policies.md`/`policies`; thay tên phải cập nhật liên kết.
