import { PermissionFlagsBits, type Client, type Guild } from 'discord.js';
import { seoulDateString, seoulMinutesOfDay } from '../lib/time';
import { getGuildSettings, updateGuildSettings } from './guildSettings';

/**
 * 매일 알림
 * - 20초마다 메모리 설정만 확인 (Firestore 읽기 0)
 * - 지정 시각부터 5분 안에만 전송 → 봇이 꺼져 있다가 늦게 켜지면 그날은 건너뜀
 * - 보낸 날짜(lastSentDate)를 설정 문서에 저장 → 재시작해도 같은 날 중복 전송 안 함
 * - 비용: 서버당 하루 쓰기 1 + 리스너 읽기 1
 */

const CHECK_INTERVAL_MS = 20_000;
const SEND_WINDOW_MINUTES = 5;

let timer: NodeJS.Timeout | null = null;

/** 설정 문서 반영 전 중복 전송을 막는 메모리 기록 (guildId → 날짜) */
const sentToday = new Map<string, string>();
const sending = new Set<string>();

function toMinutes(time: string): number {
  const [h, m] = time.split(':').map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
}

/** 지정 시각 이후 5분 안이면 "그 시각이 속한 날짜", 아니면 null (자정을 넘는 경우 포함) */
export function dueDate(time: string, now: Date): string | null {
  const elapsed = (seoulMinutesOfDay(now) - toMinutes(time) + 1440) % 1440;
  if (elapsed >= SEND_WINDOW_MINUTES) return null;
  return seoulDateString(new Date(now.getTime() - elapsed * 60_000));
}

/** @everyone/@here가 있을 때만 전체 멘션 허용 (역할·유저 멘션은 막음) */
export function noticeAllowedMentions(message: string): { parse: ('everyone')[] } {
  return { parse: /@(everyone|here)/.test(message) ? ['everyone'] : [] };
}

async function sendNotice(guild: Guild, date: string): Promise<void> {
  const { dailyNotice } = getGuildSettings(guild.id);
  if (!dailyNotice.channelId) return;

  const channel = guild.channels.cache.get(dailyNotice.channelId);
  if (!channel?.isSendable() || channel.isThread() || channel.isVoiceBased()) {
    console.warn(`[notice] ${guild.name}: 알림 채널을 찾을 수 없거나 텍스트 채널이 아님`);
    return;
  }

  const me = guild.members.me;
  const perms = me ? channel.permissionsFor(me) : null;
  if (!perms?.has([PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages])) {
    console.warn(`[notice] #${channel.name}: 메시지 보내기 권한 없음`);
    return;
  }
  if (/@(everyone|here)/.test(dailyNotice.message) && !perms.has(PermissionFlagsBits.MentionEveryone)) {
    console.warn(`[notice] #${channel.name}: @everyone 멘션 권한 없음 → 알림 없이 글자로만 표시됨`);
  }

  // 전송 전에 기록 → 전송 중 재시작·오류가 나도 같은 날 두 번 가지 않게 (대신 실패 시 그날은 누락)
  sentToday.set(guild.id, date);
  await updateGuildSettings(guild.id, { dailyNotice: { lastSentDate: date } });

  await channel.send({
    content: dailyNotice.message,
    allowedMentions: noticeAllowedMentions(dailyNotice.message),
  });
  console.log(`[notice] ${guild.name} #${channel.name} 전송 (${date} ${dailyNotice.time})`);
}

function tick(client: Client): void {
  const now = new Date();

  for (const guild of client.guilds.cache.values()) {
    const { dailyNotice } = getGuildSettings(guild.id);
    if (!dailyNotice.enabled || !dailyNotice.channelId) continue;

    const date = dueDate(dailyNotice.time, now);
    if (!date) continue;
    if (dailyNotice.lastSentDate === date || sentToday.get(guild.id) === date) continue;
    if (sending.has(guild.id)) continue;

    sending.add(guild.id);
    sendNotice(guild, date)
      .catch((error: unknown) => console.error(`[notice] ${guild.id} 전송 실패`, error))
      .finally(() => sending.delete(guild.id));
  }
}

export function startDailyNoticeScheduler(client: Client): void {
  if (timer) return;
  timer = setInterval(() => tick(client), CHECK_INTERVAL_MS);
  tick(client);
}

export function stopDailyNoticeScheduler(): void {
  if (timer) clearInterval(timer);
  timer = null;
}
