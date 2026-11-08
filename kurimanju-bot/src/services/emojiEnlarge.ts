import {
  ChannelType,
  DiscordAPIError,
  PermissionFlagsBits,
  RESTJSONErrorCodes,
  type ForumChannel,
  type GuildTextBasedChannel,
  type Message,
  type NewsChannel,
  type TextChannel,
  type Webhook,
  type WebhookType,
} from 'discord.js';
import { getGuildSettings } from './guildSettings';
import type { GuildSettings } from './settingsSchema';

/**
 * 커스텀 이모지 확대
 * - Firestore 읽기/쓰기 0회 (설정은 메모리 캐시만 사용)
 * - 디스코드 API: 채널(부모 채널)당 웹후크 조회/생성은 봇 실행 중 최초 1회, 이후 메시지당 전송 1 + 삭제 1
 */

/** 앞뒤 공백만 허용, <:name:id> 또는 <a:name:id> 하나 */
const EMOJI_ONLY = /^\s*<(a?):(\w{2,32}):(\d{17,20})>\s*$/;

/** CDN 이미지 크기 (px). 더 크게 하려면 256 */
const EMOJI_SIZE = 160;

const WEBHOOK_NAME = '쿠리만쥬 이모지';

type WebhookParent = TextChannel | NewsChannel | ForumChannel;
type IncomingWebhook = Webhook<WebhookType.Incoming>;

interface ParsedEmoji {
  id: string;
  name: string;
  animated: boolean;
}

interface SendTarget {
  parent: WebhookParent;
  threadId?: string;
}

/** 부모 채널 id → 웹후크 (동시에 여러 메시지가 와도 웹후크를 1개만 만들도록 Promise를 캐시) */
const webhookCache = new Map<string, Promise<IncomingWebhook>>();

/** 권한 부족 로그를 채널당 1번만 남기기 위함 */
const warnedChannels = new Set<string>();

export function parseSingleCustomEmoji(content: string): ParsedEmoji | null {
  const match = EMOJI_ONLY.exec(content);
  if (!match) return null;
  const [, animatedFlag, name, id] = match;
  if (!name || !id) return null;
  return { id, name, animated: animatedFlag === 'a' };
}

function isWebhookParent(channel: { type: ChannelType }): channel is WebhookParent {
  return (
    channel.type === ChannelType.GuildText ||
    channel.type === ChannelType.GuildAnnouncement ||
    channel.type === ChannelType.GuildForum
  );
}

/** 스레드면 부모 채널의 웹후크로 threadId를 지정해 보냄 */
function resolveTarget(channel: GuildTextBasedChannel): SendTarget | null {
  if (channel.isThread()) {
    const parent = channel.parent;
    if (!parent || !isWebhookParent(parent)) return null;
    return { parent, threadId: channel.id };
  }
  if (isWebhookParent(channel)) return { parent: channel };
  return null; // 음성 채널 채팅 등은 처리하지 않음
}

function isExcludedChannel(settings: GuildSettings, channel: GuildTextBasedChannel): boolean {
  const ids = [channel.id];
  if (channel.isThread() && channel.parentId) ids.push(channel.parentId);

  const excluded = settings.emojiEnlarge.excludedChannelIds;
  const nicknameChannelId = settings.nickname.channelId;
  return ids.some((id) => excluded.includes(id) || id === nicknameChannelId);
}

function hasRequiredPermissions(message: Message<true>, target: SendTarget): boolean {
  const me = message.guild.members.me;
  if (!me) return false;

  const canDelete = message.channel.permissionsFor(me).has(PermissionFlagsBits.ManageMessages);
  const canWebhook = target.parent.permissionsFor(me).has(PermissionFlagsBits.ManageWebhooks);
  if (canDelete && canWebhook) return true;

  if (!warnedChannels.has(message.channelId)) {
    warnedChannels.add(message.channelId);
    const missing = [!canDelete && '메시지 관리', !canWebhook && '웹후크 관리'].filter(Boolean).join(', ');
    console.warn(`[emoji] #${message.channel.name} (${message.channelId}) 권한 부족: ${missing}`);
  }
  return false;
}

async function findOrCreateWebhook(parent: WebhookParent): Promise<IncomingWebhook> {
  const botId = parent.client.user.id;
  const hooks = await parent.fetchWebhooks();
  const existing = hooks.find(
    (hook): hook is IncomingWebhook =>
      hook.isIncoming() && hook.applicationId === botId && hook.token !== null,
  );
  return existing ?? parent.createWebhook({ name: WEBHOOK_NAME, reason: '이모지 확대용 웹후크' });
}

function getWebhook(parent: WebhookParent): Promise<IncomingWebhook> {
  const cached = webhookCache.get(parent.id);
  if (cached) return cached;

  const pending = findOrCreateWebhook(parent).catch((error: unknown) => {
    webhookCache.delete(parent.id);
    throw error;
  });
  webhookCache.set(parent.id, pending);
  return pending;
}

export function forgetWebhook(channelId: string): void {
  webhookCache.delete(channelId);
  warnedChannels.delete(channelId);
}

/**
 * 웹후크 이름에는 "discord", "clyde"가 들어가면 전송이 거부됨
 * → 보이지 않는 문자(zero-width space)를 끼워 우회 (디스코드 정책 변경 시 동작이 달라질 수 있음)
 */
function toWebhookUsername(name: string): string {
  const cleaned = name
    .replace(/discord/gi, (m) => `${m.slice(0, 4)}\u200b${m.slice(4)}`)
    .replace(/clyde/gi, (m) => `${m.slice(0, 3)}\u200b${m.slice(3)}`)
    .trim()
    .slice(0, 80);
  return cleaned.length > 0 ? cleaned : '이름 없음';
}

function emojiUrl(emoji: ParsedEmoji): string {
  const ext = emoji.animated ? 'gif' : 'png';
  return `https://cdn.discordapp.com/emojis/${emoji.id}.${ext}?size=${EMOJI_SIZE}&quality=lossless`;
}

function isUnknownWebhook(error: unknown): boolean {
  return error instanceof DiscordAPIError && error.code === RESTJSONErrorCodes.UnknownWebhook;
}

async function sendViaWebhook(
  message: Message<true>,
  target: SendTarget,
  emoji: ParsedEmoji,
): Promise<{ webhook: IncomingWebhook; sentId: string }> {
  const payload = {
    username: toWebhookUsername(message.member?.displayName ?? message.author.displayName),
    avatarURL: (message.member ?? message.author).displayAvatarURL({ size: 128 }),
    files: [{ attachment: emojiUrl(emoji), name: `${emoji.name}.${emoji.animated ? 'gif' : 'png'}` }],
    allowedMentions: { parse: [] },
    ...(target.threadId ? { threadId: target.threadId } : {}),
  };

  const webhook = await getWebhook(target.parent);
  try {
    const sent = await webhook.send(payload);
    return { webhook, sentId: sent.id };
  } catch (error) {
    // 누군가 웹후크를 지웠으면 캐시를 비우고 1회 재시도
    if (!isUnknownWebhook(error)) throw error;
    forgetWebhook(target.parent.id);
    const retryHook = await getWebhook(target.parent);
    const sent = await retryHook.send(payload);
    return { webhook: retryHook, sentId: sent.id };
  }
}

export async function handleEmojiMessage(message: Message): Promise<void> {
  if (!message.inGuild()) return;
  if (message.author.bot || message.webhookId || message.system) return;
  // 첨부·스티커가 있거나 답장/전달 메시지면 다시 보낼 때 맥락이 사라지므로 그대로 둠
  if (message.attachments.size > 0 || message.stickers.size > 0 || message.reference) return;

  const emoji = parseSingleCustomEmoji(message.content);
  if (!emoji) return;

  const settings = getGuildSettings(message.guildId);
  if (!settings.emojiEnlarge.enabled) return;
  if (isExcludedChannel(settings, message.channel)) return;

  const target = resolveTarget(message.channel);
  if (!target) return;
  if (!hasRequiredPermissions(message, target)) return;

  // 전송 성공 후 원본 삭제 (전송 실패 시 원본이 남도록)
  const { webhook, sentId } = await sendViaWebhook(message, target, emoji);

  try {
    await message.delete();
  } catch (error) {
    if (error instanceof DiscordAPIError && error.code === RESTJSONErrorCodes.UnknownMessage) {
      return; // 그 사이에 작성자가 지웠음 → 확대본만 남김
    }
    // 원본 삭제에 실패하면 중복되지 않도록 확대본을 지움
    await webhook.deleteMessage(sentId, target.threadId).catch(() => undefined);
    throw error;
  }
}
