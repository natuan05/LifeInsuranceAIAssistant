# Dữ liệu hợp đồng tối thiểu

**Đã chốt — 30/10/2026.** Giữ dữ liệu hợp đồng tối thiểu trong Core; chi tiết hợp đồng còn lại tra qua RAG. Bản này là nguồn chuẩn cho quyết định, thay đề xuất ba bảng người/phần tham gia/liên kết tài liệu trước đó. Chưa triển khai validation, sửa Prisma, migration hoặc seed.

## Phạm vi lưu có cấu trúc

| Thông tin | Cách lưu đã chốt |
| --- | --- |
| Mã hợp đồng, Customer sở hữu | Giữ `policyNumber`, `customerId` hiện có |
| Sản phẩm chính | Giữ `InsurancePolicy.productId` |
| Các sản phẩm bổ trợ đã tham gia | Bổ sung danh sách mã sản phẩm trong `benefitsSnapshot` JSONB hiện có |
| Danh sách bổ trợ đã được kiểm tra đầy đủ chưa | Một cờ `ridersComplete` trong cùng JSON; mặc định chưa xác nhận |

**Không thêm bảng hoặc cột mới trong phạm vi này.** Dùng `benefitsSnapshot` với `schemaVersion`, `riders` là danh sách mã `InsuranceProduct.productCode` không trùng và `ridersComplete` là cờ xác nhận danh sách đầy đủ. Core kiểm tra mã theo danh mục khi nhập; chỉ đặt cờ đầy đủ khi đã xác minh và ánh xạ hết các bổ trợ.

JSON cũ, thiếu trường hoặc chưa kiểm tra không được coi là danh sách đầy đủ. Quy tắc validation/API cụ thể sẽ được viết khi triển khai.

Danh sách này chỉ trả lời sản phẩm nào có trong hợp đồng, không mô tả từng người hay từng quyền lợi. Cùng sản phẩm cho nhiều người chỉ cần xuất hiện một lần; hỏi “cho ai, gói nào, hạn mức bao nhiêu” thì đọc tài liệu Private.

- Có mã bổ trợ đã xác minh trong danh sách: xác nhận có tham gia theo dữ liệu đã nhập.
- Không có mã và danh sách đã xác nhận đầy đủ: có thể trả lời không tham gia theo bộ dữ liệu đó.
- Danh sách chưa đầy đủ hoặc còn sản phẩm chưa ánh xạ: dùng RAG tìm thêm; thiếu bằng chứng thì trả chưa xác định. Không mặc định JSON cũ hoặc rỗng là không tham gia.

## Phần để RAG tra cứu

Người được bảo hiểm, người thụ hưởng, chương trình, số tiền/hạn mức từng quyền lợi, thời hạn riêng, điều kiện, loại trừ và phụ lục được tra trong tài liệu hợp đồng. Chưa tạo bảng `ContractParty`, `ContractCoverage`, `ContractDocumentBinding` hoặc mô hình hạn mức.

Luồng tra cứu: Core xác minh quyền và hợp đồng → cấp đúng tài liệu/phiên bản → Private RAG tìm trong phạm vi đó. Được [tra toàn bộ hồ sơ thuộc hợp đồng đã cấp quyền](Agent_Design.md#whole-contract-retrieval), gồm phụ lục/tài liệu kèm theo, không chỉ các trường metadata ở trên. Mã hợp đồng là bộ lọc đối tượng, không tự cấp quyền. Giữ các bảng `Document`/`DocumentVersion` hiện có; cách liên kết bộ tài liệu/phiên bản là đặc tả kỹ thuật, không cần mở thêm bảng trong đợt này.

Thông tin trên PDF phản ánh tài liệu tại thời điểm của nó. RAG không xác nhận được trạng thái hiện tại, phí thực thu hoặc số dư hiện tại nếu không có nguồn cập nhật; bảng minh họa vẫn là dự phóng.

## Dữ liệu thử và bước tiếp theo

[Fixture hiện có](../../data/synthetic/manulife-demo-v1/README.md) được sinh hoàn toàn giả lập, chưa seed. Hai quyền lợi demo chưa ánh xạ danh mục thương mại; không tự coi chúng là sản phẩm MVP đã chọn.

Ngoại lệ 03/11/2026 cho phép lưu Git [bản Private đầy đủ đã khử định danh có dữ liệu demo](../../data/private/manulife-demo-full-v1/README.md). Nguồn vẫn `synthetic=false`, chưa human/RAG approval; không tự seed/chunk/embed. PDF/bản thô/ảnh/định danh thật không thuộc ngoại lệ; ô chưa điền vẫn là thiếu dữ liệu. Đáp án fixture synthetic không áp cho bản đầy đủ.

Bước tiếp theo: ánh xạ danh sách sản phẩm trong fixture synthetic theo cấu trúc đã chốt, rồi thiết kế API đọc hợp đồng. Hai Business Tools đã chốt là [`list_contracts` và `get_contract_overview`](Agent_Design.md#contract-read-tools); còn schema input/output và lỗi chi tiết. Chỉ sửa code/seed khi được yêu cầu triển khai.
