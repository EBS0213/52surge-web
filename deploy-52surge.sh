#!/bin/bash
# ─────────────────────────────────────────────
# 52surge (OURTLE) 배포 스크립트 — 프론트엔드 전용
# 사용법: bash ~/Desktop/터미널/deploy-52surge.sh
# ─────────────────────────────────────────────

set -e

PROJECT_DIR="$HOME/Desktop/터미널/52surge program"
EC2_HOST="ubuntu@3.37.194.236"
EC2_KEY="$HOME/Desktop/터미널/52surge program/52surge-key.pem"
EC2_WEB="/home/ubuntu/unimind-web"

echo ""
echo "=============================="
echo "  OURTLE 배포 시작"
echo "=============================="
echo ""

# ── 1. 커밋 메시지 입력 ──
read -p "커밋 메시지를 입력하세요: " COMMIT_MSG
if [ -z "$COMMIT_MSG" ]; then
  echo "❌ 커밋 메시지가 비어있습니다. 종료합니다."
  exit 1
fi

# ── 2. 로컬 Git push ──
echo ""
echo "📦 로컬 Git push..."
cd "$PROJECT_DIR"
git add -A
git commit -m "$COMMIT_MSG"
git push
echo "✅ Push 완료"

# ── 3. EC2 배포 ──
echo ""
echo "🚀 EC2 배포 중..."
ssh -i "$EC2_KEY" "$EC2_HOST" << 'EOF'
  cd /home/ubuntu/unimind-web
  echo "📥 git pull..."
  git pull
  echo "🔨 npm run build..."
  npm run build
  echo "♻️  pm2 restart..."
  pm2 restart unimind-web
  echo "✅ 프론트엔드 배포 완료!"
EOF

# ── 4. 완료 ──
echo ""
echo "=============================="
echo "  🎉 배포 완료!"
echo "  https://ourtle.com"
echo "=============================="
echo ""
