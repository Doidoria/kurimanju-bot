import {
  AttachmentBuilder,
  PermissionFlagsBits,
  escapeMarkdown,
  type GuildMember,
} from 'discord.js';
import { getGuildSettings } from './guildSettings';
import { getBackground } from './welcomeBackground';
import { renderWelcomeCard } from './welcomeCard';

/**
 * 입장 인사
 * - guildMemberAdd → 설정 확인(메모리) → 카드 생성 → 지정 채널에 문구 + 카드 전송
 * - Firestore 읽기/쓰기 0회
 */

export const DEFAULT_WELCOME_MESSAGE = '{user}님, **{server}**에 오신 걸 환영해요! 🌰';
export const WELCOME_PLACEHOLDERS = '{user} 멘션 · {name} 이름 · {server} 서버 이름 · {count} 멤버 수';

export function renderWelcomeMessage(template: string | null, member: GuildMember): string {
  const values: Record<string, string> = {
    '{user}': `<@${member.id}>`,
    '{name}': escapeMarkdown(member.displayName),
    '{server}': escapeMarkdown(member.guild.name),
    '{count}': member.guild.memberCount.toLocaleString('ko-KR'),
  };
  return (template ?? DEFAULT_WELCOME_MESSAGE).replace(
    /\{(user|name|server|count)\}/g,
    (token) => values[token] ?? token,
  );
}

/** 카드 생성 실패 시 null (문구만 보냄) */
export async function buildWelcomeCard(member: GuildMember): Promise<AttachmentBuilder | null> {
  const settings = getGuildSettings(member.guild.id);
  try {
    const image = await getBackground(member.guild.id, settings.welcome.backgroundFile);
    const background = image ? { image, style: settings.welcome.backgroundStyle } : null;
    const png = await renderWelcomeCard({
      displayName: member.displayName,
      avatarUrl: member.displayAvatarURL({ extension: 'png', forceStatic: true, size: 256 }),
      serverName: member.guild.name,
      memberCount: member.guild.memberCount,
      background,
    });
    return new AttachmentBuilder(png, { name: 'welcome.png' });
  } catch (error) {
    console.error(`[welcome] 카드 생성 실패 (${member.id})`, error);
    return null;
  }
}

export async function handleMemberJoin(member: GuildMember): Promise<void> {
  if (member.user.bot) return;

  const { welcome } = getGuildSettings(member.guild.id);
  if (!welcome.enabled || !welcome.channelId) return;

  const channel = member.guild.channels.cache.get(welcome.channelId);
  if (!channel?.isSendable() || channel.isThread() || channel.isVoiceBased()) {
    console.warn(`[welcome] ${member.guild.name}: 환영 채널을 찾을 수 없거나 텍스트 채널이 아님`);
    return;
  }

  const me = member.guild.members.me;
  const perms = me ? channel.permissionsFor(me) : null;
  if (!perms?.has([PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages])) {
    console.warn(`[welcome] #${channel.name}: 메시지 보내기 권한 없음`);
    return;
  }
  const canAttach = perms.has(PermissionFlagsBits.AttachFiles);
  if (!canAttach) console.warn(`[welcome] #${channel.name}: 파일 첨부 권한 없음 → 문구만 전송`);

  const card = canAttach ? await buildWelcomeCard(member) : null;
  await channel.send({
    content: renderWelcomeMessage(welcome.message, member),
    files: card ? [card] : [],
    // 문구에 @everyone 등을 넣어도 입장한 멤버만 멘션
    allowedMentions: { users: [member.id] },
  });
}
