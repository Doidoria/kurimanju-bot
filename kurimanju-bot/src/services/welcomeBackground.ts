import { mkdir, readFile, unlink, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import type { Attachment } from 'discord.js';
import type { Image } from '@napi-rs/canvas';
import { loadImage, normalizeBackground } from './welcomeCard';

/**
 * 환영 카드 배경 이미지
 * - 디스코드 첨부 URL은 시간이 지나면 만료되므로, 받을 때 1024x500 PNG로 변환해 봇 PC의 data/backgrounds/에 저장
 * - Firestore 설정에는 파일명만 저장 (Storage를 쓰지 않아 무료, 대신 봇을 다른 PC로 옮기면 파일도 함께 옮겨야 함)
 * - 디코딩한 이미지는 길드별로 메모리 캐시
 */

const BACKGROUND_DIR = join(resolve(__dirname, '../..'), 'data', 'backgrounds');
const MAX_UPLOAD_BYTES = 8 * 1024 * 1024;
const ALLOWED_TYPES = ['image/png', 'image/jpeg', 'image/webp'];

const imageCache = new Map<string, Image>();

export function backgroundFileName(guildId: string): string {
  return `${guildId}.png`;
}

export type SaveBackgroundResult = { ok: true; fileName: string } | { ok: false; reason: string };

export async function saveBackground(guildId: string, attachment: Attachment): Promise<SaveBackgroundResult> {
  const type = attachment.contentType?.split(';')[0]?.trim() ?? '';
  if (!ALLOWED_TYPES.includes(type)) {
    return { ok: false, reason: 'PNG, JPG, WEBP 이미지만 사용할 수 있어요.' };
  }
  if (attachment.size > MAX_UPLOAD_BYTES) {
    return { ok: false, reason: '8MB 이하 이미지만 사용할 수 있어요.' };
  }

  const res = await fetch(attachment.url, { signal: AbortSignal.timeout(10_000) });
  if (!res.ok) return { ok: false, reason: '이미지를 내려받지 못했어요. 다시 시도해 주세요.' };

  let png: Buffer;
  try {
    png = await normalizeBackground(Buffer.from(await res.arrayBuffer()));
  } catch {
    return { ok: false, reason: '이미지를 읽을 수 없어요. 다른 파일로 시도해 주세요.' };
  }

  const fileName = backgroundFileName(guildId);
  await mkdir(BACKGROUND_DIR, { recursive: true });
  await writeFile(join(BACKGROUND_DIR, fileName), png);
  imageCache.set(guildId, await loadImage(png));
  return { ok: true, fileName };
}

export async function deleteBackground(guildId: string): Promise<void> {
  imageCache.delete(guildId);
  await unlink(join(BACKGROUND_DIR, backgroundFileName(guildId))).catch(() => undefined);
}

/** 설정에 파일명이 있어도 파일이 없거나 깨졌으면 null → 기본 디자인 */
export async function getBackground(guildId: string, fileName: string | null): Promise<Image | null> {
  if (!fileName) return null;
  const cached = imageCache.get(guildId);
  if (cached) return cached;

  try {
    const image = await loadImage(await readFile(join(BACKGROUND_DIR, fileName)));
    imageCache.set(guildId, image);
    return image;
  } catch {
    console.warn(`[welcome] 배경 파일을 불러오지 못함: ${fileName} → 기본 디자인 사용`);
    return null;
  }
}
