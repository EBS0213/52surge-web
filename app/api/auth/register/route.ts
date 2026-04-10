/**
 * 자체 회원가입 API
 * POST /api/auth/register
 * body: { email, password, name }
 */

import { NextResponse, type NextRequest } from 'next/server';
import { registerUser, findByEmail } from '../../../lib/credential-store';
import { createSession, setSessionCookie } from '../../../lib/auth';
import { saveProfile } from '../../../lib/user-store';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { email, password, name } = body as {
      email?: string;
      password?: string;
      name?: string;
    };

    // ── 유효성 검사 ──
    if (!email || !password || !name) {
      return NextResponse.json(
        { error: '이메일, 비밀번호, 이름을 모두 입력해주세요.' },
        { status: 400 }
      );
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return NextResponse.json(
        { error: '올바른 이메일 형식이 아닙니다.' },
        { status: 400 }
      );
    }

    if (password.length < 6) {
      return NextResponse.json(
        { error: '비밀번호는 최소 6자 이상이어야 합니다.' },
        { status: 400 }
      );
    }

    if (name.trim().length < 1) {
      return NextResponse.json(
        { error: '이름을 입력해주세요.' },
        { status: 400 }
      );
    }

    // ── 중복 확인 ──
    if (findByEmail(email)) {
      return NextResponse.json(
        { error: '이미 가입된 이메일입니다.' },
        { status: 409 }
      );
    }

    // ── 사용자 등록 ──
    const user = registerUser(email, password, name);

    // ── 프로필 저장 ──
    await saveProfile({
      userId: user.id,
      name: user.name,
      email: user.email,
      provider: 'local',
      createdAt: user.createdAt,
      lastLoginAt: new Date().toISOString(),
    });

    // ── 세션 생성 + 쿠키 설정 (가입 즉시 로그인) ──
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
    const message = error instanceof Error ? error.message : '회원가입 실패';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
