# UI — chỉ mục triển khai

04/11/2026. Tài liệu tiếng Việt; giao diện ứng dụng dùng tiếng Anh. Bộ file màn hình cũ đã được hợp nhất vào contracts/phases của từng vai trò, không duy trì hai bản đặc tả song song.

## Thứ tự đọc

1. [Tiến độ](implementation-status.md): runtime E, phần P và mức chứng cứ.
2. [Menu/phạm vi](menu.md): các màn đích, không biến placeholder thành yêu cầu.
3. [Staff plans](staff/plans/README.md) và [contract chung](staff/plans/00-staff-contract.md): chức năng → phase API/UI/flow/test. Mốc tiếp là Staff Tickets và nghiệm thu không Agent.
4. [Customer plans](customer/plans/README.md) và [contract chung](customer/plans/00-customer-contract.md): để đợt Customer sau, chưa triển khai UI mới.
5. [API E/P](staff/plans/00-staff-contract.md#api-theo-chức-năng), [routes](staff/plans/00-staff-contract.md#điều-hướng), [gap](staff/plans/README.md#phần-còn-lại-theo-chức-năng): tham chiếu dùng chung, không lặp contract chức năng.
6. [Requirement](../specifications/Requirement.md), [Data Model](../specifications/Data_Model.md), [architecture](../architecture.md), [source review](../source-review.md): nguồn và quyết định local.

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
