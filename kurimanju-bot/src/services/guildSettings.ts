import { FieldValue, type DocumentReference } from 'firebase-admin/firestore';
import { getDb } from '../lib/firebase';
import {
  defaultSettings,
  normalizeSettings,
  type GuildSettings,
  type SettingsPatch,
} from './settingsSchema';

/**
 * 길드 설정 캐시
 * - 길드당 guilds/{guildId} 문서 1개만 onSnapshot 구독
 * - 비용: 구독 시작 시 읽기 1회 + 문서가 바뀔 때마다 읽기 1회
 *   (문서가 없어도 구독 시 읽기 1회로 집계됨)
 * - 봇은 읽을 때 Firestore를 조회하지 않고 메모리 캐시만 사용
 */

const RETRY_DELAY_MS = 30_000;

const cache = new Map<string, GuildSettings>();
const unsubscribers = new Map<string, () => void>();
const retryTimers = new Map<string, NodeJS.Timeout>();

function settingsRef(guildId: string): DocumentReference {
  return getDb().collection('guilds').doc(guildId);
}

export function subscribeGuildSettings(guildId: string): void {
  if (unsubscribers.has(guildId)) return;

  const unsubscribe = settingsRef(guildId).onSnapshot(
    (snapshot) => {
      cache.set(guildId, normalizeSettings(snapshot.exists ? snapshot.data() : undefined));
    },
    (error) => {
      // 에러가 나면 리스너는 끊긴 상태가 됨 → 캐시는 마지막 값 유지, 잠시 후 재구독
      console.error(`[settings] ${guildId} 리스너 오류, ${RETRY_DELAY_MS / 1000}초 후 재시도`, error);
      unsubscribers.delete(guildId);
      scheduleRetry(guildId);
    },
  );

  unsubscribers.set(guildId, unsubscribe);
}

function scheduleRetry(guildId: string): void {
  if (retryTimers.has(guildId)) return;
  const timer = setTimeout(() => {
    retryTimers.delete(guildId);
    subscribeGuildSettings(guildId);
  }, RETRY_DELAY_MS);
  retryTimers.set(guildId, timer);
}

export function unsubscribeGuildSettings(guildId: string): void {
  unsubscribers.get(guildId)?.();
  unsubscribers.delete(guildId);

  const timer = retryTimers.get(guildId);
  if (timer) clearTimeout(timer);
  retryTimers.delete(guildId);

  cache.delete(guildId);
}

export function unsubscribeAllGuildSettings(): void {
  for (const guildId of [...unsubscribers.keys(), ...retryTimers.keys()]) {
    unsubscribeGuildSettings(guildId);
  }
}

/** 첫 스냅샷이 오기 전에는 기본값(모든 기능 꺼짐)을 반환 */
export function getGuildSettings(guildId: string): GuildSettings {
  return cache.get(guildId) ?? defaultSettings();
}

/**
 * 쓰기 1회. 이후 리스너가 변경을 받아 캐시를 갱신 (읽기 1회)
 * merge: true → 중첩 맵도 병합되므로 patch에 없는 필드는 유지됨
 */
export async function updateGuildSettings(guildId: string, patch: SettingsPatch): Promise<void> {
  await settingsRef(guildId).set(
    { ...patch, updatedAt: FieldValue.serverTimestamp() },
    { merge: true },
  );
}
