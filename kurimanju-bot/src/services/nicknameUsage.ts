import { FieldValue, type DocumentReference } from 'firebase-admin/firestore';
import { getDb } from '../lib/firebase';

/**
 * guilds/{guildId}/members/{userId} : { nickDate: 'YYYY-MM-DD', nickCount, updatedAt }
 *
 * 조회 패턴: 별명 변경 시도 시 한 유저 문서 1개만 조회
 * - 읽기: 봇 실행 후 그 유저의 "오늘 첫 시도"에만 1회 (이후는 메모리 캐시)
 *   날짜가 바뀌면 봇이 유일한 쓰기 주체이므로 읽지 않고 0회로 초기화
 * - 쓰기: 별명 변경 성공 시에만 1회 (실패·거절은 0회)
 * → 유저 1명이 하루 최대 읽기 1 + 쓰기 2
 */

export interface NickUsage {
  date: string;
  count: number;
}

const usageCache = new Map<string, NickUsage>();

function cacheKey(guildId: string, userId: string): string {
  return `${guildId}:${userId}`;
}

function memberRef(guildId: string, userId: string): DocumentReference {
  return getDb().collection('guilds').doc(guildId).collection('members').doc(userId);
}

export async function getNickUsage(guildId: string, userId: string, today: string): Promise<NickUsage> {
  const key = cacheKey(guildId, userId);
  const cached = usageCache.get(key);

  if (cached) {
    if (cached.date === today) return cached;
    const reset: NickUsage = { date: today, count: 0 };
    usageCache.set(key, reset);
    return reset;
  }

  const snapshot = await memberRef(guildId, userId).get();
  const data = snapshot.data();
  const savedDate: unknown = data?.nickDate;
  const savedCount: unknown = data?.nickCount;

  const usage: NickUsage =
    savedDate === today && typeof savedCount === 'number' && Number.isFinite(savedCount)
      ? { date: today, count: Math.max(0, Math.floor(savedCount)) }
      : { date: today, count: 0 };

  usageCache.set(key, usage);
  return usage;
}

/** 메모리를 먼저 갱신하고 저장 (저장 실패 시에도 이번 실행 중에는 횟수가 유지됨) */
export async function saveNickUsage(guildId: string, userId: string, usage: NickUsage): Promise<void> {
  usageCache.set(cacheKey(guildId, userId), usage);
  await memberRef(guildId, userId).set(
    { nickDate: usage.date, nickCount: usage.count, updatedAt: FieldValue.serverTimestamp() },
    { merge: true },
  );
}
