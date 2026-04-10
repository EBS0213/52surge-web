/**
 * 자체 회원가입 계정 저장소
 * .data/credentials.json — 이메일/해시 비밀번호 기반 로컬 계정
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';
import { hashPassword, verifyPassword } from './password';

const DATA_DIR = join(process.cwd(), '.data');
const CRED_FILE = join(DATA_DIR, 'credentials.json');

export interface LocalUser {
  id: string;            // "local_<nanoid>" 형태
  email: string;
  name: string;
  passwordHash: string;
  createdAt: string;     // ISO 8601
}

function loadCredentials(): LocalUser[] {
  try {
    if (existsSync(CRED_FILE)) {
      return JSON.parse(readFileSync(CRED_FILE, 'utf-8')) as LocalUser[];
    }
  } catch { /* 파일 손상 → 빈 배열 */ }
  return [];
}

function saveCredentials(users: LocalUser[]): void {
  if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });
  writeFileSync(CRED_FILE, JSON.stringify(users, null, 2), 'utf-8');
}

/** 이메일로 사용자 검색 */
export function findByEmail(email: string): LocalUser | undefined {
  const lower = email.toLowerCase().trim();
  return loadCredentials().find((u) => u.email === lower);
}

/** 회원가입: 이메일 중복 체크 → 해시 저장 → LocalUser 반환 */
export function registerUser(email: string, password: string, name: string): LocalUser {
  const lower = email.toLowerCase().trim();
  const users = loadCredentials();

  if (users.some((u) => u.email === lower)) {
    throw new Error('이미 가입된 이메일입니다.');
  }

  // 간단한 나노ID (8자리)
  const id = `local_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

  const newUser: LocalUser = {
    id,
    email: lower,
    name: name.trim(),
    passwordHash: hashPassword(password),
    createdAt: new Date().toISOString(),
  };

  users.push(newUser);
  saveCredentials(users);
  return newUser;
}

/** 로그인: 이메일 + 비밀번호 검증 → LocalUser | null */
export function authenticateUser(email: string, password: string): LocalUser | null {
  const user = findByEmail(email);
  if (!user) return null;
  if (!verifyPassword(password, user.passwordHash)) return null;
  return user;
}
