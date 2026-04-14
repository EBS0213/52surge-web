#!/bin/bash
# 로컬 Mac에서 EC2로 원클릭 배포
# 사용법: ./deploy-ec2.sh "커밋 메시지"
#   메시지 생략 시: 타임스탬프로 자동 커밋

set -e

# ===== 설정 =====
PROJECT_DIR="/Users/junsungkim/Desktop/터미널/52surge program"
EC2_HOST="ubuntu@3.37.194.236"
EC2_KEY="/Users/junsungkim/Desktop/터미널/52surge program/52surge-key.pem"
EC2_PROJECT="~/52surge-web"
PM2_APP="unimind-web"
# ================

COMMIT_MSG="${1:-chore: deploy $(date '+%Y-%m-%d %H:%M')}"

echo "▶ 로컬 프로젝트: $PROJECT_DIR"
cd "$PROJECT_DIR"

if [[ -n $(git status --porcelain) ]]; then
  echo "▶ 변경사항 커밋: $COMMIT_MSG"
  git add -A
  git commit -m "$COMMIT_MSG"
else
  echo "▶ 로컬 변경사항 없음"
fi

echo "▶ GitHub 푸시"
git push

echo "▶ EC2 배포: $EC2_HOST"
ssh -i "$EC2_KEY" -o StrictHostKeyChecking=accept-new "$EC2_HOST" bash <<EOF
  set -e
  cd $EC2_PROJECT
  echo "  ▶ 로컬 변경 초기화 (원격 기준으로 정렬)"
  git fetch origin
  git reset --hard origin/main
  git clean -fd
  echo "  ▶ git pull"
  git pull
  echo "  ▶ npm install"
  npm install --no-audit --no-fund
  echo "  ▶ npm run build"
  npm run build
  echo "  ▶ pm2 restart $PM2_APP"
  pm2 restart $PM2_APP
  pm2 list
EOF

echo "✓ 배포 완료"
