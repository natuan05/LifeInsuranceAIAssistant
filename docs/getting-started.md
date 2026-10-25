# Life Insurance AI Assistant — Hướng dẫn chạy dự án

Hướng dẫn dùng chung cho thành viên clone repo về máy. Các lệnh dưới đây chạy tại thư mục gốc có `compose.yaml` và `package.json`. Ví dụ dùng PowerShell trên Windows; cổng trong tài liệu là giá trị mặc định.

Ứng dụng hiện có: Next.js frontend, NestJS Core, PostgreSQL/pgvector, Nginx gateway, DbGate và tool quản trị tài khoản local. Đã có đăng nhập, đổi mật khẩu, hồ sơ Customer và danh sách Customer theo phân công cho Staff. Agent/AI, nghiệp vụ hợp đồng/Ticket và cloud chưa triển khai; RDS ngoài phạm vi hiện tại.

Mục lục: [1. Chuẩn bị](#prerequisites) · [2. File môi trường](#environment) · [3. Full Docker](#full-docker) · [4. Dev bằng npm](#npm-development) · [5. Tool admin](#admin-tool) · [6. Cổng và URL](#ports) · [7. Tài khoản mẫu](#dev-accounts) · [8. Database](#database) · [9. Kiểm tra và cập nhật](#commands) · [10. Xử lý lỗi](#troubleshooting) · [11. Cấu trúc](#project-layout).

<a id="prerequisites"></a>
## 1. Chuẩn bị sau khi clone

### 1.1. Phần mềm cần có

| Phần mềm | Khi nào cần | Ghi chú |
| --- | --- | --- |
| Git | Clone/cập nhật source | Dùng repository của team |
| Docker Desktop, Linux containers và Compose v2 | Database và chạy full Docker | Bật Docker Desktop trước khi chạy lệnh |
| Node.js 24.18.0, npm 11.16.0 | FE/BE chạy npm, tool admin và các lệnh npm | Xem .node-version và package.json |
| PostgreSQL/pgAdmin/DBeaver cài riêng | Không bắt buộc | PostgreSQL và DbGate đã có trong Docker |

Full Docker cho website chỉ cần Docker Desktop. Nếu dùng tool admin thì cần thêm Node/npm vì tool chạy trên host.

### 1.2. Mở terminal tại root repo

~~~powershell
cd LifeInsuranceAIAssistant
docker --version
docker compose version
node --version
npm --version
~~~

Hai lệnh Node/npm chỉ cần cho chế độ npm/tool. Repo dùng npm workspaces, cài dependency tại root bằng `npm ci`; không tạo lockfile riêng trong từng app.

<a id="environment"></a>
## 2. Chuẩn bị các file môi trường

### 2.1. Copy mẫu thành .env

Lần đầu, copy file mẫu tương ứng rồi đặt tên `.env`. Có thể copy bằng Explorer/VS Code hoặc dùng đoạn PowerShell sau; đoạn này giữ nguyên file .env đã tồn tại:

~~~powershell
if (-not (Test-Path .env)) {
  Copy-Item .env.example .env
}
if (-not (Test-Path apps/core/.env)) {
  Copy-Item apps/core/.env.example apps/core/.env
}
if (-not (Test-Path apps/web/.env)) {
  Copy-Item apps/web/.env.example apps/web/.env
}
~~~

Linux/macOS có thể dùng `cp -n .env.example .env` và tương tự cho hai app. Kiểm tra file thực sự có tên .env, không phải .env.txt.

| File mẫu → file sử dụng | Phạm vi | Khi cần |
| --- | --- | --- |
| [.env.example](../.env.example) → .env | Cổng publish của Docker Compose | Full Docker và database Docker |
| [apps/core/.env.example](../apps/core/.env.example) → apps/core/.env | Host/port/CORS của Core chạy npm | Dev FE/BE trên host |
| [apps/web/.env.example](../apps/web/.env.example) → apps/web/.env | URL Core mà frontend chạy npm gọi | Dev FE/BE trên host |

Các giá trị mặc định đã dùng được. Việc copy file giúp từng thành viên có cấu hình riêng; không bắt buộc sửa giá trị nếu không bị trùng cổng. Source có fallback mặc định nên chưa copy env vẫn có thể khởi động; quy trình chuẩn của team là tạo file theo bảng trên.

### 2.2. Các biến cần biết

| File | Biến mặc định | Ý nghĩa |
| --- | --- | --- |
| .env | GATEWAY_PORT=8080 | Cổng vào website/API Docker |
| .env | SWAGGER_PORT=8081 | Cổng Swagger riêng của Docker, mở tại http://localhost:8081 |
| .env | DATABASE_UI_PORT=5050 | Cổng DbGate |
| .env | POSTGRES_PORT=5432 | Cổng PostgreSQL publish lên host |
| apps/core/.env | HOST=127.0.0.1, PORT=4000 | Core chạy npm trên host |
| apps/core/.env | CORS_ORIGINS=http://localhost:3000,http://127.0.0.1:3000 | Cho phép frontend dev gửi cookie tới Core |
| apps/core/.env | NODE_ENV, ENABLE_API_DOCS | Tùy chọn; development mặc định bật Swagger |
| apps/web/.env | NEXT_PUBLIC_CORE_API_URL=http://localhost:4000/api/v1 | URL Core cho frontend npm |

.env root được Docker Compose đọc. Hai file env trong app phục vụ chế độ npm; full Docker dùng cấu hình service/build args trong compose.yaml, không đọc trực tiếp hai file đó. FE Docker gọi API cùng origin qua đường dẫn /api/v1.

Nếu đổi cổng Docker, sửa .env root rồi chạy lại lệnh full Docker có --build. Nếu tự đổi cổng FE/BE npm, cập nhật URL frontend và CORS origin tương ứng rồi restart app.

### 2.3. Database credential được sinh tự động

Không cần tự điền username/password database vào .env khi dùng quy trình mặc định:

- Compose sinh credential riêng cho từng role trong Docker volumes; Web không nhận DB password.
- `npm run dev:db` / `npm run dev:setup` tự lấy credential core_runtime cho host vào .local/dev/core-password và ghi cấu hình .local/dev/core.env; không in password.
- Tool admin lấy admin_runtime qua bộ nhớ/stdin; không dùng tài khoản local_owner cho app.
- Không tự bỏ comment/đặt PGHOST, PGUSER, DATABASE_PASSWORD_FILE trong apps/core/.env nếu dùng dev:db với cấu hình tự động. Nếu đã đặt, giá trị phải khớp cấu hình sinh ra; helper sẽ từ chối xung đột.

.env thật, .local và credential volumes không đưa vào Git. Biến NEXT_PUBLIC_* là công khai, chỉ chứa URL/cấu hình giao diện. Ngoại lệ chia sẻ credential chỉ áp dụng đúng 5 tài khoản dev synthetic ở mục 7; DB/operator credential không thuộc ngoại lệ.

<a id="full-docker"></a>
## 3. Cách 1 — Chạy toàn bộ website bằng Docker

### 3.1. Khởi động

Bật Docker Desktop, tại root chạy:

~~~powershell
docker compose up -d --build --wait
~~~

Không cần npm ci cho cách này; dependency Web/Core được cài trong quá trình build image.

Mở [Customer login](http://localhost:8080/login) hoặc [Staff login](http://localhost:8080/staff/login). Xem [database](http://127.0.0.1:5050) và [Swagger tại cổng riêng 8081](http://localhost:8081). Tool admin chạy riêng theo mục 5.

### 3.2. Các bước tự động

Compose chuẩn bị credential → bật PostgreSQL → bootstrap role/schema → chạy migration → seed 2 Staff/3 Customer → cho Core và DbGate sẵn sàng. Web và gateway có healthcheck riêng.

Không cần mở tool admin để có tài khoản mẫu. Chạy lại không tạo trùng và không reset password, trạng thái hoặc phân công đã thay đổi.

### 3.3. Container nào phải chạy liên tục?

| Container/service | Vai trò | Trạng thái bình thường |
| --- | --- | --- |
| postgres | Database PostgreSQL/pgvector | Running, healthy |
| core | Backend NestJS | Running, healthy |
| web | Frontend Next.js | Running, healthy |
| gateway | Nginx chuyển request tới Web/Core | Running, healthy |
| database-ui | DbGate xem bảng | Running, healthy |
| prepare | Chuẩn bị credential | Exited (0) sau khi xong |
| bootstrap | Chuẩn bị role/schema/extension | Exited (0) sau khi xong |
| migrate | Áp dụng migration | Exited (0) sau khi xong |
| seed-dev | Tạo tài khoản dev còn thiếu | Exited (0) sau khi xong |

Bốn job cuối dừng sau khi hoàn thành là thành công. Có thể giữ nguyên hoặc bật “Only show running containers” trong Docker Desktop. Chúng sẽ được chạy lại khi Compose cần chuẩn bị stack.

### 3.4. Kiểm tra và dừng

~~~powershell
docker compose ps --all
docker compose logs --tail 100 core gateway
docker compose down
~~~

`down` giữ dữ liệu/credential trong volumes. **Không thêm -v trong thao tác dừng thông thường** vì sẽ xóa volumes của stack. Tắt Docker không đồng nghĩa xóa tài khoản hay database.

<a id="npm-development"></a>
## 4. Cách 2 — FE/BE bằng npm, database bằng Docker

### 4.1. Cài dependency một lần

Sau khi tạo env ở mục 2:

~~~powershell
npm ci
~~~

Chỉ cần chạy lại npm ci khi cài mới hoặc package-lock.json thay đổi.

### 4.2. Chạy FE/BE cùng database

~~~powershell
npm run dev:db
~~~

Lệnh tự bật PostgreSQL/DbGate và các job chuẩn bị bằng Docker, seed tài khoản, tạo cấu hình DB host, generate Prisma Client rồi chạy đồng thời FE và BE bằng npm watch.

- Frontend: [localhost:3000](http://localhost:3000/login).
- Staff login: [localhost:3000/staff/login](http://localhost:3000/staff/login).
- Core: [localhost:4000/api/v1](http://localhost:4000/api/v1/health/live).
- Swagger: [localhost:4000/api/v1/docs](http://localhost:4000/api/v1/docs).
- Database và DbGate vẫn dùng Docker, chia sẻ cùng dữ liệu với full Docker.

Giữ terminal chạy; Ctrl+C dừng FE/BE npm. Database/UI Docker vẫn chạy. Chỉnh source sẽ tự cập nhật qua cơ chế dev, không cần build lại image mỗi lần sửa code.

Chế độ này không cần bật gateway: browser → FE 3000; frontend gọi Core 4000 trực tiếp, Core kiểm tra CORS. Nếu gateway 8080 đang chạy thì nó vẫn phục vụ bản container, không phải code npm đang sửa.

### 4.3. Chạy FE và BE trong hai terminal riêng (tùy chọn)

Chuẩn bị hạ tầng trước:

~~~powershell
npm run dev:setup
npm run db:generate --workspace @life-insurance/core
~~~

Để Core chạy riêng có DB, mở .local/dev/core.env và copy đúng 5 dòng PGHOST, PGPORT, PGDATABASE, PGUSER, DATABASE_PASSWORD_FILE vào apps/core/.env. File này chỉ chứa thông số kết nối và đường dẫn tới password file; không copy nội dung password vào env. Giữ nguyên dấu nháy quanh đường dẫn nếu có. Khi đổi máy/cổng DB cần cập nhật theo file mới sinh.

Terminal 1 tại root:

~~~powershell
npm run dev:core
~~~

Terminal 2 tại root:

~~~powershell
npm run dev:web
~~~

Cách gọn nhất vẫn là dev:db ở mục 4.2 vì tự truyền cấu hình DB cho cả hai process.

### 4.4. Chạy không có database, chỉ thử kết nối FE–BE

~~~powershell
npm run db:generate --workspace @life-insurance/core
npm run dev
~~~

Khi không cấu hình DATABASE_PASSWORD_FILE, Core vẫn có liveness nhưng readiness trả 503; chưa dùng được login/hồ sơ. Mở [trang connection](http://localhost:3000/connection) và chạy npm run check:connection khi hai app đã lên. Nếu trước đó đã cấu hình DB trong env/shell thì npm run dev sẽ dùng cấu hình đó.

<a id="admin-tool"></a>
## 5. Chạy tool quản trị local

### 5.1. Bật tool

Sau npm ci, mở terminal khác tại root:

~~~powershell
npm run admin
~~~

Mở [127.0.0.1:4100](http://127.0.0.1:4100). Script tự chuẩn bị database local và build tool; không cần mở Web/Core public trước. Tool dùng cùng PostgreSQL với cả hai cách chạy ở trên. Chỉ chuẩn bị operator mà chưa bật server: npm run admin:setup.

Tool hiện chỉ kết nối PostgreSQL local. Chưa có chế độ kết nối RDS và không expose qua gateway.

### 5.2. Lấy tài khoản operator lần đầu

**Vừa clone repo thì chưa có hai file operator.** Thư mục `.local/` bị Git ignore; mỗi thành viên sẽ tạo tài khoản operator riêng trên máy của mình, không cần nhận file hay mật khẩu từ người khác.

Sau khi chuẩn bị env theo mục 2 và bật Docker Desktop, chạy tại root repo:

~~~powershell
npm ci
npm run admin
~~~

Nếu đã cài dependency thì không cần chạy lại `npm ci`. Khi `npm run admin` chuẩn bị DB và build tool thành công, script kiểm tra operator: nếu chưa có `.local/dev/operator.json`, nó sinh mật khẩu ngẫu nhiên và tạo hai file sau, rồi bật server tool:

| File trên máy của người chạy | Nội dung và mục đích |
| --- | --- |
| `.local/dev/operator-initial.txt` | Username `local-operator` và mật khẩu ban đầu dạng đọc được, để lấy thông tin đăng nhập lần đầu |
| `.local/dev/operator.json` | Username và hash bcrypt của mật khẩu, để tool xác thực những lần đăng nhập sau |

Đường dẫn tính từ root repo vừa clone. Mở file `.local/dev/operator-initial.txt` bằng VS Code/Notepad trên chính máy, lấy mật khẩu rồi đăng nhập tại [http://127.0.0.1:4100](http://127.0.0.1:4100) bằng username `local-operator`. Mỗi máy có mật khẩu ngẫu nhiên riêng, dù username giống nhau.

Nếu chỉ muốn chuẩn bị operator trước mà chưa bật server, chạy `npm run admin:setup`. Lệnh này cũng tạo hai file khi chưa có operator; sau đó dùng `npm run admin` để mở tool. **Chỉ clone repo, copy env, chạy `npm ci`, `docker compose up` hoặc `npm run dev:db` sẽ chưa tạo hai file operator.**

Chạy lại `npm run admin` hoặc `npm run admin:setup` sẽ giữ operator hiện có, không đổi mật khẩu và không tạo lại file `.txt` nếu file hash `.json` vẫn còn. Không cần tạo operator lại mỗi lần cập nhật code hoặc khởi động tool.

Không đưa hai file này lên Git, tài liệu, chat hoặc log. Có thể xóa file `.txt` sau khi đã lưu mật khẩu an toàn; giữ file `.json` để tiếp tục dùng operator đó. Hash trong `.json` không dùng để xem lại mật khẩu đã quên.

Operator là tài khoản riêng của tool; 5 tài khoản Staff/Customer ở mục 7 dùng để đăng nhập website. Phiên tool có hạn 30 phút, restart tool yêu cầu đăng nhập lại. Giữ terminal chạy; Ctrl+C dừng tool.

### 5.3. Dùng tool

1. **Cấp tài khoản:** chọn Staff/Customer, nhập tên và email synthetic. Để trống password để tự sinh hoặc nhập tối thiểu 6 ký tự/tối đa 72 byte UTF-8. Mã STF-/CUS- được cấp tự động.
2. **Lưu password:** dialog chỉ hiện password trong lần tạo/reset đó, có nút copy. Đóng rồi không xem lại; nếu mất thì dùng Reset riêng.
3. **Phân công:** mở Chi tiết Customer, tìm Staff active theo tên/email/mã, chọn Staff hoặc Chưa phân công để gỡ và xác nhận. Customer bị khóa cần mở khóa trước khi gán mới; vẫn có thể gỡ phân công. Staff cũ mất quyền ở request tiếp theo sau commit.
4. **Khóa/mở khóa/reset:** kiểm tra đúng mã/email trong dialog xác nhận. Các thao tác thu hồi phiên cũ; mở khóa không làm phiên cũ dùng lại được. Reset bật lại lời nhắc đổi password, giữ nguyên trạng thái ACTIVE/LOCKED.
5. **Audit:** xem người thao tác, hành động, đối tượng, kết quả và thời gian; lọc theo hành động/phân trang.

Tool từ chối thay đổi từ màn hình cũ bằng lỗi 409 rồi tải lại dữ liệu. Không tự gửi lại vô hạn sau timeout. Không có xóa user hoặc đổi role trong tool.

<a id="ports"></a>
## 6. Danh sách cổng và đường dẫn

### 6.1. Cổng mặc định

| Thành phần | Full Docker: cổng trong container | Cổng truy cập từ máy khi full Docker | FE/BE chạy npm |
| --- | --- | --- | --- |
| Nginx gateway | 80 | 127.0.0.1:8080 | Không bắt buộc |
| Swagger qua Nginx | 81 trong gateway | 127.0.0.1:8081 | Dùng Core 4000/api/v1/docs trực tiếp |
| Frontend Next.js | 3000 | Qua gateway 8080; không publish 3000 | localhost:3000 |
| Backend NestJS | 4000 | Qua gateway 8080; không publish 4000 | localhost:4000 |
| PostgreSQL | 5432 | 127.0.0.1:5432 | Vẫn dùng DB Docker tại 5432 |
| DbGate | 3000 trong database-ui | 127.0.0.1:5050 | Vẫn dùng UI Docker tại 5050 |
| Tool admin | Chạy host, không nằm trong Compose | 127.0.0.1:4100 khi chạy npm run admin | Cùng cổng 4100 |

Các cổng publish Docker có thể đổi bằng .env root; cổng nội bộ Web/Core vẫn giữ theo compose.yaml. Các job prepare/bootstrap/migrate/seed không mở cổng.

### 6.2. URL thường dùng

| Mục đích | Full Docker | Npm FE/BE |
| --- | --- | --- |
| Customer login | http://localhost:8080/login | http://localhost:3000/login |
| Staff login | http://localhost:8080/staff/login | http://localhost:3000/staff/login |
| Customer / Staff dashboard | /customer / /staff qua 8080 | /customer / /staff qua 3000 |
| Tài khoản / đổi password | /account qua 8080 | /account qua 3000 |
| Swagger UI | http://localhost:8081 → /api/v1/docs | http://localhost:4000/api/v1/docs |
| OpenAPI JSON | http://localhost:8081/api/v1/docs-json | http://localhost:4000/api/v1/docs-json |
| Backend liveness | http://localhost:8080/api/v1/health/live | http://localhost:4000/api/v1/health/live |
| Backend + DB readiness | http://localhost:8080/api/v1/health/ready | http://localhost:4000/api/v1/health/ready |
| Gateway health | http://localhost:8080/gateway-health | Không bắt buộc |
| Kiểm tra kết nối FE–BE | http://localhost:8080/connection | http://localhost:3000/connection |
| Xem bảng | http://127.0.0.1:5050 | http://127.0.0.1:5050 |
| Quản trị tài khoản | http://127.0.0.1:4100 | http://127.0.0.1:4100 |

### 6.3. Chiều gọi request

Full Docker: browser → Nginx 8080 → Web hoặc Core. Đường /api/* được chuyển tới Core, còn trang/assets tới Web. Npm dev: frontend gọi Core trực tiếp ở 4000. Core không gọi ngược frontend để xử lý đăng nhập; gateway không phải trang login riêng.

### 6.4. Sử dụng Swagger

Full Docker mở [http://localhost:8081](http://localhost:8081), tự chuyển tới Swagger UI. Đây là listener riêng trong container gateway, không thêm backend hoặc database mới. Swagger assets, OpenAPI JSON và request từ **Try it out** đều đi từ 8081 tới Core; cổng này không phục vụ frontend hay tool admin. Địa chỉ Swagger cũ qua gateway 8080/api/v1/docs vẫn dùng được.

Có thể đổi cổng bằng `SWAGGER_PORT` trong .env root rồi chạy lại `docker compose up -d --build --wait`; nếu .env cũ chưa có biến này thì mặc định vẫn là 8081. Compose tự thêm origin của cổng đã chọn vào allowlist của Core.

Trong Swagger, mở endpoint → Try it out → nhập tham số/body → Execute. Endpoint login cần header `X-Auth-Request: 1`, email/password ở mục 7 và đúng endpoint Customer/Staff. Browser tự giữ cookie phiên; các request ghi yêu cầu thêm `X-CSRF-Token` dùng giá trị `csrfToken` trả từ login hoặc me. Dùng thống nhất hostname localhost hoặc 127.0.0.1.

Khi chạy FE/BE bằng npm, Swagger phục vụ code npm ở [http://localhost:4000/api/v1/docs](http://localhost:4000/api/v1/docs), không cần gateway. Để thử POST tại đó, thêm origin chính xác `http://localhost:4000` hoặc `http://127.0.0.1:4000` vào `CORS_ORIGINS` trong apps/core/.env và restart Core (giữ cả origin FE 3000). Cổng 8081 nếu đang bật vẫn gọi Core Docker, giống như cổng website 8080.

<a id="dev-accounts"></a>
## 7. Tài khoản đã seed sẵn

### 7.1. Danh sách đầy đủ

**Mật khẩu ban đầu chung: `DevLocal-2026!`**.

| Vai trò | Email đăng nhập | Mã định danh | Phân công ban đầu |
| --- | --- | --- | --- |
| Staff A | staff.a@dev.example.invalid | STF-000001 | Phụ trách Customer A |
| Staff B | staff.b@dev.example.invalid | STF-000002 | Phụ trách Customer B |
| Customer A | customer.a@dev.example.invalid | CUS-000001 | Staff A |
| Customer B | customer.b@dev.example.invalid | CUS-000002 | Staff B |
| Customer chưa phân công | customer.unassigned@dev.example.invalid | CUS-000003 | Chưa có Staff |

Cả Staff và Customer đều được cấp tài khoản; không có tự đăng ký công khai. **Chỉ đăng nhập bằng email**, mã định danh không dùng để login. Staff vào /staff/login; Customer vào /login. Không có /customer/login.

Đây là đúng 5 fixture synthetic được phép công khai credential cho dev local. Không dùng dữ liệu khách hàng/hợp đồng thật, kể cả đã che tên.

### 7.2. Khi nào seed chạy?

- Full Docker up tự seed sau migration, trước khi Core/DbGate sẵn sàng.
- dev:db, dev:setup và admin cũng chuẩn bị DB kèm seed.
- Chạy seed tường minh khi cần:

~~~powershell
npm run bootstrap:dev
~~~

Nếu chỉ dùng Docker, có thể xem kết quả bằng `docker compose logs seed-dev`. Seed chạy lại chỉ tạo tài khoản mẫu còn thiếu, không reset password đã đổi, trạng thái khóa, hồ sơ hoặc phân công. Nếu password ban đầu không đăng nhập được sau khi đã dùng dự án, thử password hiện tại hoặc reset bằng tool; không xóa database để xử lý.

### 7.3. Đăng nhập và đổi mật khẩu

Đăng nhập xong đi thẳng dashboard đúng role; không OTP/kích hoạt hoặc ép đổi lần đầu. Banner nhắc đổi có nút Để sau. Tại Tài khoản → Đổi mật khẩu, nhập password hiện tại/mới/xác nhận; mới phải khác cũ, tối thiểu 6 ký tự và tối đa 72 byte UTF-8. Các ô có nút mắt hiện/ẩn riêng.

Đổi thành công tắt lời nhắc và thu hồi mọi phiên cũ; thiết bị hiện tại tiếp tục dùng phiên mới, thiết bị khác cần login lại. Phiên website có hạn tuyệt đối 8 giờ. Customer xem hồ sơ mình và Staff phụ trách; Staff chỉ xem Customer được phân công. Các trường chưa có dữ liệu hiển thị Chưa có thông tin.

### 7.4. Máy từng dùng bootstrap cũ

Máy clone mới không cần file legacy. Nếu đã dùng bản sinh password ngẫu nhiên cũ, bootstrap:dev có thể kiểm .local/dev/dev-accounts.json để nâng fixture còn dùng đúng password ban đầu sang password chung. Password người dùng đã tự đổi được giữ nguyên; không tự xóa file legacy/credential hoặc DB volumes để khắc phục login.

<a id="database"></a>
## 8. Xem database và quản lý dữ liệu

### 8.1. DbGate

Mở http://127.0.0.1:5050, kết nối Life Insurance Local đã được cấu hình sẵn với database life_insurance. Chọn schema business hoặc rag và bấm bảng để xem cột/dữ liệu dạng lưới. Có thể bỏ qua hỏi analytics nếu xuất hiện. Không cần nhập password DB; role db_viewer chỉ SELECT.

Có 17 bảng ứng dụng. DbGate có thể hiển thị thêm _prisma_migrations, thành 18 bảng; đây là metadata migration, viewer không đọc/sửa được nội dung. Nhiều bảng nghiệp vụ chưa có seed nên vẫn trống. **5432 là giao thức PostgreSQL, không mở bằng trình duyệt.** Thêm/sửa tài khoản và phân công thực hiện trong tool admin.

~~~powershell
npm run db:ui
~~~

Lệnh tiện ích trên bật full stack và mở DbGate; nếu chỉ muốn chuẩn bị DB/UI cho dev npm thì dùng dev:setup.

### 8.2. Dữ liệu nằm ở đâu?

| Nơi lưu | Nội dung |
| --- | --- |
| Named volume life-insurance-local-postgres-data | Database, tài khoản, hồ sơ, phân công, audit/session |
| Các volume life-insurance-local-credential-* | Credential DB từng role, giữ lại để dùng đúng DB cũ |
| Volume life-insurance-local-database-ui-data | Cấu hình/dữ liệu làm việc của DbGate |
| .local/dev | Cấu hình host DB, operator và file local riêng tư |

Giữ các volume và file riêng tư khi cần tiếp tục dùng dữ liệu cũ. Không chia sẻ .local qua Git. Down/up hoặc thay container giữ dữ liệu; down -v hay xóa volume trong Docker Desktop có thể làm mất dữ liệu và credential tương ứng.

### 8.3. Schema/migration cho người sửa backend

Source model ở [schema.prisma](../apps/core/prisma/schema.prisma), SQL migrations trong [apps/core/prisma/migrations](../apps/core/prisma/migrations). Schema gồm business/rag; tạo bảng không đồng nghĩa đã có API nghiệp vụ.

~~~powershell
npm run db:validate --workspace @life-insurance/core
npm run db:generate --workspace @life-insurance/core
~~~

Generate chỉ tạo Prisma Client, không tự sửa DB. Thay schema phải tạo migration mới và giữ CHECK/partial indexes; không sửa migration đã apply, không dùng db push/migrate reset trên DB cần giữ. Compose dùng role migration riêng.

<a id="commands"></a>
## 9. Cập nhật source, kiểm tra và dừng dự án

### 9.1. Khi nhận code mới

Chỉ pull khi các thay đổi local đã được xử lý theo quy trình Git của nhóm.

| Cách chạy | Việc cần làm |
| --- | --- |
| Full Docker | Chạy lại docker compose up -d --build --wait |
| Npm dev | npm ci nếu lockfile đổi; npm run dev:db; watch tự cập nhật các lần sửa source tiếp theo |
| Tool admin | Dừng terminal tool rồi chạy npm run admin để build phiên bản mới |

Dự án dùng một package-lock.json root. Giữ lockfile trong repo; không sửa dependencies/lockfile riêng từng app hoặc xóa để xử lý lỗi thông thường.

### 9.2. Lệnh kiểm tra

~~~powershell
npm run local:check
npm run lint
npm run typecheck
npm run build
npm run build:admin --workspace @life-insurance/core
~~~

Các test có database dùng fixtures synthetic riêng và dọn sau test:

~~~powershell
npm run test:accounts
npm run test:auth
npm run test:customers
npm run test:admin
npm run test:http --workspace @life-insurance/core
~~~

Test:admin cần cổng 4101 trống. Các helper test có DB tự chuẩn bị stack local; không chạy khi NODE_ENV=production. Test HTTP foundation dùng server tạm, không cần DB. Chỉ chạy check:connection khi FE/BE npm đang bật.

### 9.3. Dừng đúng cách

- FE/BE npm và tool admin: Ctrl+C tại terminal tương ứng.
- Dừng Web/Core/gateway Docker nhưng vẫn giữ DB/UI: `docker compose stop gateway web core`.
- Dừng toàn bộ container, giữ volumes: `docker compose down` hoặc `npm run local:down`.
- Xem trạng thái: `docker compose ps --all` hoặc `npm run db:status`.

Dọn node_modules/.next/dist chỉ ảnh hưởng dependency/build host và sẽ cần cài/build lại; không coi .local/DB volumes là cache để xóa.

<a id="troubleshooting"></a>
## 10. Xử lý lỗi thường gặp

| Hiện tượng | Cách kiểm tra/xử lý |
| --- | --- |
| Docker command failed / daemon chưa chạy | Bật Docker Desktop Linux containers; docker info; helper yêu cầu Docker context local |
| Port is already allocated / EADDRINUSE | Dừng process trùng hoặc đổi cổng Docker trong .env root; app npm/4100 kiểm tra process đang giữ cổng |
| Có container Exited (0) | Bình thường với prepare/bootstrap/migrate/seed-dev; xem mục 3.3 |
| Liveness 200 nhưng readiness 503 | Core còn sống nhưng DB/schema chưa sẵn sàng hoặc chưa có credential; npm mode dùng dev:db, Docker xem logs postgres/migrate/core |
| Sửa code nhưng website không đổi | Npm dev mở cổng 3000; gateway 8080 vẫn là bản container. Full Docker cần --build |
| Login 401 | Dùng email đúng cổng Staff/Customer; password có thể đã đổi, account khóa hoặc phiên hết hạn. Password mẫu chỉ là ban đầu |
| Login/API 403 | Dùng đúng Host/Origin, cookie/CSRF; tải lại trang. Không dùng wildcard CORS hoặc bỏ CSRF để xử lý |
| Swagger host 4000 gọi POST bị 403 | Thêm origin Swagger host vào CORS_ORIGINS của Core npm rồi restart, giữ origin FE 3000. Full Docker đã cho phép origin Swagger 8081; xem mục 6.4 |
| Không mở được Swagger 8081 | Chạy docker compose up -d --build --wait; kiểm tra gateway/core và SWAGGER_PORT trong .env root. Swagger 8081 phục vụ backend Docker, Swagger 4000 phục vụ backend npm |
| API 429 | Đợi giới hạn tạm hết; app login 10 request/15 phút/email, 5 password sai tạm khóa 15 phút; operator login 10/15 phút, mutation 60/phút/session |
| Tool 409 | Dữ liệu/version đã đổi, email trùng hoặc request đã thực hiện. Xem dữ liệu vừa tải lại rồi xác nhận lại nếu cần; password cũ không được phát lại |
| Conflicting PGHOST/PGUSER/DATABASE_PASSWORD_FILE | Không ghi đè mù quáng; bỏ override tự đặt hoặc đồng bộ theo .local/dev/core.env rồi chạy dev:db |
| Prisma Client chưa có | npm run db:generate --workspace @life-insurance/core; không sửa generated code |
| Mở 5432 trên browser không thấy gì | Dùng DbGate 5050; 5432 không phải HTTP |
| DbGate bảng trống hoặc hiện 18 bảng | Chưa có dữ liệu nghiệp vụ hoặc đang tính cả metadata; xem mục 8.1 |
| Không vào được tool 4100 | npm ci rồi npm run admin; kiểm tra terminal và port; operator dùng credential riêng trong file private |

Khi chia sẻ lỗi, ưu tiên request ID, mã HTTP và log ngắn đã kiểm tra; không gửi password/token/cookie, DB URL có credential hoặc file .local. Dùng thống nhất localhost/127.0.0.1 trong một luồng đăng nhập để cookie đúng host.

<a id="project-layout"></a>
## 11. Cấu trúc và tài liệu kỹ thuật

~~~text
apps/web/       Next.js Customer/Staff UI
apps/core/      NestJS, Prisma, business services và admin entrypoint/UI riêng
apps/agent/     Placeholder cho Agent; chưa triển khai
scripts/        Lệnh điều phối local/kiểm tra
infra/local/    Cấu hình Nginx
compose.yaml    Stack Docker local
.local/         Dữ liệu/credential local, bị Git ignore
docs/           Hướng dẫn sử dụng, kiến trúc và nguồn đặc tả
~~~

Core tổ chức theo tính năng `auth/`, `customers/`, `accounts/`, `admin/`; controller, DTO và service được đặt trong thư mục con riêng. Các file `*.module.ts` ghép dependency bằng NestJS; public `AppModule` tách khỏi `AdminModule` của tool local. Model ORM định nghĩa ở `apps/core/prisma/schema.prisma`; fixtures dev ở `apps/core/src/cli/`. Xem [cấu trúc Core](../apps/core/README.md).

Tài liệu này là đầu mối duy nhất về setup/vận hành local cho thành viên mới. Những tài liệu còn lại phục vụ thiết kế và đối chiếu đặc tả:

- [Kiến trúc và các quyết định local đang áp dụng](architecture.md).
- [Đặc tả Data Model](specifications/Data_Model.md) và các đặc tả khác trong [docs/specifications](specifications).
- [Nguồn và các quyết định còn mở](source-review.md).
- [Quy tắc cấu hình và dữ liệu](configuration-and-data.md).
- [Quyết định tổ chức repo ban đầu](adr/0001-repository-layout.md).

Chỉ dùng hồ sơ/hợp đồng sinh hoàn toàn giả lập. Core sở hữu danh tính, phân quyền và nghiệp vụ; Agent tương lai gọi Business API, không truy cập trực tiếp business DB. Model/embedding/checkpoint/queue/hosting cloud còn phải được chốt riêng khi triển khai.
