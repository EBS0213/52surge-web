#!/bin/bash
# Deploy auth system to EC2
# Usage: bash deploy-auth.sh
# Prerequisites: Google/Kakao OAuth credentials configured

KEY="./52surge-key.pem"
HOST="ubuntu@3.37.194.236"
REMOTE="unimind-web"

echo "=== [1/8] Install jose ==="
ssh -i "$KEY" "$HOST" "cd $REMOTE && npm install jose"

echo ""
echo "=== [2/8] Create directories ==="
ssh -i "$KEY" "$HOST" "mkdir -p $REMOTE/app/lib $REMOTE/app/api/auth/google/callback $REMOTE/app/api/auth/kakao/callback $REMOTE/app/api/auth/session $REMOTE/app/api/auth/logout $REMOTE/app/api/auth/settings $REMOTE/.data/users"

echo ""
echo "=== [3/8] Upload app/lib/auth.ts ==="
ssh -i "$KEY" "$HOST" "cat > $REMOTE/app/lib/auth.ts" << 'AUTHFILE'
/**
 * 인증 유틸리티 — jose JWT 기반 세션 관리
 */

import { SignJWT, jwtVerify } from 'jose';
import { cookies } from 'next/headers';

export interface SessionPayload {
  userId: string;
  name: string;
  email: string;
  picture?: string;
  provider: 'google' | 'kakao';
  expiresAt: number;
}

const SESSION_COOKIE = 'ourtle_session';
const SESSION_TTL = 7 * 24 * 60 * 60;

function getSecretKey(): Uint8Array {
  const secret = process.env.SESSION_SECRET;
  if (!secret) throw new Error('SESSION_SECRET 환경변수 필요');
  return new TextEncoder().encode(secret);
}

export async function createSession(payload: Omit<SessionPayload, 'expiresAt'>): Promise<string> {
  const expiresAt = Date.now() + SESSION_TTL * 1000;
  const token = await new SignJWT({ ...payload, expiresAt } as unknown as Record<string, unknown>)
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(`${SESSION_TTL}s`)
    .sign(getSecretKey());
  return token;
}

export async function setSessionCookie(token: string): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: SESSION_TTL,
  });
}

export async function getSession(): Promise<SessionPayload | null> {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get(SESSION_COOKIE)?.value;
    if (!token) return null;

    const { payload } = await jwtVerify(token, getSecretKey(), {
      algorithms: ['HS256'],
    });

    const session = payload as unknown as SessionPayload;
    if (session.expiresAt < Date.now()) return null;
    return session;
  } catch {
    return null;
  }
}

export async function deleteSession(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.delete(SESSION_COOKIE);
}
AUTHFILE

echo ""
echo "=== [4/8] Upload app/lib/user-store.ts ==="
ssh -i "$KEY" "$HOST" "cat > $REMOTE/app/lib/user-store.ts" << 'STOREFILE'
/**
 * 유저별 파일 기반 데이터 저장소
 */

import { readFile, writeFile, mkdir } from 'fs/promises';
import path from 'path';

const DATA_DIR = path.join(process.cwd(), '.data', 'users');

export interface TurtleSettings {
  initialSeed: number;
  riskPerTrade: number;
  system1Period: number;
  system2Period: number;
  atrPeriod: number;
  benchmarkIndex: string;
}

export const DEFAULT_TURTLE_SETTINGS: TurtleSettings = {
  initialSeed: 100_000_000,
  riskPerTrade: 2,
  system1Period: 20,
  system2Period: 55,
  atrPeriod: 20,
  benchmarkIndex: '코스닥',
};

export interface UserProfile {
  userId: string;
  name: string;
  email: string;
  picture?: string;
  provider: 'google' | 'kakao';
  createdAt: string;
  lastLoginAt: string;
}

async function ensureDir(dirPath: string): Promise<void> {
  try { await mkdir(dirPath, { recursive: true }); } catch { /* exists */ }
}

function userDir(userId: string): string {
  const safe = userId.replace(/[^a-zA-Z0-9_-]/g, '_');
  return path.join(DATA_DIR, safe);
}

async function readJSON<T>(filePath: string, fallback: T): Promise<T> {
  try {
    const raw = await readFile(filePath, 'utf-8');
    return JSON.parse(raw) as T;
  } catch { return fallback; }
}

async function writeJSON(filePath: string, data: unknown): Promise<void> {
  const dir = path.dirname(filePath);
  await ensureDir(dir);
  await writeFile(filePath, JSON.stringify(data, null, 2), 'utf-8');
}

export async function getProfile(userId: string): Promise<UserProfile | null> {
  return readJSON<UserProfile | null>(path.join(userDir(userId), 'profile.json'), null);
}

export async function saveProfile(profile: UserProfile): Promise<void> {
  await writeJSON(path.join(userDir(profile.userId), 'profile.json'), profile);
}

export async function getTurtleSettings(userId: string): Promise<TurtleSettings> {
  return readJSON<TurtleSettings>(path.join(userDir(userId), 'settings.json'), DEFAULT_TURTLE_SETTINGS);
}

export async function saveTurtleSettings(userId: string, settings: TurtleSettings): Promise<void> {
  await writeJSON(path.join(userDir(userId), 'settings.json'), settings);
}

export async function getTrades(userId: string): Promise<unknown[]> {
  return readJSON<unknown[]>(path.join(userDir(userId), 'trades.json'), []);
}

export async function saveTrades(userId: string, trades: unknown[]): Promise<void> {
  await writeJSON(path.join(userDir(userId), 'trades.json'), trades);
}
STOREFILE

echo ""
echo "=== [5/8] Upload OAuth routes ==="

# Google OAuth start
ssh -i "$KEY" "$HOST" "cat > $REMOTE/app/api/auth/google/route.ts" << 'EOF'
import { NextResponse } from 'next/server';

export async function GET() {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  if (!clientId) return NextResponse.json({ error: 'GOOGLE_CLIENT_ID not configured' }, { status: 500 });

  const redirectUri = `${process.env.NEXT_PUBLIC_BASE_URL || 'https://ourtle.com'}/api/auth/google/callback`;
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: 'openid email profile',
    access_type: 'offline',
    prompt: 'consent',
  });
  return NextResponse.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`);
}
EOF

# Google OAuth callback
ssh -i "$KEY" "$HOST" "cat > $REMOTE/app/api/auth/google/callback/route.ts" << 'EOF'
import { NextResponse, type NextRequest } from 'next/server';
import { createSession, setSessionCookie } from '../../../../lib/auth';
import { getProfile, saveProfile, type UserProfile } from '../../../../lib/user-store';

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get('code');
  if (!code) return NextResponse.redirect(new URL('/?error=no_code', request.url));

  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'https://ourtle.com';
  const redirectUri = `${baseUrl}/api/auth/google/callback`;

  try {
    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: process.env.GOOGLE_CLIENT_ID || '',
        client_secret: process.env.GOOGLE_CLIENT_SECRET || '',
        redirect_uri: redirectUri,
        grant_type: 'authorization_code',
      }),
    });
    if (!tokenRes.ok) {
      console.error('[auth/google] token exchange failed:', tokenRes.status);
      return NextResponse.redirect(new URL('/?error=token_failed', request.url));
    }
    const tokenData = await tokenRes.json();

    const userRes = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
      headers: { Authorization: `Bearer ${tokenData.access_token}` },
    });
    if (!userRes.ok) return NextResponse.redirect(new URL('/?error=userinfo_failed', request.url));
    const userInfo = await userRes.json();
    const userId = `google_${userInfo.id}`;

    const existing = await getProfile(userId);
    const profile: UserProfile = {
      userId,
      name: userInfo.name || '',
      email: userInfo.email || '',
      picture: userInfo.picture || '',
      provider: 'google',
      createdAt: existing?.createdAt || new Date().toISOString(),
      lastLoginAt: new Date().toISOString(),
    };
    await saveProfile(profile);

    const token = await createSession({ userId, name: profile.name, email: profile.email, picture: profile.picture, provider: 'google' });
    await setSessionCookie(token);

    return NextResponse.redirect(new URL('/', baseUrl));
  } catch (err) {
    console.error('[auth/google] callback error:', err);
    return NextResponse.redirect(new URL('/?error=auth_failed', request.url));
  }
}
EOF

# Kakao OAuth start
ssh -i "$KEY" "$HOST" "cat > $REMOTE/app/api/auth/kakao/route.ts" << 'EOF'
import { NextResponse } from 'next/server';

export async function GET() {
  const clientId = process.env.KAKAO_CLIENT_ID;
  if (!clientId) return NextResponse.json({ error: 'KAKAO_CLIENT_ID not configured' }, { status: 500 });

  const redirectUri = `${process.env.NEXT_PUBLIC_BASE_URL || 'https://ourtle.com'}/api/auth/kakao/callback`;
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
  });
  return NextResponse.redirect(`https://kauth.kakao.com/oauth/authorize?${params.toString()}`);
}
EOF

# Kakao OAuth callback
ssh -i "$KEY" "$HOST" "cat > $REMOTE/app/api/auth/kakao/callback/route.ts" << 'EOF'
import { NextResponse, type NextRequest } from 'next/server';
import { createSession, setSessionCookie } from '../../../../lib/auth';
import { getProfile, saveProfile, type UserProfile } from '../../../../lib/user-store';

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get('code');
  if (!code) return NextResponse.redirect(new URL('/?error=no_code', request.url));

  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'https://ourtle.com';
  const redirectUri = `${baseUrl}/api/auth/kakao/callback`;

  try {
    const tokenRes = await fetch('https://kauth.kakao.com/oauth/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        client_id: process.env.KAKAO_CLIENT_ID || '',
        client_secret: process.env.KAKAO_CLIENT_SECRET || '',
        redirect_uri: redirectUri,
        code,
      }),
    });
    if (!tokenRes.ok) {
      console.error('[auth/kakao] token exchange failed:', tokenRes.status);
      return NextResponse.redirect(new URL('/?error=token_failed', request.url));
    }
    const tokenData = await tokenRes.json();

    const userRes = await fetch('https://kapi.kakao.com/v2/user/me', {
      headers: { Authorization: `Bearer ${tokenData.access_token}` },
    });
    if (!userRes.ok) return NextResponse.redirect(new URL('/?error=userinfo_failed', request.url));
    const userInfo = await userRes.json();
    const kakaoAccount = userInfo.kakao_account || {};
    const kakaoProfile = kakaoAccount.profile || {};
    const userId = `kakao_${userInfo.id}`;

    const existing = await getProfile(userId);
    const profile: UserProfile = {
      userId,
      name: kakaoProfile.nickname || '',
      email: kakaoAccount.email || '',
      picture: kakaoProfile.profile_image_url || '',
      provider: 'kakao',
      createdAt: existing?.createdAt || new Date().toISOString(),
      lastLoginAt: new Date().toISOString(),
    };
    await saveProfile(profile);

    const token = await createSession({ userId, name: profile.name, email: profile.email, picture: profile.picture, provider: 'kakao' });
    await setSessionCookie(token);

    return NextResponse.redirect(new URL('/', baseUrl));
  } catch (err) {
    console.error('[auth/kakao] callback error:', err);
    return NextResponse.redirect(new URL('/?error=auth_failed', request.url));
  }
}
EOF

echo ""
echo "=== [6/8] Upload session/logout/settings routes ==="

# Session
ssh -i "$KEY" "$HOST" "cat > $REMOTE/app/api/auth/session/route.ts" << 'EOF'
import { NextResponse } from 'next/server';
import { getSession } from '../../../lib/auth';

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ user: null });
  return NextResponse.json({
    user: {
      userId: session.userId,
      name: session.name,
      email: session.email,
      picture: session.picture,
      provider: session.provider,
    },
  });
}
EOF

# Logout
ssh -i "$KEY" "$HOST" "cat > $REMOTE/app/api/auth/logout/route.ts" << 'EOF'
import { NextResponse } from 'next/server';
import { deleteSession } from '../../../lib/auth';

export async function POST() {
  await deleteSession();
  return NextResponse.json({ success: true });
}
EOF

# Settings
ssh -i "$KEY" "$HOST" "cat > $REMOTE/app/api/auth/settings/route.ts" << 'EOF'
import { NextResponse, type NextRequest } from 'next/server';
import { getSession } from '../../../lib/auth';
import { getTurtleSettings, saveTurtleSettings, DEFAULT_TURTLE_SETTINGS, type TurtleSettings } from '../../../lib/user-store';

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ settings: DEFAULT_TURTLE_SETTINGS, loggedIn: false });
  const settings = await getTurtleSettings(session.userId);
  return NextResponse.json({ settings, loggedIn: true });
}

export async function POST(request: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: '로그인이 필요합니다' }, { status: 401 });

  try {
    const body = await request.json();
    const settings: TurtleSettings = {
      initialSeed: Number(body.initialSeed) || DEFAULT_TURTLE_SETTINGS.initialSeed,
      riskPerTrade: Number(body.riskPerTrade) || DEFAULT_TURTLE_SETTINGS.riskPerTrade,
      system1Period: Number(body.system1Period) || DEFAULT_TURTLE_SETTINGS.system1Period,
      system2Period: Number(body.system2Period) || DEFAULT_TURTLE_SETTINGS.system2Period,
      atrPeriod: Number(body.atrPeriod) || DEFAULT_TURTLE_SETTINGS.atrPeriod,
      benchmarkIndex: body.benchmarkIndex || DEFAULT_TURTLE_SETTINGS.benchmarkIndex,
    };
    await saveTurtleSettings(session.userId, settings);
    return NextResponse.json({ success: true, settings });
  } catch (err) {
    return NextResponse.json({ error: `설정 저장 실패: ${err instanceof Error ? err.message : ''}` }, { status: 500 });
  }
}
EOF

echo ""
echo "=== [7/8] Upload AuthButton + patch Navbar ==="

# AuthButton component
ssh -i "$KEY" "$HOST" "cat > $REMOTE/app/components/AuthButton.tsx" << 'AUTHBTN'
'use client';

import { useState, useEffect, useRef, useCallback } from 'react';

interface User {
  userId: string;
  name: string;
  email: string;
  picture?: string;
  provider: 'google' | 'kakao';
}

export default function AuthButton() {
  const [user, setUser] = useState<User | null>(null);
  const [showMenu, setShowMenu] = useState(false);
  const [showLogin, setShowLogin] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const loginRef = useRef<HTMLDivElement>(null);

  const fetchSession = useCallback(async () => {
    try {
      const res = await fetch('/api/auth/session');
      const data = await res.json();
      setUser(data.user || null);
    } catch { /* ignore */ }
  }, []);

  useEffect(() => { fetchSession(); }, [fetchSession]);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setShowMenu(false);
      if (loginRef.current && !loginRef.current.contains(e.target as Node)) setShowLogin(false);
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  const handleLogout = async () => {
    await fetch('/api/auth/logout', { method: 'POST' });
    setUser(null);
    setShowMenu(false);
    window.location.reload();
  };

  if (!user) {
    return (
      <div className="relative" ref={loginRef}>
        <button
          onClick={() => setShowLogin(!showLogin)}
          className="text-xs text-[#86868b] hover:text-white transition-colors px-2 py-1 rounded"
        >
          로그인
        </button>
        {showLogin && (
          <div className="absolute right-0 top-8 bg-[#2d2d2f] rounded-xl shadow-2xl border border-white/10 p-3 w-52 z-50">
            <p className="text-[10px] text-[#86868b] mb-2.5 text-center">소셜 계정으로 로그인</p>
            <a href="/api/auth/google" className="flex items-center gap-2 w-full px-3 py-2 rounded-lg bg-white text-gray-800 text-xs font-medium hover:bg-gray-100 transition-colors mb-1.5">
              <svg width="14" height="14" viewBox="0 0 24 24"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"/><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/><path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/></svg>
              Google 로그인
            </a>
            <a href="/api/auth/kakao" className="flex items-center gap-2 w-full px-3 py-2 rounded-lg text-xs font-medium transition-colors" style={{ backgroundColor: '#FEE500', color: '#191919' }}>
              <svg width="14" height="14" viewBox="0 0 24 24"><path fill="#191919" d="M12 3C6.48 3 2 6.36 2 10.44c0 2.62 1.75 4.93 4.38 6.24l-1.12 4.12c-.1.36.3.65.62.45l4.8-3.18c.43.04.87.07 1.32.07 5.52 0 10-3.36 10-7.7S17.52 3 12 3z"/></svg>
              카카오 로그인
            </a>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="relative" ref={menuRef}>
      <button onClick={() => setShowMenu(!showMenu)} className="flex items-center gap-1.5 hover:opacity-80 transition-opacity">
        {user.picture ? (
          <img src={user.picture} alt="" className="w-5 h-5 rounded-full" referrerPolicy="no-referrer" />
        ) : (
          <div className="w-5 h-5 rounded-full bg-[#86868b] flex items-center justify-center text-[9px] text-white font-medium">
            {user.name?.[0] || '?'}
          </div>
        )}
        <span className="text-xs text-white/80 hidden sm:inline">{user.name}</span>
      </button>
      {showMenu && (
        <div className="absolute right-0 top-8 bg-[#2d2d2f] rounded-xl shadow-2xl border border-white/10 p-2 w-44 z-50">
          <div className="px-2 py-1.5 border-b border-white/5 mb-1">
            <p className="text-[11px] text-white font-medium truncate">{user.name}</p>
            <p className="text-[9px] text-[#86868b] truncate">{user.email}</p>
          </div>
          <button onClick={handleLogout} className="w-full text-left px-2 py-1.5 text-xs text-[#86868b] hover:text-white hover:bg-white/5 rounded-lg transition-colors">
            로그아웃
          </button>
        </div>
      )}
    </div>
  );
}
AUTHBTN

# Patch Navbar to add AuthButton import and usage
ssh -i "$KEY" "$HOST" "cd $REMOTE && python3 -c \"
import re
f = open('app/components/Navbar.tsx', 'r')
content = f.read()
f.close()

# Add import if not present
if 'AuthButton' not in content:
    content = content.replace(
        \\\"import { usePathname } from 'next/navigation';\\\",
        \\\"import { usePathname } from 'next/navigation';\\\\nimport AuthButton from './AuthButton';\\\"
    )

# Add AuthButton before closing div of right section if not present
if '<AuthButton' not in content:
    content = content.replace(
        '</button>\\n        </div>\\n      </div>\\n    </nav>',
        '</button>\\n          <AuthButton />\\n        </div>\\n      </div>\\n    </nav>'
    )

f = open('app/components/Navbar.tsx', 'w')
f.write(content)
f.close()
print('Navbar patched')
\""

echo ""
echo "=== [8/8] Add env vars + Build + Restart ==="
echo ""
echo ">>> IMPORTANT: Before building, you need to add these env vars to .env.local on EC2:"
echo "    SESSION_SECRET=<random-32-char-string>"
echo "    GOOGLE_CLIENT_ID=<your-google-client-id>"
echo "    GOOGLE_CLIENT_SECRET=<your-google-client-secret>"
echo "    KAKAO_CLIENT_ID=<your-kakao-rest-api-key>"
echo "    KAKAO_CLIENT_SECRET=<your-kakao-client-secret>"
echo "    NEXT_PUBLIC_BASE_URL=https://ourtle.com"
echo ""
echo ">>> Run this to generate a SESSION_SECRET:"
echo "    ssh -i $KEY $HOST \"openssl rand -base64 32\""
echo ""
echo ">>> Run this to add env vars (replace placeholders):"
echo "    ssh -i $KEY $HOST \"cat >> $REMOTE/.env.local\" << 'ENVEOF'"
echo "SESSION_SECRET=REPLACE_ME"
echo "GOOGLE_CLIENT_ID=REPLACE_ME"
echo "GOOGLE_CLIENT_SECRET=REPLACE_ME"
echo "KAKAO_CLIENT_ID=REPLACE_ME"
echo "KAKAO_CLIENT_SECRET=REPLACE_ME"
echo "NEXT_PUBLIC_BASE_URL=https://ourtle.com"
echo "ENVEOF"
echo ""
echo ">>> After adding env vars, run build:"
echo "    ssh -i $KEY $HOST \"cd $REMOTE && npm run build && pm2 restart unimind-web\""
echo ""

read -p "환경변수를 설정한 후 빌드하시겠습니까? (y/n) " answer
if [ "$answer" = "y" ]; then
  echo "--- Building... ---"
  ssh -i "$KEY" "$HOST" "cd $REMOTE && npm run build && pm2 restart unimind-web"
  echo "--- Done! ---"
  echo "--- Testing session endpoint... ---"
  sleep 3
  ssh -i "$KEY" "$HOST" "curl -s http://localhost:3000/api/auth/session"
  echo ""
fi
