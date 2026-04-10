/**
 * 자체 로그인 API
 * POST /api/auth/login
 * body: { email, password }
 */

import { NextResponse, type NextRequest } from 'next/server';
import { authenticateUser } from '../../../lib/credential-store';
import { createSession, setSessionCookie } from '../../../lib/auth';
import { saveProfile, getProfile } from '../../../lib/user-store';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { email, password } = body as {
      email?: string;
      password?: string;
    };

    if (!email || !password) {
      return NextResponse.json(
        { error: '이메일과 비밀번호를 입력해주세요.' },
        { status: 400 }
      );
    }

    // ── 인증 ──
    const user = authenticateUser(email, password);
    if (!user) {
      return NextResponse.json(
        { error: '이메일 또는 비밀번호가 올바르지 않습니다.' },
        { status: 401 }
      );
    }

    // ── 프로필 lastLoginAt 갱신 ──
    const existing = await getProfile(user.id);
    await saveProfile({
      userId: user.id,
      name: user.name,
      email: user.email,
      provider: 'local',
      createdAt: existing?.createdAt || user.createdAt,
      lastLoginAt: new Date().toISOString(),
    });

    // ── 세션 생성 + 쿠키 설정 ──
    const token = await createSession({
      userId: user.id,
      name: user.name,
      email: user.email,
      provider: 'local',
    });
    await setSessionCookie(token);

    return NextResponse.json({
      success: true,
      user: { id: user.id, name: user.name, email: user.email },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : '로그인 실패';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
