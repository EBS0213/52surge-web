/**
 * 유저별 파일 기반 데이터 저장소
 * .data/users/{userId}/settings.json  — Turtle trading 설정
 * .data/users/{userId}/trades.json    — 매매일지
 */

import { readFile, writeFile, mkdir } from 'fs/promises';
import path from 'path';

const DATA_DIR = path.join(process.cwd(), '.data', 'users');

/** Turtle trading 기본 설정 */
export interface TurtleSettings {
  initialSeed: number;
  riskPerTrade: number;      // % (기본 2)
  system1Period: number;     // 기본 20
  system2Period: number;     // 기본 55
  atrPeriod: number;         // 기본 20
  benchmarkIndex: string;    // 코스피 | 코스닥
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
  provider: 'google' | 'kakao' | 'local';
  createdAt: string;
  lastLoginAt: string;
}

// ── 유틸 ──

async function ensureDir(dirPath: string): Promise<void> {
  try {
    await mkdir(dirPath, { recursive: true });
  } catch {
    // already exists
  }
}

function userDir(userId: string): string {
  // sanitize userId to prevent path traversal
  const safe = userId.replace(/[^a-zA-Z0-9_-]/g, '_');
  return path.join(DATA_DIR, safe);
}

async function readJSON<T>(filePath: string, fallback: T): Promise<T> {
  try {
    const raw = await readFile(filePath, 'utf-8');
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

async function writeJSON(filePath: string, data: unknown): Promise<void> {
  const dir = path.dirname(filePath);
  await ensureDir(dir);
  await writeFile(filePath, JSON.stringify(data, null, 2), 'utf-8');
}

// ── Profile ──

export async function getProfile(userId: string): Promise<UserProfile | null> {
  return readJSON<UserProfile | null>(path.join(userDir(userId), 'profile.json'), null);
}

export async function saveProfile(profile: UserProfile): Promise<void> {
  await writeJSON(path.join(userDir(profile.userId), 'profile.json'), profile);
}

// ── Turtle Settings ──

export async function getTurtleSettings(userId: string): Promise<TurtleSettings> {
  return readJSON<TurtleSettings>(
    path.join(userDir(userId), 'settings.json'),
    DEFAULT_TURTLE_SETTINGS,
  );
}

export async function saveTurtleSettings(userId: string, settings: TurtleSettings): Promise<void> {
  await writeJSON(path.join(userDir(userId), 'settings.json'), settings);
}

// ── Trades (매매일지) ──

export async function getTrades(userId: string): Promise<unknown[]> {
  return readJSON<unknown[]>(path.join(userDir(userId), 'trades.json'), []);
}

export async function saveTrades(userId: string, trades: unknown[]): Promise<void> {
  await writeJSON(path.join(userDir(userId), 'trades.json'), trades);
}
