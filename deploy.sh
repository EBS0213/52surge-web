#!/bin/bash
# ============================================
# 52surge.com EC2 배포 스크립트
# ============================================
# 사용법:
#   1. EC2에 SSH 접속: ssh -i your-key.pem ubuntu@your-ec2-ip
#   2. 이 스크립트를 EC2에 업로드하고 실행
#   3. 또는 로컬에서: ssh -i your-key.pem ubuntu@your-ec2-ip 'bash -s' < deploy.sh
#
# 사전 요구사항:
#   - Ubuntu 22.04+ EC2 인스턴스
#   - 보안 그룹: 80(HTTP), 443(HTTPS), 22(SSH) 포트 오픈
#   - 52surge.com DNS A 레코드 → EC2 퍼블릭 IP
# ============================================

set -e

echo "=== 1. 시스템 업데이트 ==="
sudo apt update && sudo apt upgrade -y

echo "=== 2. Node.js 20 LTS 설치 ==="
if ! command -v node &> /dev/null; then
  curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
  sudo apt install -y nodejs
fi
echo "Node: $(node -v), npm: $(npm -v)"

echo "=== 3. PM2 설치 (프로세스 매니저) ==="
sudo npm install -g pm2

echo "=== 4. Nginx 설치 (리버스 프록시 + SSL) ==="
sudo apt install -y nginx
sudo systemctl enable nginx

echo "=== 5. Certbot 설치 (Let's Encrypt SSL) ==="
sudo apt install -y certbot python3-certbot-nginx

echo "=== 6. 프로젝트 클론/업데이트 ==="
APP_DIR="/home/ubuntu/unimind-web"
if [ -d "$APP_DIR" ]; then
  cd "$APP_DIR"
  git pull origin main
else
  git clone https://github.com/YOUR_GITHUB_USERNAME/unimind-web.git "$APP_DIR"
  cd "$APP_DIR"
fi

echo "=== 7. 의존성 설치 & 빌드 ==="
npm ci --production=false
npm run build

echo "=== 8. .env.local 확인 ==="
if [ ! -f .env.local ]; then
  echo "⚠️  .env.local 파일이 없습니다. 수동으로 생성하세요:"
  echo "  nano $APP_DIR/.env.local"
  echo ""
  echo "  내용:"
  echo "  BACKEND_API_URL=http://13.124.156.73:8000"
  echo "  KIS_APP_KEY=your_key"
  echo "  KIS_APP_SECRET=your_secret"
  echo "  KIS_BASE_URL=https://openapi.koreainvestment.com:9443"
fi

echo "=== 9. PM2로 Next.js 실행 ==="
pm2 delete unimind-web 2>/dev/null || true
pm2 start npm --name "unimind-web" -- start
pm2 save
pm2 startup

echo "=== 10. Nginx 설정 ==="
sudo tee /etc/nginx/sites-available/52surge.com > /dev/null <<'NGINX'
server {
    listen 80;
    server_name 52surge.com www.52surge.com;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
        proxy_read_timeout 60s;
        proxy_buffering on;
        proxy_buffer_size 128k;
        proxy_buffers 4 256k;
    }

    # 정적 파일 캐싱
    location /_next/static {
        proxy_pass http://127.0.0.1:3000;
        expires 365d;
        add_header Cache-Control "public, immutable";
    }
}
NGINX

sudo ln -sf /etc/nginx/sites-available/52surge.com /etc/nginx/sites-enabled/
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t && sudo systemctl reload nginx

echo "=== 11. SSL 인증서 발급 (Let's Encrypt) ==="
echo "⚠️  DNS가 이미 EC2 IP를 가리키고 있어야 합니다!"
echo "다음 명령을 수동으로 실행하세요:"
echo ""
echo "  sudo certbot --nginx -d 52surge.com -d www.52surge.com"
echo ""

echo "============================================"
echo "✅ 배포 완료!"
echo "  http://52surge.com 에서 확인하세요"
echo "  SSL 설정 후: https://52surge.com"
echo ""
echo "유용한 명령어:"
echo "  pm2 logs unimind-web    # 로그 확인"
echo "  pm2 restart unimind-web # 재시작"
echo "  pm2 monit               # 모니터링"
echo "============================================"
