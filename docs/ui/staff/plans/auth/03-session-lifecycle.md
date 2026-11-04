# Việc 01 — Retry khôi phục phiên không tải lại trang

Ngày **03/11/2026**. Trạng thái: **đã triển khai và kiểm chứng ngày 03/11/2026**. Thứ tự hôm nay: 01 → [02 Policy/PDF](../policies/04-viewer-lifecycle.md) → [03 chốt Inbox](../03-inbox-contract.md). Phạm vi/nghiệm thu chung tại [kế hoạch hôm nay](../../../../next-steps.md#kế-hoạch-hôm-nay--03112026).

## 1. Kết quả cần đạt

Mở Staff workspace hoặc Account khi mạng/Core lỗi → hiện Try again → kết nối phục hồi → bấm thử lại để lấy phiên và vào đúng route hiện tại. Không F5, không navigation document mới, không dùng location.href để thay state.

Đây là sửa lỗi G05, theo [Account](../01-auth-contract.md), NFR-001 và quy tắc không reload trong apps/web/AGENTS.md. Không đổi giao diện tài khoản, API auth hoặc cơ chế phân quyền.

## 2. Điểm xuất phát và file liên quan

| File | Điểm cần xử lý |
| --- | --- |
| [auth-screen.tsx](../../../../../apps/web/src/components/auth-screen.tsx) | Trước sửa: Try again gọi location.reload. Hiện dùng chung refresh qua ref, guard chống trùng, AbortController và trạng thái pending/focus |
| [auth-api.ts](../../../../../apps/web/src/lib/auth-api.ts) | me(signal?) đã nhận AbortSignal tùy chọn, giữ mặc định callers; AuthScreen kết hợp abort lifecycle và timeout 15 giây |
| [staff-account.spec.mjs](../../../../../apps/web/tests/browser/staff-account.spec.mjs) | 15 ca form giữ nguyên; bổ sung 13 ca tại staff-session.spec.mjs cho bootstrap/retry/timeout/abort/role |
| [playwright.config.mjs](../../../../../apps/web/playwright.config.mjs) | Trình duyệt chạy trên Web Docker; screenshot/video/trace tắt |

Đọc guide Next tương ứng trong node_modules/next/dist/docs trước khi sửa route/hook. Không thêm thư viện hoặc shared package chỉ để sửa retry.

## 3. Contract giữ nguyên

GET `/api/v1/auth/me`, cookie hiện tại, credentials include, cache no-store. Thành công `{actor,csrfToken}`; actor.id/role từ Core. Không tự gửi role/staffId để khôi phục quyền.

| Kết quả | Hành vi đích |
| --- | --- |
| 200 và role phù hợp | Set session, xóa lỗi, render workspace/account đúng URL |
| 200 nhưng role khác mode | Theo điều hướng role hiện có; không render nội dung role cũ |
| 401 | Xóa session/dữ liệu riêng, chuyển đúng login; Staff deep link giữ next nội bộ đã kiểm tra |
| Mạng/timeout/5xx khi chưa có phiên xác thực | Hiện lỗi và Try again; không render dữ liệu riêng hoặc báo đã login |
| 403/429 khi kiểm phiên | Lỗi an toàn, retry thủ công phù hợp; không loop hoặc cấp quyền từ state |
| Unmount/đổi mode khi request chưa xong | Bỏ phản hồi cũ; không set state hoặc redirect từ request đã lỗi thời |

Đổi password/logout/login vẫn theo code hiện có. Không giữ nội dung riêng sau 401 hoặc sau khi đổi actor. Xử lý lỗi refresh phiên nền giữ chính sách fail-closed hiện tại; việc giữ nguyên UI trên lỗi auth mạng nền cần thiết kế riêng, không mở rộng ngầm ở bản sửa này.

## 4. Các bước triển khai

1. Đưa luồng tải phiên thành một hàm có thể dùng cho initial load, focus/visibility/realtime và nút retry; chọn callback/ref hoặc cơ chế tương đương, tránh hai bản logic.
2. Chống request trùng cho cùng vòng tải. Retry liên tiếp/focus đồng thời không tạo nhiều request đang chạy; guard có vòng đời ổn định, không bị reset vì đổi render/loading.
3. Mỗi request có lifecycle token hoặc AbortController; hủy/bỏ response cũ khi unmount/mode đổi. Nếu sửa me() nhận signal, options là tùy chọn và bảo toàn các callers khác.
4. Nút type=button gọi refetch, không reload. Trong lúc chạy: aria-busy/status, disabled để tránh bấm trùng; khi lỗi lại thì bật nút, focus giữ hợp lý.
5. Giữ route/query/hash hiện tại khi retry thành công. Chỉ router.replace khi thực sự phải login/đổi role theo chính sách hiện có.
6. Giữ một bộ event listeners đúng vòng đời; không reconnect socket liên tục do tạo callback mới mỗi render. Không đưa csrfToken/session vào localStorage/sessionStorage hoặc log.
7. Cập nhật regression tập trung trong suite Account hoặc tệp test có mục đích lâu dài nếu suite hiện tại không phù hợp; không tạo script dùng một lần trong repo.

## 5. Ma trận kiểm thử

| Ca | Assertion chính |
| --- | --- |
| auth/me mạng lỗi lần đầu, retry 200 | Vào Account; document navigation chỉ có lần mở trang ban đầu |
| auth/me 500 rồi 200 | Lỗi hết, tên/mã Core đúng, URL/hash giữ nguyên |
| Click/Enter retry nhiều lần, focus/visibility cùng lúc | Tối đa một request cùng vòng; không kẹt nút pending |
| Retry tiếp tục lỗi/timeout | Nút dùng lại được, không phát nhiều request tự động vô hạn |
| Retry 401 | Xóa dữ liệu, chuyển Staff login; next nội bộ giữ đúng deep link |
| Mode/actor đổi hoặc unmount khi response chậm | Không render actor cũ, không redirect bởi response cũ |
| Staff login/Customer login/Customer account | Smoke bảo toàn luồng dùng chung vì AuthScreen phục vụ cả hai role |
| Keyboard/375px và desktop | Focus/status/lỗi dùng được, không tràn ngang |

Browser assertions dùng DOM/network, không screenshot. API mock kiểm FE, không tuyên bố chứng minh Core authorization. Có thể smoke GET auth/me thật qua gateway sau build; không đổi password/hồ sơ/credential để kiểm retry.

## 6. Thứ tự kiểm và Docker

- Chạy Web lint/typecheck cho thay đổi; chỉ thêm kiểm khác khi có lỗi/phụ thuộc mới.
- Build Web bằng Docker Compose và chờ healthy, gateway phục vụ đúng build theo Getting Started; không chạy Web/Core dev bằng npm trên host.
- Chạy `npm run test:browser:account` trên gateway Docker; giữ tests cũ và các ca mới cùng pass. Test runner không được start host server.
- Đọc một kết quả tổng hợp; dọn artifact do lần chạy tạo, không tạo Markdown report, không log session/token.

## 7. Điều kiện hoàn thành

- [x] Try again không còn location.reload/location.href để retry phiên.
- [x] Mạng/500 → retry thành công và 401 → login đúng; không duplicate/stale request.
- [x] Các ca form Account cũ vẫn pass; số ca mới ghi theo kết quả thật.
- [x] Luồng auth dùng chung không đổi quyền/cookie/CSRF và không làm mất next hợp lệ.
- [x] Cập nhật Account/G05/checklist bằng bằng chứng đã chạy, không đánh dấu E2E Core từ API mock.
- [x] Dọn artifact của mình, không stage/commit nếu chưa được yêu cầu.

Ước lượng để chia buổi: **1–2 giờ**, tùy lỗi phát sinh khi kiểm tra; không phải cam kết thời gian. Nếu chưa đạt gate thì tiếp tục xử lý việc 01 trước khi chuyển việc 02.

## 8. Kết quả triển khai 03/11/2026

- AuthScreen dùng chung refresh cho initial/focus/visibility/realtime/retry; nút có disabled/status/focus, không reload document. Unmount/đổi mode abort request và bỏ phản hồi cũ. Role/next/cookie/CSRF giữ nguyên.
- Web lint/typecheck pass; Docker Web build/up healthy, gateway đã restart và phục vụ build mới ở http://localhost:8080.
- 43 kịch bản Chromium được kiểm: 15 Account + 15 Customers + 13 Session. Lượt đầu 41 pass, 2 smoke login lỗi selector nhãn Password; sửa selector, chạy lại đúng 2 ca và cả hai pass. Code ứng dụng không cần sửa sau lượt đầu. Không ghi kết quả thành một lượt chạy 43/43 duy nhất.
- Ca mới có timeout 15 giây thực, dedup các trigger đồng thời, abort request cũ khi đổi portal, chuyển role/401 và giữ query/hash/next. Tests dùng API/WebSocket synthetic mock; chưa phải E2E Core/DB.
- test:browser:account hiện chạy cả staff-account.spec.mjs và staff-session.spec.mjs. Artifact kiểm thử được dọn sau khi đọc kết quả; không screenshot/commit.

Tối ưu tiếp ngày 03/11: [kiểm phiên khi quay lại tab](../01-auth-contract.md#kiểm-phiên-khi-quay-lại-tab) dùng freshness 30 giây cho focus/visibility/ready, vẫn bypass initial/retry/invalidate/expiry. Suite Session hiện 22 ca, bộ browser liên quan 78 ca pass; không thay các số liệu của lượt triển khai ban đầu ở trên.

Việc 01 đã đạt gate. Trạng thái các việc tiếp theo được cập nhật tại [phạm vi hôm nay](../../../../next-steps.md#kế-hoạch-hôm-nay--03112026).
