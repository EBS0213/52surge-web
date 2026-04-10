/**
 * 인증 유틸리티 — jose JWT 기반 세션 관리
 * Next.js 16 권장 패턴 (stateless session)
 */

import { SignJWT, jwtVerify } from 'jose';
import { cookies } from 'next/headers';

export interface SessionPayload {
  userId: string;       // provider_id  (e.g. "google_123456")
  name: string;
  email: string;
  picture?: string;
  provider: 'google' | 'kakao';
  expiresAt: number;    // epoch ms
}

const SESSION_COOKIE = 'ourtle_session';
const SESSION_TTL = 7 * 24 * 60 * 60; // 7 days in seconds

function getSecretKey(): Uint8Array {
  const secret = process.env.SESSION_SECRET;
  if (!secret) throw new Error('SESSION_SECRET 환경변수 필요');
  return new TextEncoder().encode(secret);
}

/** JWT 세션 토큰 생성 */
export async function createSession(payload: Omit<SessionPayload, 'expiresAt'>): Promise<string> {
  const expiresAt = Date.now() + SESSION_TTL * 1000;
  const token = await new SignJWT({ ...payload, expiresAt } as unknown as Record<string, unknown>)
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(`${SESSION_TTL}s`)
    .sign(getSecretKey());
  return token;
}

/** 세션 쿠키 설정 */
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

/** 현재 세션 읽기 (null이면 미인증) */
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

/** 로그아웃 — 세션 쿠키 삭제 */
export async function deleteSession(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.delete(SESSION_COOKIE);
}
