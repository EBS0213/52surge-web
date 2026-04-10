/**
 * Kakao OAuth 로그인 시작
 * GET /api/auth/kakao → Kakao 로그인 페이지로 리다이렉트
 */

import { NextResponse } from 'next/server';

export async function GET() {
  const clientId = process.env.KAKAO_CLIENT_ID;
  if (!clientId) {
    return NextResponse.json({ error: 'KAKAO_CLIENT_ID not configured' }, { status: 500 });
  }

  const redirectUri = `${process.env.NEXT_PUBLIC_BASE_URL || 'https://ourtle.com'}/api/auth/kakao/callback`;

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
  });

  return NextResponse.redirect(`https://kauth.kakao.com/oauth/authorize?${params.toString()}`);
}
