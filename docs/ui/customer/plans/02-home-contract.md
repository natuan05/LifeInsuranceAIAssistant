# C02 — Workspace Customer và Home nhẹ

04/11/2026 · **Chưa triển khai** · [Chung](00-customer-contract.md) · C02.

## 1. Căn cứ và giới hạn

Home/dashboard là cách tổ chức UX cho FR-002/008, không một FR Must về metrics. Không tạo counts/summary endpoint hoặc bịa dữ liệu để có dashboard. Giữ profile/contact/chat/account thật, rồi thêm lối vào chức năng đã hoàn tất.

## 2. Phase

| Phase | Kết quả | Gate |
| --- | --- | --- |
| [H01](home/01-shell-navigation.md) | Customer shell/menu/routes, legacy link và auth state | Chat/profile/account không mất |
| [H02](home/02-home-composition.md) | Home gọn từ dữ liệu đã có, shortcut tới feature thật | H01; policy/product shortcut chỉ khi route chạy |

## 3. Contract và nghiệm thu

Không API mới cho H01/H02. H01 dùng auth hiện có và adapter route, H02 GET `/customers/me`; chỉ đọc thêm owner policy API PO01 nếu cần trình bày một mục thực tế. Không quét mọi trang policy để tính tổng. Không thông báo Customer giả hoặc badge unread từ messageCount.

- [ ] H01: một auth boundary, Back/deep link, chat drafts/realtime và `/account` giữ hoạt động.
- [ ] H02: Home không trùng đầy đủ trang profile, null/unassigned đúng, không hứa trạng thái thanh toán.
- [ ] DOM/keyboard/mobile/no-F5 và gateway E2E theo phase; không dùng UI ảnh làm nguồn yêu cầu.

## UX và baseline của chức năng

## Mục đích và thành phần dự kiến

Xem nhanh policy/kỳ phí từ Core, Staff phụ trách và lối tắt policy/trợ lý.

## Thao tác dự kiến

1. Từ menu mở Home; dùng GET own profile/contact và lối tắt tới route đã triển khai. Không cần API summary/counts riêng để dựng dashboard.
2. Bấm policy mở chi tiết đúng id; kỳ phí không có dữ liệu không chuyển thành đã thanh toán.
3. Mở Conversations trên chat I03–I06 đang có; AI trả lời/context Agent thật ở nhánh CH02/CH03.

- [x] Hồ sơ/Staff contact hiện có qua C08; phần đó không tính là dashboard hợp đồng đã xong.

## Checklist còn lại

- [ ] Shell H01 và Home H02 gọn từ dữ liệu thật; không charts/metrics hoặc endpoint tổng quan thừa.
- [ ] Loading/rỗng/lỗi; chưa có policy/Staff vẫn sử dụng các phần được phép.
- [ ] Lối tắt policy/chat và menu Customer mới.

Các phần dự kiến không phải contract đã duyệt; Core kiểm quyền, Agent không truy cập business DB. Thuật ngữ UI tiếng Anh dùng Policy.
