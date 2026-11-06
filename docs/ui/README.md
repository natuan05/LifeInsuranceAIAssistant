# UI — chỉ mục triển khai

04/11/2026. Tài liệu tiếng Việt; giao diện ứng dụng dùng tiếng Anh. Bộ file màn hình cũ đã được hợp nhất vào contracts/phases của từng vai trò, không duy trì hai bản đặc tả song song.

## Thứ tự đọc

Mỗi phase chứa **Test cases** và **sequence diagram** của chính chức năng đó. Phần kiểm thử là kịch bản có thể thực hiện, không phải nhật ký chạy test hoặc bảng đếm số ca pass. Xem [quy ước bên dưới](#quy-ước-test-case-và-sequence-diagram).

1. [Tiến độ](implementation-status.md): runtime E, phần P và mức chứng cứ.
2. [Menu/phạm vi](menu.md): các màn đích, không biến placeholder thành yêu cầu.
3. [Staff plans](staff/plans/README.md) và [contract chung](staff/plans/00-staff-contract.md): chức năng → phase API/UI/flow/test. Mốc tiếp là Staff Tickets và nghiệm thu không Agent.
4. [Customer plans](customer/plans/README.md) và [contract chung](customer/plans/00-customer-contract.md): để đợt Customer sau, chưa triển khai UI mới.
5. [API E/P](staff/plans/00-staff-contract.md#api-theo-chức-năng), [routes](staff/plans/00-staff-contract.md#điều-hướng), [gap](staff/plans/README.md#phần-còn-lại-theo-chức-năng): tham chiếu dùng chung, không lặp contract chức năng.
6. [Requirement](../specifications/Requirement.md), [Data Model](../specifications/Data_Model.md), [architecture](../architecture.md), [source review](../source-review.md): nguồn và quyết định local.

## Quy ước test case và sequence diagram

Mỗi test case có mã trong phạm vi phase và đủ bốn phần: **lớp kiểm thử**, **điều kiện/dữ liệu**, **các bước có thứ tự**, **kết quả mong đợi**. Kết quả cần nêu điều kiểm được: HTTP status/DTO, thay đổi DB, số mutation, quyền truy cập, DOM/focus hoặc navigation. Không viết “đã chạy thành công” thay cho kỳ vọng; không dùng HTTP/mock UI làm bằng chứng browser E2E thật.

Dùng các alias synthetic S-A/S-B, C-A/C-B và resource của fixture cô lập; thay bằng UUID thực khi chạy. Các path API rút gọn dùng prefix `/api/v1`. Request ghi dùng session, Origin và các header bảo vệ/CSRF theo contract của endpoint. Case đổi phân công, khóa tài khoản, quota, migration hoặc inject lỗi chỉ chạy trong harness/môi trường test; không phụ thuộc dữ liệu riêng của một thành viên, không sửa bootstrap và phải tự dọn fixture.

Sequence diagram dùng Mermaid `sequenceDiagram`, thể hiện actor, Web, Core và các thành phần thực sự tham gia như DB, Storage, worker hoặc Agent. Nêu thứ tự kiểm quyền, commit, phản hồi và nhánh lỗi chính; không chỉ đổi tên flowchart thành sequence diagram. Giữ sơ đồ đã đúng, bổ sung nơi còn thiếu. Phase chưa triển khai ghi rõ **dự kiến**, giữ endpoint/model chưa chốt ở trạng thái đề xuất.

Đây là quy ước viết tài liệu; chỉnh test case hoặc diagram không tự đổi trạng thái E/P, không chứng nhận chức năng đã pass. Kết quả chạy thực tế trả ngắn trong trao đổi hoặc công cụ kiểm thử, không chèn báo cáo theo từng lượt vào phần kịch bản.

## Cấu trúc và ownership

| Vị trí | Trách nhiệm |
| --- | --- |
| docs/ui/README.md, menu.md, implementation-status.md | Chỉ mục, phạm vi và snapshot tiến độ hai role |
| staff/README.md và staff/plans/README.md | Chỉ mục chức năng và phần còn lại theo owner |
| staff/plans/00 và 01–10 contracts | Ranh giới/model/quyết định, liên kết phase chức năng |
| customer/README.md, customer/plans/00 và 01–09 | Baseline Customer và kế hoạch tiếp theo |
| plans/<function>/*.md | Phase cụ thể: vị trí code, API spec, flow, tests, gate và trạng thái E/P |

Policy docs dùng tên policies, nhất quán InsurancePolicy; không đưa contracts.md cũ trở lại. Các màn đã làm vẫn có phase baseline để bảo trì, không coi việc bổ sung tài liệu là implement lại.

## Quy tắc cập nhật

Viết tài liệu cho cả team: mô tả chức năng, contract và cách triển khai từ repo. Ví dụ dùng dữ liệu synthetic chung; không phụ thuộc tài khoản, đường dẫn tuyệt đối hoặc bộ dữ liệu riêng của một thành viên. Hướng dẫn dựng môi trường phát triển nằm tại Getting Started; kết quả kiểm thử có ngày chỉ là bằng chứng cho phạm vi đã kiểm, không phải điều kiện máy cá nhân để triển khai chức năng.

- Sửa contract/phase sở hữu trước rồi đồng bộ API/routes/tiến độ/gap nếu ảnh hưởng. Không copy một API spec sang nhiều file thành nhiều nguồn khác nhau.
- E phải có controller/service/UI đúng phạm vi; P chưa phải code/migration. Khung route không là feature, mock không chứng minh Core quyền/Agent.
- Checkbox đánh dấu từng phạm vi cụ thể. Các kết quả có ngày là lịch sử; không tuyên bố test vừa chạy lại sau sửa Markdown.
- Không report/scratchpad mới, không screenshot/render ảnh; kiểm DOM/network/PDF extraction/hash. Chỉ app runtime Docker qua gateway.
- Không tự stage/commit; Customer/Agent hoãn vẫn giữ plan, không xóa requirement.
