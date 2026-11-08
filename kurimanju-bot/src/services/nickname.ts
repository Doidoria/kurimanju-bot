import {
  PermissionFlagsBits,
  escapeMarkdown,
  type GuildMember,
  type Message,
} from 'discord.js';
import { seoulDateString } from '../lib/time';
import { getGuildSettings } from './guildSettings';
import { getNickUsage, saveNickUsage } from './nicknameUsage';

/**
 * 별명 자동 변경
 * - 지정 채널의 메시지 내용으로 별명 변경, 하루 2회 (Asia/Seoul 자정 초기화)
 * - 레벨링 봇의 [레벨] 접두사는 유지하고 뒤 이름만 변경, 유저가 입력한 [숫자] 접두사는 제거
 * - 접두사 포함 32자 제한
 */

export const DAILY_NICK_LIMIT = 2;
const MAX_NICKNAME_LENGTH = 32;
const REPLY_TTL_MS = 10_000;

/** 레벨링 봇이 붙이는 접두사: 맨 앞의 [숫자] */
const LEVEL_PREFIX = /^\[\d+\]/;
/** 유저가 직접 입력한 [숫자] 접두사 (여러 개, 공백 포함) */
const USER_PREFIXES = /^(?:\s*\[\d+\]\s*)+/;

const FORBIDDEN_RULES: readonly { pattern: RegExp; reason: string }[] = [
  { pattern: /[\r\n]/, reason: '한 줄로 입력해 주세요.' },
  { pattern: /[\u0000-\u001f\u007f\u200b-\u200f\u2028-\u202f\u2060-\u206f\ufeff]/, reason: '보이지 않는 특수 문자는 사용할 수 없어요.' },
  { pattern: /<(?:@[!&]?|#|a?:)/, reason: '멘션·채널·커스텀 이모지는 사용할 수 없어요.' },
  { pattern: /@/, reason: '@ 문자는 사용할 수 없어요.' },
  { pattern: /https?:\/\/|www\.|discord\.(?:gg|com)\/|discordapp\.com\//i, reason: '링크는 사용할 수 없어요.' },
  { pattern: /`/, reason: '` 문자는 사용할 수 없어요.' },
];

type NicknameResult =
  | { ok: true; nickname: string; remaining: number }
  | { ok: false; reason: string };

type ValidationResult = { ok: true; name: string } | { ok: false; reason: string };

/** 처리 중인 유저 (연속 입력으로 하루 횟수를 넘기는 것 방지, 인스턴스 1개 전제) */
const inProgress = new Set<string>();

export function validateNicknameInput(raw: string): ValidationResult {
  for (const rule of FORBIDDEN_RULES) {
    if (rule.pattern.test(raw)) return { ok: false, reason: rule.reason };
  }

  const name = raw
    .normalize('NFC')
    .replace(USER_PREFIXES, '')
    .replace(/\s+/g, ' ')
    .trim();

  if (name.length === 0) return { ok: false, reason: '바꿀 별명을 입력해 주세요.' };
  return { ok: true, name };
}

/** 현재 별명의 [레벨] 접두사를 유지한 새 별명 */
export function composeNickname(currentNickname: string | null, name: string): string {
  const prefix = currentNickname?.match(LEVEL_PREFIX)?.[0] ?? '';
  return `${prefix}${name}`;
}

function remainingText(remaining: number): string {
  return `오늘 남은 횟수: ${remaining}회`;
}

async function processNicknameChange(message: Message<true>, member: GuildMember): Promise<NicknameResult> {
  const validation = validateNicknameInput(message.content);
  if (!validation.ok) return validation;

  // 변경 불가 멤버는 횟수를 확인·차감하지 않음
  if (member.id === message.guild.ownerId) {
    return { ok: false, reason: '서버 소유자의 별명은 봇이 바꿀 수 없어요. 직접 변경해 주세요.' };
  }

  const me = message.guild.members.me;
  if (!me?.permissions.has(PermissionFlagsBits.ManageNicknames)) {
    console.warn(`[nickname] ${message.guild.name}: 봇에 별명 관리 권한 없음`);
    return { ok: false, reason: '봇에게 별명 관리 권한이 없어요. 관리자에게 알려주세요.' };
  }

  if (!member.manageable) {
    return { ok: false, reason: '역할이 봇보다 높거나 같아서 별명을 바꿀 수 없어요.' };
  }

  const nickname = composeNickname(member.nickname, validation.name);
  if (nickname.length > MAX_NICKNAME_LENGTH) {
    const allowed = MAX_NICKNAME_LENGTH - (nickname.length - validation.name.length);
    return { ok: false, reason: `별명이 너무 길어요. ${allowed}자 이내로 입력해 주세요.` };
  }
  if (nickname === member.nickname) {
    return { ok: false, reason: '지금 별명과 같아요.' };
  }

  const today = seoulDateString();
  const usage = await getNickUsage(message.guildId, member.id, today);
  if (usage.count >= DAILY_NICK_LIMIT) {
    return {
      ok: false,
      reason: `오늘은 별명을 ${DAILY_NICK_LIMIT}번 모두 바꿨어요. 자정(한국 시간) 이후에 다시 시도해 주세요.`,
    };
  }

  try {
    await member.setNickname(nickname, '쿠리만쥬 별명 변경 채널');
  } catch (error) {
    console.error(`[nickname] ${member.id} 별명 변경 실패`, error);
    return { ok: false, reason: '별명 변경에 실패했어요. 잠시 후 다시 시도해 주세요. (횟수는 차감되지 않았어요)' };
  }

  const next = { date: today, count: usage.count + 1 };
  try {
    await saveNickUsage(message.guildId, member.id, next);
  } catch (error) {
    // 별명은 이미 바뀜 → 메모리 횟수는 유지, 재시작 시에만 유실 가능
    console.error(`[nickname] ${member.id} 횟수 저장 실패`, error);
  }

  return { ok: true, nickname, remaining: DAILY_NICK_LIMIT - next.count };
}

async function respond(message: Message<true>, result: NicknameResult): Promise<void> {
  await message.react(result.ok ? '✅' : '❌').catch(() => undefined);

  const content = result.ok
    ? `별명을 **${escapeMarkdown(result.nickname)}**(으)로 바꿨어요. ${remainingText(result.remaining)}`
    : result.reason;

  const reply = await message
    .reply({ content, allowedMentions: { repliedUser: false } })
    .catch(() => null);

  if (reply) {
    setTimeout(() => {
      reply.delete().catch(() => undefined);
    }, REPLY_TTL_MS);
  }
}

export async function handleNicknameMessage(message: Message): Promise<void> {
  if (!message.inGuild()) return;
  if (message.author.bot || message.webhookId || message.system) return;

  const settings = getGuildSettings(message.guildId);
  if (!settings.nickname.enabled || settings.nickname.channelId !== message.channelId) return;

  const key = `${message.guildId}:${message.author.id}`;
  if (inProgress.has(key)) return; // 이전 요청 처리 중이면 무시
  inProgress.add(key);

  try {
    const member =
      message.member ?? (await message.guild.members.fetch(message.author.id).catch(() => null));
    if (!member) return;

    const result = await processNicknameChange(message, member);
    await respond(message, result);
  } finally {
    inProgress.delete(key);
  }
}
