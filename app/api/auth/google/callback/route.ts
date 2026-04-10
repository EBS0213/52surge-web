/**
 * Google OAuth 콜백
 * GET /api/auth/google/callback?code=xxx
 * → 토큰 교환 → 유저 정보 → 세션 생성 → 홈으로 리다이렉트
 */

import { NextResponse, type NextRequest } from 'next/server';
import { createSession, setSessionCookie } from '../../../../lib/auth';
import { getProfile, saveProfile, type UserProfile } from '../../../../lib/user-store';

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get('code');
  if (!code) {
    return NextResponse.redirect(new URL('/?error=no_code', request.url));
  }

  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'https://ourtle.com';
  const redirectUri = `${baseUrl}/api/auth/google/callback`;

  try {
    // 1. 토큰 교환
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
    const accessToken = tokenData.access_token;

    // 2. 유저 정보 가져오기
    const userRes = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (!userRes.ok) {
      return NextResponse.redirect(new URL('/?error=userinfo_failed', request.url));
    }

    const userInfo = await userRes.json();
    const userId = `google_${userInfo.id}`;

    // 3. 프로필 저장/업데이트
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

    // 4. 세션 생성
    const token = await createSession({
      userId,
      name: profile.name,
      email: profile.email,
      picture: profile.picture,
      provider: 'google',
    });
    await setSessionCookie(token);

    // 5. 홈으로 리다이렉트
    return NextResponse.redirect(new URL('/', baseUrl));
  } catch (err) {
    console.error('[auth/google] callback error:', err);
    return NextResponse.redirect(new URL('/?error=auth_failed', request.url));
  }
}
