import {
  EmbedBuilder,
  PermissionFlagsBits,
  escapeMarkdown,
  type Attachment,
  type AttachmentBuilder,
  type Guild,
  type GuildMember,
} from 'discord.js';
import { getGuildSettings, updateGuildSettings } from './guildSettings';
import { deleteBackground, saveBackground } from './welcomeBackground';
import {
  DEFAULT_WELCOME_MESSAGE,
  WELCOME_PLACEHOLDERS,
  buildWelcomeCard,
  renderWelcomeMessage,
} from './welcome';
import {
  findMissingChannelPermissions,
  findMissingGuildPermissions,
  type PermissionRequirement,
} from './permissions';
import {
  FEATURE_KEYS,
  FEATURES,
  MAX_EMOJI_EXCLUDED_CHANNELS,
  MAX_WELCOME_MESSAGE_LENGTH,
  MAX_DAILY_NOTICE_LENGTH,
  DEFAULT_DAILY_NOTICE_MESSAGE,
  parseNoticeTime,
  type BackgroundStyle,
  type ChannelFeatureKey,
  type FeatureKey,
  type GuildSettings,
  type SettingsPatch,
} from './settingsSchema';

export const BACKGROUND_STYLE_LABELS: Record<BackgroundStyle, string> = {
  photo: '사진 — 흐리게',
  illustration: '일러스트 — 선명하게',
};

const EMBED_COLOR = 0xc8874a; // 밤만쥬 갈색

/** 기능별로 봇에게 필요한 채널 권한 */
const CHANNEL_PERMISSIONS: Record<ChannelFeatureKey, readonly PermissionRequirement[]> = {
  nickname: [
    { flag: PermissionFlagsBits.ViewChannel, label: '채널 보기' },
    { flag: PermissionFlagsBits.SendMessages, label: '메시지 보내기' },
    { flag: PermissionFlagsBits.ReadMessageHistory, label: '메시지 기록 보기' },
    { flag: PermissionFlagsBits.AddReactions, label: '반응 추가' },
  ],
  welcome: [
    { flag: PermissionFlagsBits.ViewChannel, label: '채널 보기' },
    { flag: PermissionFlagsBits.SendMessages, label: '메시지 보내기' },
    { flag: PermissionFlagsBits.AttachFiles, label: '파일 첨부' },
  ],
  dailyNotice: [
    { flag: PermissionFlagsBits.ViewChannel, label: '채널 보기' },
    { flag: PermissionFlagsBits.SendMessages, label: '메시지 보내기' },
    { flag: PermissionFlagsBits.MentionEveryone, label: '@everyone, @here, 모든 역할 멘션하기' },
  ],
};

/** 기능별로 봇에게 필요한 서버 권한 */
const GUILD_PERMISSIONS: Record<FeatureKey, readonly PermissionRequirement[]> = {
  emojiEnlarge: [
    { flag: PermissionFlagsBits.ManageMessages, label: '메시지 관리' },
    { flag: PermissionFlagsBits.ManageWebhooks, label: '웹후크 관리' },
  ],
  nickname: [{ flag: PermissionFlagsBits.ManageNicknames, label: '별명 관리' }],
  welcome: [],
  dailyNotice: [],
};

function channelIdOf(settings: GuildSettings, feature: FeatureKey): string | null {
  const value = settings[feature];
  return 'channelId' in value ? value.channelId : null;
}

export function buildSettingsEmbed(guild: Guild): EmbedBuilder {
  const settings = getGuildSettings(guild.id);

  const lines = FEATURE_KEYS.map((key) => {
    const meta = FEATURES[key];
    const status = settings[key].enabled ? '🟢 켜짐' : '⚫ 꺼짐';
    if (key === 'emojiEnlarge') {
      const excluded = settings.emojiEnlarge.excludedChannelIds;
      const excludedText = excluded.length > 0 ? excluded.map((id) => `<#${id}>`).join(' ') : '없음';
      return `**${meta.ko}** — ${status} · 제외 채널: ${excludedText}`;
    }
    if (!meta.usesChannel) return `**${meta.ko}** — ${status}`;

    const channelId = channelIdOf(settings, key);
    const channel = channelId ? `<#${channelId}>` : '미지정';
    const line = `**${meta.ko}** — ${status} · 채널: ${channel}`;

    if (key === 'dailyNotice') {
      const preview = settings.dailyNotice.message.replace(/\n+/g, ' ⏎ ');
      return `${line}\n　시각: 매일 ${settings.dailyNotice.time} (한국 시간)\n　문구: ${escapeMarkdown(preview)}`;
    }
    if (key === 'welcome') {
      const message = settings.welcome.message ?? `${DEFAULT_WELCOME_MESSAGE} (기본)`;
      const background = settings.welcome.backgroundFile
        ? `사용자 이미지 (${BACKGROUND_STYLE_LABELS[settings.welcome.backgroundStyle]})`
        : '기본 디자인';
      return `${line}\n　문구: ${escapeMarkdown(message)}\n　배경: ${background}`;
    }
    return line;
  });

  return new EmbedBuilder()
    .setColor(EMBED_COLOR)
    .setTitle(`🌰 ${guild.name} 쿠리만쥬 설정`)
    .setDescription(lines.join('\n'))
    .setFooter({
      text: '/설정 기능·채널·이모지제외·환영문구·환영배경 으로 변경 · 별명 변경 채널은 이모지 확대 자동 제외',
    });
}

/** 이미 제외된 채널이면 해제, 아니면 추가 (쓰기 1회) */
export async function toggleEmojiExcludedChannel(guild: Guild, channelId: string): Promise<string> {
  const current = getGuildSettings(guild.id).emojiEnlarge.excludedChannelIds;
  const removing = current.includes(channelId);

  if (!removing && current.length >= MAX_EMOJI_EXCLUDED_CHANNELS) {
    return `❌ 제외 채널은 최대 ${MAX_EMOJI_EXCLUDED_CHANNELS}개까지예요. 다른 채널을 먼저 해제해 주세요.`;
  }

  const next = removing ? current.filter((id) => id !== channelId) : [...current, channelId];
  await updateGuildSettings(guild.id, { emojiEnlarge: { excludedChannelIds: next } });

  return removing
    ? `✅ <#${channelId}> 제외를 해제했어요. 이제 이모지 확대가 동작해요.`
    : `✅ <#${channelId}>에서는 이모지 확대를 하지 않아요. (스레드 포함)`;
}

export async function setFeatureEnabled(
  guild: Guild,
  feature: FeatureKey,
  enabled: boolean,
): Promise<string> {
  const patch: SettingsPatch = {};
  patch[feature] = { enabled };
  await updateGuildSettings(guild.id, patch);

  const meta = FEATURES[feature];
  const lines = [`✅ **${meta.ko}** 기능을 ${enabled ? '켰어요' : '껐어요'}.`];

  if (enabled) {
    if (meta.usesChannel && !channelIdOf(getGuildSettings(guild.id), feature)) {
      lines.push('⚠️ 채널이 지정되지 않아 아직 동작하지 않아요. `/설정 채널`로 지정해 주세요.');
    }
    const missing = await findMissingGuildPermissions(guild, GUILD_PERMISSIONS[feature]);
    if (missing.length > 0) {
      lines.push(`⚠️ 봇에게 서버 권한이 부족해요: ${missing.join(', ')}`);
    }
  }

  return lines.join('\n');
}

export async function setFeatureChannel(
  guild: Guild,
  feature: ChannelFeatureKey,
  channelId: string | null,
): Promise<string> {
  const meta = FEATURES[feature];

  if (channelId === null) {
    const patch: SettingsPatch = {};
    patch[feature] = { channelId: null };
    await updateGuildSettings(guild.id, patch);
    return `✅ **${meta.ko}** 채널 지정을 해제했어요.`;
  }

  const missing = await findMissingChannelPermissions(guild, channelId, CHANNEL_PERMISSIONS[feature]);
  if (missing === null) {
    return '❌ 채널을 찾을 수 없어요. 봇이 볼 수 있는 채널인지 확인해 주세요.';
  }

  const patch: SettingsPatch = {};
  patch[feature] = { channelId };
  await updateGuildSettings(guild.id, patch);

  const lines = [`✅ **${meta.ko}** 채널을 <#${channelId}>(으)로 지정했어요.`];
  if (missing.length > 0) {
    lines.push(`⚠️ 이 채널에서 봇 권한이 부족해요: ${missing.join(', ')}`);
  }
  if (!getGuildSettings(guild.id)[feature].enabled) {
    lines.push('ℹ️ 기능이 꺼져 있어요. `/설정 기능`으로 켜 주세요.');
  }
  return lines.join('\n');
}

/** 비우면 기본 문구로 (쓰기 1회) */
export async function setWelcomeMessage(guild: Guild, message: string | null): Promise<string> {
  const text = message?.trim() ?? '';
  if (text.length > MAX_WELCOME_MESSAGE_LENGTH) {
    return `❌ 환영 문구는 ${MAX_WELCOME_MESSAGE_LENGTH}자 이내로 입력해 주세요.`;
  }

  await updateGuildSettings(guild.id, { welcome: { message: text.length > 0 ? text : null } });
  return text.length > 0
    ? `✅ 환영 문구를 바꿨어요.\n> ${escapeMarkdown(text)}\n사용 가능: ${WELCOME_PLACEHOLDERS}\n\`/설정 환영미리보기\`로 확인해 보세요.`
    : `✅ 환영 문구를 기본값으로 되돌렸어요.\n> ${DEFAULT_WELCOME_MESSAGE}`;
}

/**
 * 이미지만: 저장 (스타일은 지정한 값, 없으면 기존 유지)
 * 스타일만: 스타일 변경
 * 둘 다 없음: 배경 제거
 * → 모두 쓰기 1회
 */
export async function setWelcomeBackground(
  guild: Guild,
  attachment: Attachment | null,
  style: BackgroundStyle | null,
): Promise<string> {
  if (!attachment && !style) {
    await deleteBackground(guild.id);
    await updateGuildSettings(guild.id, { welcome: { backgroundFile: null } });
    return '✅ 배경 이미지를 지우고 기본 디자인으로 되돌렸어요.';
  }

  if (!attachment && style) {
    await updateGuildSettings(guild.id, { welcome: { backgroundStyle: style } });
    const hasImage = getGuildSettings(guild.id).welcome.backgroundFile !== null;
    return [
      `✅ 배경 스타일을 **${BACKGROUND_STYLE_LABELS[style]}**(으)로 바꿨어요.`,
      hasImage ? '`/설정 환영미리보기`로 확인해 보세요.' : 'ℹ️ 배경 이미지가 없어서 지금은 기본 디자인이 쓰여요.',
    ].join('\n');
  }

  const result = await saveBackground(guild.id, attachment as Attachment);
  if (!result.ok) return `❌ ${result.reason}`;

  await updateGuildSettings(guild.id, {
    welcome: { backgroundFile: result.fileName, ...(style ? { backgroundStyle: style } : {}) },
  });
  const appliedStyle = style ?? getGuildSettings(guild.id).welcome.backgroundStyle;
  return `✅ 배경 이미지를 저장했어요. (1024x500에 맞춰 잘림, 스타일: ${BACKGROUND_STYLE_LABELS[appliedStyle]})\n\`/설정 환영미리보기\`로 확인해 보세요.`;
}

export async function buildWelcomePreview(
  member: GuildMember,
): Promise<{ content: string; files: AttachmentBuilder[] }> {
  const { welcome } = getGuildSettings(member.guild.id);
  const card = await buildWelcomeCard(member);
  const notes: string[] = [];
  if (!welcome.enabled) notes.push('ℹ️ 입장 인사 기능이 꺼져 있어요.');
  if (!welcome.channelId) notes.push('ℹ️ 환영 채널이 지정되지 않았어요.');
  if (!card) notes.push('⚠️ 카드 생성에 실패했어요. 로그를 확인해 주세요.');

  return {
    content: [`**미리보기**\n${renderWelcomeMessage(welcome.message, member)}`, ...notes].join('\n\n'),
    files: card ? [card] : [],
  };
}

/**
 * 매일 알림 시각·문구 변경 (쓰기 1회)
 * - 문구에서 \\n 은 줄바꿈 (슬래시 커맨드 입력창은 줄바꿈을 지원하지 않음)
 * - 문구에 "기본"만 입력하면 기본 문구로
 */
export async function setDailyNotice(
  guild: Guild,
  timeInput: string | null,
  messageInput: string | null,
): Promise<string> {
  const current = getGuildSettings(guild.id).dailyNotice;
  const patch: { time?: string; message?: string } = {};

  if (timeInput !== null) {
    const time = parseNoticeTime(timeInput);
    if (!time) return '❌ 시각은 24시간 형식으로 입력해 주세요. 예: `21:45`';
    patch.time = time;
  }

  if (messageInput !== null) {
    const message = messageInput.trim() === '기본' ? DEFAULT_DAILY_NOTICE_MESSAGE : messageInput.replace(/\\n/g, '\n').trim();
    if (message.length === 0) return '❌ 문구를 입력해 주세요.';
    if (message.length > MAX_DAILY_NOTICE_LENGTH) return `❌ 문구는 ${MAX_DAILY_NOTICE_LENGTH}자 이내로 입력해 주세요.`;
    patch.message = message;
  }

  if (patch.time || patch.message) {
    // 시각을 바꾸면 오늘 이미 보냈더라도 새 시각에 다시 보낼 수 있게 기록 초기화
    await updateGuildSettings(guild.id, {
      dailyNotice: { ...patch, ...(patch.time && patch.time !== current.time ? { lastSentDate: null } : {}) },
    });
  }

  const time = patch.time ?? current.time;
  const message = patch.message ?? current.message;
  const notes: string[] = [];
  if (!current.enabled) notes.push('ℹ️ 매일 알림이 꺼져 있어요. `/설정 기능`으로 켜 주세요.');
  if (!current.channelId) notes.push('ℹ️ 알림 채널이 지정되지 않았어요. `/설정 채널`로 지정해 주세요.');

  return [
    patch.time || patch.message ? '✅ 매일 알림을 저장했어요.' : '📋 현재 매일 알림 설정이에요.',
    `**시각**: 매일 ${time} (한국 시간)`,
    '**문구 미리보기**',
    message,
    ...notes,
  ].join('\n');
}
