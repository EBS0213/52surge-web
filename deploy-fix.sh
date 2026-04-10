#!/bin/bash
# Clean deploy via scp — no heredoc, no escaping issues
# Copies local files directly to EC2

KEY="./52surge-key.pem"
HOST="ubuntu@3.37.194.236"
REMOTE="unimind-web"

echo "=== [0/7] Fixing SESSION_SECRET ==="
ssh -i "$KEY" "$HOST" "cd $REMOTE && if grep -q '여기에_1번에서_복사한값' .env.local; then SECRET=\$(openssl rand -base64 32) && sed -i \"s|여기에_1번에서_복사한값|\$SECRET|\" .env.local && echo 'SESSION_SECRET updated'; else echo 'SESSION_SECRET already set'; fi"

echo ""
echo "=== [1/7] Creating directories on EC2 ==="
ssh -i "$KEY" "$HOST" "mkdir -p $REMOTE/app/login $REMOTE/app/components $REMOTE/app/hooks $REMOTE/app/api/trades $REMOTE/app/lib $REMOTE/app/watchlist"

echo ""
echo "=== [2/7] Uploading AuthButton.tsx ==="
scp -i "$KEY" app/components/AuthButton.tsx "$HOST:$REMOTE/app/components/AuthButton.tsx"

echo ""
echo "=== [3/7] Uploading login/page.tsx ==="
scp -i "$KEY" app/login/page.tsx "$HOST:$REMOTE/app/login/page.tsx"

echo ""
echo "=== [4/7] Uploading trades/page.tsx (clean, with AuthButton) ==="
scp -i "$KEY" app/trades/page.tsx "$HOST:$REMOTE/app/trades/page.tsx"

echo ""
echo "=== [5/7] Uploading watchlist/page.tsx (with AuthButton) ==="
scp -i "$KEY" app/watchlist/page.tsx "$HOST:$REMOTE/app/watchlist/page.tsx"

echo ""
echo "=== [6/7] Uploading trades/route.ts (per-user storage) ==="
scp -i "$KEY" app/api/trades/route.ts "$HOST:$REMOTE/app/api/trades/route.ts"

echo ""
echo "=== [7/7] Uploading useWatchlist.ts (client-only settings) ==="
scp -i "$KEY" app/hooks/useWatchlist.ts "$HOST:$REMOTE/app/hooks/useWatchlist.ts"

echo ""
echo "=== Building & restarting ==="
ssh -i "$KEY" "$HOST" "cd $REMOTE && npm run build && pm2 restart unimind-web"
echo "=== DONE ==="
