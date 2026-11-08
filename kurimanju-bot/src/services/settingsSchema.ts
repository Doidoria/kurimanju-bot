/**
 * guilds/{guildId} 문서 구조
 * 2~4단계에서 항목을 추가할 때: GuildSettings 타입 → defaultSettings() → normalizeSettings() 순서로 추가
 */

interface FeatureMeta {
  ko: string;
  en: string;
  usesChannel: boolean;
}

export const FEATURES = {
  emojiEnlarge: { ko: '이모지 확대', en: 'Emoji enlarge', usesChannel: false },
  nickname: { ko: '별명 변경', en: 'Nickname change', usesChannel: true },
  welcome: { ko: '입장 인사', en: 'Welcome message', usesChannel: true },
  dailyNotice: { ko: '매일 알림', en: 'Daily notice', usesChannel: true },
} as const satisfies Record<string, FeatureMeta>;

export type FeatureKey = keyof typeof FEATURES;

/** 채널 지정이 필요한 기능만 */
export type ChannelFeatureKey = {
  [K in FeatureKey]: (typeof FEATURES)[K]['usesChannel'] extends true ? K : never;
}[FeatureKey];

export const FEATURE_KEYS = Object.keys(FEATURES) as FeatureKey[];
export const CHANNEL_FEATURE_KEYS = FEATURE_KEYS.filter(
  (key): key is ChannelFeatureKey => FEATURES[key].usesChannel,
);

export function isFeatureKey(value: string): value is FeatureKey {
  return (FEATURE_KEYS as string[]).includes(value);
}

export function isChannelFeatureKey(value: string): value is ChannelFeatureKey {
  return (CHANNEL_FEATURE_KEYS as string[]).includes(value);
}

/** 이모지 확대 제외 채널 최대 개수 (설정 문서 크기 관리용) */
export const MAX_EMOJI_EXCLUDED_CHANNELS = 25;

/**
 * 환영 카드 배경 스타일
 * - photo: 배경을 흐리게 + 전체를 어둡게 (사진용)
 * - illustration: 선명하게 + 하단 글자 영역만 그라데이션 (일러스트용)
 */
export const BACKGROUND_STYLES = ['photo', 'illustration'] as const;
export type BackgroundStyle = (typeof BACKGROUND_STYLES)[number];

export function isBackgroundStyle(value: string): value is BackgroundStyle {
  return (BACKGROUND_STYLES as readonly string[]).includes(value);
}

/** 매일 알림 */
export const MAX_DAILY_NOTICE_LENGTH = 1000;
export const DEFAULT_DAILY_NOTICE_TIME = '21:45';
export const DEFAULT_DAILY_NOTICE_MESSAGE = '@everyone\n\n10시까지 길퀘하실분 길팜으로 모여주세요!';

/** "HH:MM" (24시간) 또는 "H:MM" → "HH:MM", 형식이 틀리면 null */
export function parseNoticeTime(value: string): string | null {
  const match = /^\s*([01]?\d|2[0-3])\s*:\s*([0-5]\d)\s*$/.exec(value);
  if (!match?.[1] || !match[2]) return null;
  return `${match[1].padStart(2, '0')}:${match[2]}`;
}

/** 환영 문구 최대 길이 */
export const MAX_WELCOME_MESSAGE_LENGTH = 500;

export interface GuildSettings {
  emojiEnlarge: { enabled: boolean; excludedChannelIds: string[] };
  nickname: { enabled: boolean; channelId: string | null };
  welcome: {
    enabled: boolean;
    channelId: string | null;
    /** null이면 기본 문구 */
    message: string | null;
    /** data/backgrounds/ 안의 파일명 ({guildId}.png), null이면 기본 디자인 */
    backgroundFile: string | null;
    backgroundStyle: BackgroundStyle;
  };
  dailyNotice: {
    enabled: boolean;
    channelId: string | null;
    /** Asia/Seoul 기준 "HH:MM" */
    time: string;
    message: string;
    /** 마지막으로 보낸 날짜 (YYYY-MM-DD) — 재시작 시 중복 전송 방지 */
    lastSentDate: string | null;
  };
}

/** set(..., { merge: true })에 넘길 부분 업데이트 */
export type SettingsPatch = { [K in keyof GuildSettings]?: Partial<GuildSettings[K]> };

export function defaultSettings(): GuildSettings {
  return {
    emojiEnlarge: { enabled: false, excludedChannelIds: [] },
    nickname: { enabled: false, channelId: null },
    welcome: { enabled: false, channelId: null, message: null, backgroundFile: null, backgroundStyle: 'photo' },
    dailyNotice: {
      enabled: false,
      channelId: null,
      time: DEFAULT_DAILY_NOTICE_TIME,
      message: DEFAULT_DAILY_NOTICE_MESSAGE,
      lastSentDate: null,
    },
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readBool(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback;
}

function readSnowflake(value: unknown): string | null {
  return typeof value === 'string' && /^\d{17,20}$/.test(value) ? value : null;
}

function readSnowflakeList(value: unknown, max: number): string[] {
  if (!Array.isArray(value)) return [];
  const ids = value.map(readSnowflake).filter((id): id is string => id !== null);
  return [...new Set(ids)].slice(0, max);
}

function readText(value: unknown, max: number): string | null {
  if (typeof value !== 'string') return null;
  const text = value.trim();
  return text.length > 0 ? text.slice(0, max) : null;
}

/** 경로 조작 방지: {snowflake}.png 형식만 허용 */
function readBackgroundFile(value: unknown): string | null {
  return typeof value === 'string' && /^\d{17,20}\.png$/.test(value) ? value : null;
}

function section(raw: Record<string, unknown>, key: string): Record<string, unknown> {
  const value = raw[key];
  return isRecord(value) ? value : {};
}

/**
 * Firestore 콘솔에서 직접 수정해 타입이 틀어진 값이 있어도 기본값으로 대체
 */
export function normalizeSettings(raw: unknown): GuildSettings {
  const d = defaultSettings();
  if (!isRecord(raw)) return d;

  const emoji = section(raw, 'emojiEnlarge');
  const nick = section(raw, 'nickname');
  const welcome = section(raw, 'welcome');
  const notice = section(raw, 'dailyNotice');

  return {
    emojiEnlarge: {
      enabled: readBool(emoji.enabled, d.emojiEnlarge.enabled),
      excludedChannelIds: readSnowflakeList(emoji.excludedChannelIds, MAX_EMOJI_EXCLUDED_CHANNELS),
    },
    nickname: {
      enabled: readBool(nick.enabled, d.nickname.enabled),
      channelId: readSnowflake(nick.channelId),
    },
    welcome: {
      enabled: readBool(welcome.enabled, d.welcome.enabled),
      channelId: readSnowflake(welcome.channelId),
      message: readText(welcome.message, MAX_WELCOME_MESSAGE_LENGTH),
      backgroundFile: readBackgroundFile(welcome.backgroundFile),
      backgroundStyle:
        typeof welcome.backgroundStyle === 'string' && isBackgroundStyle(welcome.backgroundStyle)
          ? welcome.backgroundStyle
          : d.welcome.backgroundStyle,
    },
    dailyNotice: {
      enabled: readBool(notice.enabled, d.dailyNotice.enabled),
      channelId: readSnowflake(notice.channelId),
      time: (typeof notice.time === 'string' ? parseNoticeTime(notice.time) : null) ?? d.dailyNotice.time,
      message: readText(notice.message, MAX_DAILY_NOTICE_LENGTH) ?? d.dailyNotice.message,
      lastSentDate:
        typeof notice.lastSentDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(notice.lastSentDate)
          ? notice.lastSentDate
          : null,
    },
  };
}
