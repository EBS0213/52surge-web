/**
 * 유저별 Turtle Trading 설정
 * GET  /api/auth/settings → 현재 설정 조회
 * POST /api/auth/settings → 설정 저장
 */

import { NextResponse, type NextRequest } from 'next/server';
import { getSession } from '../../../lib/auth';
import {
  getTurtleSettings,
  saveTurtleSettings,
  DEFAULT_TURTLE_SETTINGS,
  type TurtleSettings,
} from '../../../lib/user-store';

export async function GET() {
  const session = await getSession();
  if (!session) {
    // 비로그인 → 기본 설정 반환
    return NextResponse.json({ settings: DEFAULT_TURTLE_SETTINGS, loggedIn: false });
  }

  const settings = await getTurtleSettings(session.userId);
  return NextResponse.json({ settings, loggedIn: true });
}

export async function POST(request: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: '로그인이 필요합니다' }, { status: 401 });
  }

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
    return NextResponse.json(
      { error: `설정 저장 실패: ${err instanceof Error ? err.message : ''}` },
      { status: 500 },
    );
  }
}
