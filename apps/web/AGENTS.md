<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## Styling — quy ước của người dùng

- Toàn bộ giao diện Web dùng Tailwind CSS 4, prefix `tw:`. Viết utility trong component, gồm responsive, hover/focus, disabled, loading và error states.
- Không thêm stylesheet/component CSS cũ, CSS Modules, styled-jsx, inline style hoặc `@apply` để bọc lại class cũ. Ưu tiên utility có sẵn; dùng arbitrary values/variants khi cần giữ kích thước hoặc trạng thái chính xác.
- `src/app/globals.css` chỉ giữ import Tailwind, `@font-face` và `@theme` (tokens/keyframes). Style UI không đặt tại đây. `staff-workspace.css` đã được loại bỏ.
- Class không có prefix chỉ được giữ làm hook cho tương tác, cấu trúc hoặc state (ví dụ `collapsed`, `active`); định kiểu các hook bằng Tailwind variants, không thêm CSS selectors riêng.
- Giữ nguyên quyền truy cập, API và luồng Customer/Staff khi đổi style. Không chụp screenshot để kiểm chứng nếu người dùng chưa yêu cầu.

## Tương tác không tải lại toàn trang — quy ước của người dùng

- Các thao tác trong app như Search/Clear, phân trang, lọc, lưu/hủy và thử lại không được gây reload document như F5 hoặc làm remount toàn workspace.
- Form tương tác phải chặn submit mặc định khi xử lý bằng JavaScript. Không dùng location.reload/location.href để cập nhật dữ liệu nội bộ; dùng API và cập nhật state/invalidation đúng phạm vi.
- Đổi query trên cùng màn hình ưu tiên History API tích hợp useSearchParams; đổi route dùng Next Link/router. Giữ URL, Back/Forward và các kiểm tra quyền hiện có.
- Giữ sidebar/layout và trạng thái nhập/focus phù hợp; loading/error hiển thị ở vùng dữ liệu đang cập nhật. Không dùng key theo từ khóa/query để remount form hoặc workspace.
- Không yêu cầu người dùng F5 sau mỗi thao tác. Reload một lần để nhận bản build mới khác với reload trong luồng sử dụng thông thường.
