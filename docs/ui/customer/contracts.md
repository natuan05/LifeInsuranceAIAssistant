# C04 — Hợp đồng của tôi

[Menu](../menu.md) · [Tiến độ và gap](../implementation-status.md)

Đối chiếu 30/10/2026. **Chưa có UI/API policy Customer; model InsurancePolicy đã có quan hệ nhiều policy/Customer.**

## Mục đích và thành phần dự kiến

Danh sách policy, sản phẩm/status/ngày hiệu lực, quyền lợi/sum assured và kỳ phí từ Core.

## Thao tác dự kiến

1. Mở My policies, chọn một policy theo id; một Customer có thể có nhiều policy.
2. Xem coverage/premium/next due date từ nguồn Core; null không mặc định 0 hoặc đã đóng phí.
3. Mở tài liệu đúng version hoặc Hỏi về policy này sau khi có chat/context contract.

## Checklist còn lại

- [ ] Duyệt API ownership list/detail Customer; không dùng Staff API thay quyền Customer.
- [ ] UI list/detail, pagination/filter theo contract; loading/rỗng/lỗi/thu hồi quyền.
- [ ] Tách policy đang xem với policy liên kết chat, liên kết PDF và context rõ ràng.

Các phần dự kiến không phải contract đã duyệt; Core kiểm quyền, Agent không truy cập business DB. Thuật ngữ UI tiếng Anh dùng Policy, file contracts.md giữ để không gãy liên kết.
