/**
 * 로그아웃
 * POST /api/auth/logout → 세션 쿠키 삭제 후 홈으로 리다이렉트
 */

import { NextResponse } from 'next/server';
import { deleteSession } from '../../../lib/auth';

export async function POST() {
  await deleteSession();
  return NextResponse.json({ success: true });
}
