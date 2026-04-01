#!/bin/bash
# ─────────────────────────────────────────────
# 52surge (OURTLE) 배포 스크립트
# 사용법: bash ~/Desktop/터미널/deploy-52surge.sh
# ─────────────────────────────────────────────

set -e

PROJECT_DIR="$HOME/Desktop/터미널/52surge program"
EC2_HOST="ubuntu@3.37.194.236"
EC2_KEY="$HOME/Desktop/터미널/52surge program/52surge-key.pem"
EC2_WEB="/home/ubuntu/unimind-web"
EC2_BACKEND="/home/ubuntu/52surge-backend"

echo ""
echo "=============================="
echo "  OURTLE 배포 시작"
echo "=============================="
echo ""

# ── 0. 배포 범위 선택 ──
echo "배포 대상을 선택하세요:"
echo "  1) 프론트엔드만 (Next.js)"
echo "  2) 백엔드만 (Python scanner)"
echo "  3) 전체 (프론트 + 백엔드)"
read -p "선택 [1/2/3]: " DEPLOY_TARGET

case "$DEPLOY_TARGET" in
  1) DO_FRONT=true;  DO_BACK=false ;;
  2) DO_FRONT=false; DO_BACK=true  ;;
  3) DO_FRONT=true;  DO_BACK=true  ;;
  *) echo "❌ 잘못된 선택입니다. 종료합니다."; exit 1 ;;
esac

# ── 1. 커밋 메시지 입력 ──
if [ "$DO_FRONT" = true ]; then
  read -p "커밋 메시지를 입력하세요: " COMMIT_MSG
  if [ -z "$COMMIT_MSG" ]; then
    echo "❌ 커밋 메시지가 비어있습니다. 종료합니다."
    exit 1
  fi
fi

# ── 2. 프론트엔드: 로컬 Git push ──
if [ "$DO_FRONT" = true ]; then
  echo ""
  echo "📦 [프론트] 로컬 Git push..."
  cd "$PROJECT_DIR"
  git add -A
  git commit -m "$COMMIT_MSG"
  git push
  echo "✅ Push 완료"
fi

# ── 3. 백엔드: SCP 파일 전송 ──
if [ "$DO_BACK" = true ]; then
  echo ""
  echo "📤 [백엔드] 파일 전송 중..."
  scp -i "$EC2_KEY" "$PROJECT_DIR/auto_scheduler.py" "$EC2_HOST:$EC2_BACKEND/auto_scheduler.py"
  scp -i "$EC2_KEY" "$PROJECT_DIR/scanner.py" "$EC2_HOST:$EC2_BACKEND/scanner.py"
  echo "✅ 백엔드 파일 전송 완료"
fi

# ── 4. EC2 배포 ──
echo ""
echo "🚀 EC2 배포 중..."

if [ "$DO_FRONT" = true ] && [ "$DO_BACK" = true ]; then
  # 전체 배포
  ssh -i "$EC2_KEY" "$EC2_HOST" << 'EOF'
    echo "── 프론트엔드 ──"
    cd /home/ubuntu/unimind-web
    echo "📥 git pull..."
    git pull
    echo "🔨 npm run build..."
    npm run build
    echo "♻️  pm2 restart..."
    pm2 restart unimind-web

    echo ""
    echo "── 백엔드 ──"
    echo "♻️  telegram-bot 재시작..."
    sudo systemctl restart telegram-bot.service
    sleep 2
    sudo systemctl status telegram-bot.service --no-pager
    echo "✅ 전체 배포 완료!"
EOF

elif [ "$DO_FRONT" = true ]; then
  # 프론트만
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

elif [ "$DO_BACK" = true ]; then
  # 백엔드만
  ssh -i "$EC2_KEY" "$EC2_HOST" << 'EOF'
    echo "♻️  telegram-bot 재시작..."
    sudo systemctl restart telegram-bot.service
    sleep 2
    sudo systemctl status telegram-bot.service --no-pager
    echo "✅ 백엔드 배포 완료!"
EOF
fi

# ── 5. 완료 ──
echo ""
echo "=============================="
echo "  🎉 배포 완료!"
echo "  https://ourtle.com"
echo "=============================="
echo ""
