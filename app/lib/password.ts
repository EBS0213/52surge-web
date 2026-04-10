/**
 * 비밀번호 해싱 — Node.js 내장 crypto (PBKDF2)
 * 외부 패키지(bcrypt) 없이 안전한 비밀번호 저장
 */

import { randomBytes, pbkdf2Sync } from 'crypto';

const ITERATIONS = 100_000;
const KEY_LEN = 64;
const DIGEST = 'sha512';

/**
 * 비밀번호 → 해시 문자열 (salt:hash 형태로 저장)
 */
export function hashPassword(password: string): string {
  const salt = randomBytes(32).toString('hex');
  const hash = pbkdf2Sync(password, salt, ITERATIONS, KEY_LEN, DIGEST).toString('hex');
  return `${salt}:${hash}`;
}

/**
 * 비밀번호 검증: 입력값 vs 저장된 해시
 */
export function verifyPassword(password: string, storedHash: string): boolean {
  const [salt, hash] = storedHash.split(':');
  if (!salt || !hash) return false;
  const candidate = pbkdf2Sync(password, salt, ITERATIONS, KEY_LEN, DIGEST).toString('hex');
  // timing-safe comparison
  if (candidate.length !== hash.length) return false;
  let diff = 0;
  for (let i = 0; i < candidate.length; i++) {
    diff |= candidate.charCodeAt(i) ^ hash.charCodeAt(i);
  }
  return diff === 0;
}
