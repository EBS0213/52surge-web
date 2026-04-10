/**
 * 현재 세션 정보 조회
 * GET /api/auth/session
 * → { user: { userId, name, email, picture, provider } } 또는 { user: null }
 */

import { NextResponse } from 'next/server';
import { getSession } from '../../../lib/auth';

export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ user: null });
  }
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
