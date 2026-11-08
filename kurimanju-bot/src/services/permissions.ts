import {
  PermissionFlagsBits,
  type ChatInputCommandInteraction,
  type Guild,
  type PermissionResolvable,
} from 'discord.js';

/** setDefaultMemberPermissions는 서버 관리자가 바꿀 수 있으므로 실행 시 한 번 더 확인 */
export function hasManageGuild(interaction: ChatInputCommandInteraction): boolean {
  return interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild) ?? false;
}

export interface PermissionRequirement {
  flag: PermissionResolvable;
  label: string;
}

/**
 * 봇이 특정 채널에서 필요한 권한 중 빠진 것의 이름 목록
 * 채널을 찾지 못하면 null
 */
export async function findMissingChannelPermissions(
  guild: Guild,
  channelId: string,
  required: readonly PermissionRequirement[],
): Promise<string[] | null> {
  const me = guild.members.me ?? (await guild.members.fetchMe().catch(() => null));
  const channel =
    guild.channels.cache.get(channelId) ??
    (await guild.channels.fetch(channelId).catch(() => null));

  if (!me || !channel) return null;

  const perms = channel.permissionsFor(me);
  return required.filter((r) => !perms.has(r.flag)).map((r) => r.label);
}

/** 서버 전체 권한 (예: 별명 관리) */
export async function findMissingGuildPermissions(
  guild: Guild,
  required: readonly PermissionRequirement[],
): Promise<string[]> {
  const me = guild.members.me ?? (await guild.members.fetchMe().catch(() => null));
  if (!me) return required.map((r) => r.label);
  return required.filter((r) => !me.permissions.has(r.flag)).map((r) => r.label);
}
