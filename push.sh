#!/bin/bash
# ─────────────────────────────────────────────
# OURTLE 간편 배포: push → EC2 pull/build/restart
# 사용법: 52surge program 폴더에서 bash push.sh
# ─────────────────────────────────────────────

set -e

EC2_HOST="ubuntu@13.124.156.73"
EC2_KEY="$HOME/Desktop/터미널/T 울산스터디/52surge-key.pem"
EC2_PROJECT="/home/ubuntu/unimind-web"

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
echo "📦 [1/2] 로컬 Git push..."
git add -A
git commit -m "$COMMIT_MSG"
git push

echo "✅ Push 완료"

# ── 3. EC2 배포 ──
echo ""
echo "🚀 [2/2] EC2 배포 중..."
ssh -i "$EC2_KEY" "$EC2_HOST" << EOF
  cd $EC2_PROJECT
  echo "📥 git pull..."
  git pull
  echo "🔨 npm run build..."
  npm run build
  echo "♻️  pm2 restart..."
  pm2 restart unimind-web
  echo "✅ 배포 완료!"
EOF

echo ""
echo "=============================="
echo "  🎉 배포 완료!"
echo "  https://52surge.com"
echo "=============================="
echo ""
