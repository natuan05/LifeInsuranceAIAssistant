# Hướng dẫn Deploy lên AWS EC2 — Hướng A

Tài liệu hướng dẫn triển khai ứng dụng lên máy ảo AWS EC2 phục vụ bài tập môn Cloud Computing / DevOps.

> **Mục tiêu:** Đưa toàn bộ stack đang chạy local lên một EC2 instance trên AWS để giảng viên và thành viên khác có thể truy cập qua Internet.
> **Phạm vi:** EC2 + Docker Compose + S3 (minh họa cloud storage) + GitHub Actions CI/CD.
> **Nguyên tắc:** Giữ nguyên toàn bộ mã nguồn ứng dụng (Web, Core, Nginx, PostgreSQL). Không làm ảnh hưởng môi trường chạy local của team.

---

## 1. Giải thích về cổng mạng: `127.0.0.1` vs `0.0.0.0`

Trước khi bắt đầu, làm rõ cơ chế mạng để an tâm:

- **`127.0.0.1` (Loopback / Localhost):** Chỉ cho phép chính máy chủ đó tự gọi nó. Người ngoài (dù cùng mạng LAN hay qua Internet) đều **không thể** truy cập.
- **`0.0.0.0` (All interfaces):** Cho phép dịch vụ lắng nghe trên **mọi card mạng** của máy, bao gồm cả loopback (`127.0.0.1`), IP mạng LAN (`192.168.x.x`), và IP Public trên cloud.

> **Quan trọng:** Nếu đổi sang `0.0.0.0`, **máy local vẫn truy cập vào `http://localhost:8080` hoàn toàn bình thường 100%!** 
> Sở dĩ local trước đây cấu hình `127.0.0.1` là để an toàn hơn (tránh người khác trong cùng quán cà phê hay mạng Wi-Fi quét thấy cổng).
> 
> **Cách làm chuẩn nhất (không cần sửa code của team):**
> Ta dùng biến `${BIND_ADDRESS:-127.0.0.1}` trong `compose.yaml`:
> - Máy của team dev (không cấu hình gì): Tự động lấy `127.0.0.1`.
> - Máy chủ EC2: Trong file `.env` đặt `BIND_ADDRESS=0.0.0.0` để mở ra ngoài Internet.

---

## 2. Tổng quan luồng triển khai

```
Máy local  ──git push──▶  GitHub Repo  ──GitHub Actions (SSH)──▶  AWS EC2
                                                                      │
                                                           ┌──────────┴──────────┐
                                                           │  Docker Compose      │
                                                           │  Web · Core · Nginx  │
                                                           │  PostgreSQL · DbGate │
                                                           └──────────┬──────────┘
                                                                      │ (minh họa đọc PDF)
                                                                   Amazon S3
```

---

## 3. Các bước chuẩn bị trên AWS Console

### Bước 3.1: Tạo tài khoản AWS & IAM User
1. Đăng ký tài khoản AWS (gói Free Tier miễn phí 12 tháng).
2. Tạo IAM User riêng thay vì dùng root account:
   - AWS Console → **IAM** → **Users** → **Create user** (ví dụ: `life-insurance-dev`).
   - Gán quyền: `AmazonEC2FullAccess`, `AmazonS3FullAccess`.
   - Vào tab **Security credentials** → **Create access key** (dùng khi cần thao tác qua AWS CLI).

### Bước 3.2: Tạo Key Pair để SSH
1. AWS Console → **EC2** → **Key Pairs** → **Create key pair**.
2. **Name:** `life-insurance-key`.
3. **Format:** `.pem` (dùng cho OpenSSH trên PowerShell/Linux/macOS).
4. Lưu file `.pem` về máy cẩn thận.

### Bước 3.3: Tạo S3 Bucket (minh họa Cloud Storage)
1. AWS Console → **S3** → **Create bucket**.
2. **Bucket name:** `life-insurance-documents-<tên-nhóm>` (ví dụ: `life-insurance-documents-nhom5`).
3. **AWS Region:** `ap-southeast-1` (Singapore).
4. Giữ nguyên **Block all public access** (bảo mật, chỉ đọc qua ký URL / IAM).
5. Nhấn **Create bucket**.

### Bước 3.4: Tạo IAM Role cho EC2
Giúp EC2 tự động có quyền thao tác với S3 mà không cần lưu cứng Access Key vào code:
1. AWS Console → **IAM** → **Roles** → **Create role**.
2. Chọn **AWS service** → **EC2**.
3. Chọn policy: `AmazonS3FullAccess`.
4. Đặt tên role: `ec2-life-insurance-role` → **Create role**.

---

## 4. Khởi tạo EC2 Instance

1. AWS Console → **EC2** → **Launch an instance**.
2. **Name:** `life-insurance-server`.
3. **Application and OS Images:** `Ubuntu Server 24.04 LTS`.
4. **Instance type:**
   - Khuyên dùng: `t3.medium` (2 vCPU, 4GB RAM) để việc build Docker images từ source không bị tràn RAM.
   - Nếu dùng `t2.micro` (Free Tier, 1GB RAM): Bắt buộc phải tạo thêm swapfile 2GB–4GB trên server trước khi build.
5. **Key pair:** Chọn `life-insurance-key` đã tạo ở bước 3.2.
6. **Network settings:** Tạo Security Group mở các cổng sau:
   - **Port 22 (SSH):** Source: `My IP` (bảo mật, chỉ IP máy bạn SSH được).
   - **Port 8080 (Custom TCP):** Source: `0.0.0.0/0` (cổng Gateway chính cho Web và API).
   - **Port 8081 (Custom TCP):** Source: `My IP` hoặc `0.0.0.0/0` (Swagger docs).
   - **Port 5050 (Custom TCP):** Source: `My IP` (DbGate quản trị DB).
7. **Configure storage:** Tối thiểu **20 GiB** gp3.
8. **Advanced details:** Phần **IAM instance profile**, chọn `ec2-life-insurance-role`.
9. Nhấn **Launch instance** và chờ EC2 chuyển sang trạng thái `Running`.
10. Ghi lại **Public IPv4 address** (ví dụ: `54.123.45.67`).

---

## 5. Cài đặt Docker trên EC2

### Bước 5.1: SSH vào EC2

**Trên Windows (PowerShell):**
```powershell
# Phân quyền cho file key (chỉ tài khoản hiện tại được đọc)
icacls "C:\duong_dan\life-insurance-key.pem" /inheritance:r /grant:r "$($env:USERNAME):(R)"

# SSH vào máy ảo
ssh -i "C:\duong_dan\life-insurance-key.pem" ubuntu@54.123.45.67
```

### Bước 5.2: Cài đặt Docker Engine & Docker Compose v2

Chạy script tự động trên EC2:
```bash
sudo apt-get update
sudo apt-get install -y ca-certificates curl gnupg git

# Cài khóa GPG của Docker
sudo install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg
sudo chmod a+r /etc/apt/keyrings/docker.gpg

# Thêm apt repository của Docker
echo \
  "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] \
  https://download.docker.com/linux/ubuntu \
  $(. /etc/os-release && echo "$VERSION_CODENAME") stable" | \
  sudo tee /etc/apt/sources.list.d/docker.list > /dev/null

# Cài Docker và Compose
sudo apt-get update
sudo apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin

# Cấp quyền cho user ubuntu chạy docker không cần gõ sudo
sudo usermod -aG docker ubuntu

# Nếu dùng instance 1GB-2GB RAM, tạo thêm Swap để tránh lỗi out-of-memory khi build:
sudo fallocate -l 3G /swapfile
sudo chmod 600 /swapfile
sudo mkswap /swapfile
sudo swapon /swapfile
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab

# Thoát ra và SSH lại để áp dụng group docker
exit
```

Sau khi SSH lại, gõ kiểm tra:
```bash
docker --version
docker compose version
```

---

## 6. Cấu hình ứng dụng linh hoạt (`compose.yaml` & `.env`)

### Cấu hình biến `BIND_ADDRESS` trong `compose.yaml`

Trong file `compose.yaml`, cập nhật cấu hình cổng của `gateway`:

```yaml
  gateway:
    image: nginx:1.29-alpine@sha256:5616878291a2eed594aee8db4dade5878cf7edcb475e59193904b198d9b830de
    ports:
      - "${BIND_ADDRESS:-127.0.0.1}:${GATEWAY_PORT:-8080}:80"
      - "${BIND_ADDRESS:-127.0.0.1}:${SWAGGER_PORT:-8081}:81"
```

- **Trên máy local:** `BIND_ADDRESS` mặc định là `127.0.0.1` (giữ nguyên cách chạy cũ).
- **Trên EC2:** Khai báo `BIND_ADDRESS=0.0.0.0` trong file `.env`.

---

## 7. Triển khai ứng dụng trên EC2

### Bước 7.1: Clone repo về EC2
```bash
git clone https://github.com/<your-org-or-username>/<your-repo>.git
cd LifeInsuranceAIAssistant
```

### Bước 7.2: Tạo file `.env` trên EC2
```bash
cp .env.example .env
nano .env
```

Điền hoặc chỉnh sửa các biến tương ứng cho môi trường EC2:
```ini
# Cho phép mở ra ngoài Internet
BIND_ADDRESS=0.0.0.0

# CORS cho phép gọi từ IP public của EC2
CORE_CORS_ORIGINS=http://54.123.45.67:8080,http://54.123.45.67:8081

# Mật khẩu mạnh riêng cho môi trường server
DB_BOOTSTRAP_PASSWORD=EC2DbOwnerSecurePass-2026!
DB_MIGRATION_PASSWORD=EC2DbMigrateSecurePass-2026!
DB_CORE_PASSWORD=EC2DbCoreSecurePass-2026!
DB_ADMIN_PASSWORD=EC2DbAdminSecurePass-2026!
DB_VIEWER_PASSWORD=EC2DbViewerSecurePass-2026!

MINIO_ROOT_USER=ec2-storage-admin
MINIO_ROOT_PASSWORD=EC2MinioAdminSecurePass-2026!
MINIO_READER_ACCESS_KEY=ec2-reader
MINIO_READER_SECRET_KEY=EC2MinioReaderSecurePass-2026!
MINIO_WRITER_ACCESS_KEY=ec2-writer
MINIO_WRITER_SECRET_KEY=EC2MinioWriterSecurePass-2026!
```

Nhấn `Ctrl + O` → `Enter` để lưu, `Ctrl + X` để thoát.

### Bước 7.3: Khởi động hệ thống
```bash
docker compose up -d --build --wait
```

Kiểm tra trạng thái các service:
```bash
docker compose ps --all
```
Các service chính (`gateway`, `core`, `web`, `postgres`, `minio`, `database-ui`) phải hiển thị `running (healthy)`.

---

## 8. Kiểm thử hệ thống

Mở trình duyệt trên máy cá nhân, truy cập IP EC2:

| Đường dẫn | Chức năng |
|---|---|
| `http://54.123.45.67:8080/staff/login` | Cổng đăng nhập cho nhân viên |
| `http://54.123.45.67:8080/login` | Cổng đăng nhập cho khách hàng |
| `http://54.123.45.67:8081` | Tài liệu Swagger API |
| `http://54.123.45.67:5050` | Giao diện DbGate xem dữ liệu PostgreSQL |

**Tài khoản thử nghiệm mặc định (tạo từ seed-dev):**
- **Staff:** `staff.a@dev.example.invalid` / `DevLocal-2026!`
- **Customer:** `customer.a@dev.example.invalid` / `DevLocal-2026!`

---

## 9. Tự động hóa CI/CD với GitHub Actions

Mỗi khi thành viên merge code vào nhánh `main`, GitHub Actions sẽ tự động SSH vào EC2 để cập nhật code mới nhất.

### Bước 9.1: Cấu hình GitHub Secrets
Trên repo GitHub:
1. Vào **Settings** → **Secrets and variables** → **Actions** → **New repository secret**.
2. Thêm 3 secrets:
   - `EC2_HOST`: IP public của EC2 (`54.123.45.67`).
   - `EC2_USER`: `ubuntu`.
   - `EC2_SSH_KEY`: Toàn bộ nội dung file `.pem` (mở bằng Notepad và copy toàn bộ kể cả `-----BEGIN ...`).

### Bước 9.2: Tạo file Workflow `.github/workflows/deploy.yml`

```yaml
name: Deploy to EC2

on:
  push:
    branches: [ main ]

jobs:
  deploy:
    name: SSH and update Docker Compose
    runs-on: ubuntu-latest

    steps:
      - name: Execute remote commands via SSH
        uses: appleboy/ssh-action@v1.0.3
        with:
          host: ${{ secrets.EC2_HOST }}
          username: ${{ secrets.EC2_USER }}
          key: ${{ secrets.EC2_SSH_KEY }}
          script: |
            cd LifeInsuranceAIAssistant
            git pull origin main
            docker compose up -d --build --wait
            echo "--- Danh sách container sau cập nhật ---"
            docker compose ps --all
```

---

## 10. Checklist nghiệm thu

- [ ] EC2 đang ở trạng thái `Running` trên AWS Console.
- [ ] Security Group đã mở port `8080` (public), `22` (SSH restricted).
- [ ] Docker Compose chạy thành công tất cả services (`core`, `web`, `gateway` đều healthy).
- [ ] Truy cập được trang đăng nhập Staff qua IP Public của EC2.
- [ ] Push commit lên nhánh `main` và kiểm tra GitHub Actions chạy deploy thành công.
