# Web

Nơi phát triển Next.js cho Customer Portal và Staff Workspace, gồm sidebar AI hỗ trợ Staff.

- Dùng chung một ứng dụng; phân tách trải nghiệm theo vai trò khi có thiết kế màn hình.
- Gọi Core để truy cập nghiệp vụ, hội thoại và xin quyền xem PDF.
- Không gọi Agent trực tiếp từ browser; không giữ model key hoặc database credential ở frontend.
- Thành phần chạy phía server của Next.js vẫn phải đi qua Core cho nghiệp vụ.

Chưa scaffold Next.js, chọn phiên bản, tạo route hoặc cài dependencies. Xem [ranh giới kiến trúc](../../docs/architecture.md).
