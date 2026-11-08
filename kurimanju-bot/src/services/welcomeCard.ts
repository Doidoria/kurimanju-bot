import { existsSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import {
  GlobalFonts,
  createCanvas,
  loadImage,
  type Image,
  type SKRSContext2D,
} from '@napi-rs/canvas';
import type { BackgroundStyle } from './settingsSchema';

/**
 * 환영 카드 (1024x500, PNG)
 * - 기본: 밤만쥬 웜톤 그라데이션 + 빛망울
 * - 배경 이미지 지정 시 (같은 레이아웃)
 *   - photo: 배경을 흐리게 + 전체 어두운 오버레이
 *   - illustration: 선명하게 + 하단 글자 영역만 그라데이션, 글자 그림자 강화
 * - 생성 시간: 수십 ms + 프로필 사진 다운로드 / 동시 렌더링 2개로 제한해 메모리 급증 방지
 */

export const CARD_WIDTH = 1024;
export const CARD_HEIGHT = 500;

const ROOT = resolve(__dirname, '../..');
export const FONT_DIR = join(ROOT, 'assets', 'fonts');

const FONT_FAMILY = 'Pretendard';
const AVATAR_TIMEOUT_MS = 5_000;
const MAX_CONCURRENT_RENDERS = 2;

const COLORS = {
  cream: '#fff7ea',
  creamSoft: 'rgba(255, 247, 234, 0.78)',
  gold: '#f3d9a4',
  caramel: '#c8874a',
  chestnut: '#6b3e22',
  cocoa: '#2b1a12',
} as const;

export interface WelcomeCardInput {
  displayName: string;
  avatarUrl: string;
  serverName: string;
  memberCount: number;
  background: { image: Image; style: BackgroundStyle } | null;
}

let fontsLoaded = false;

/** assets/fonts의 .otf/.ttf를 모두 등록 (파일 안의 패밀리명·굵기를 그대로 사용) */
export function loadFonts(): void {
  if (fontsLoaded) return;
  fontsLoaded = true;

  if (!existsSync(FONT_DIR)) {
    console.warn(`[welcome] 폰트 폴더 없음: ${FONT_DIR} → 한글이 깨질 수 있어요`);
    return;
  }
  const files = readdirSync(FONT_DIR).filter((f) => /\.(otf|ttf)$/i.test(f));
  for (const file of files) GlobalFonts.registerFromPath(join(FONT_DIR, file));
  if (!GlobalFonts.has(FONT_FAMILY)) {
    console.warn(`[welcome] ${FONT_FAMILY} 폰트를 찾지 못했어요 (등록된 파일 ${files.length}개)`);
  }
}

function font(weight: number, size: number): string {
  return `${weight} ${size}px ${FONT_FAMILY}, sans-serif`;
}

/* ---------- 동시 렌더링 제한 ---------- */

let running = 0;
const waiting: (() => void)[] = [];

async function withRenderSlot<T>(task: () => Promise<T>): Promise<T> {
  if (running >= MAX_CONCURRENT_RENDERS) {
    await new Promise<void>((resolveSlot) => waiting.push(resolveSlot));
  }
  running++;
  try {
    return await task();
  } finally {
    running--;
    waiting.shift()?.();
  }
}

/* ---------- 이미지 로드 ---------- */

async function fetchImage(url: string): Promise<Image | null> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(AVATAR_TIMEOUT_MS) });
    if (!res.ok) return null;
    return await loadImage(Buffer.from(await res.arrayBuffer()));
  } catch {
    return null;
  }
}

/* ---------- 그리기 도우미 ---------- */

function drawCover(ctx: SKRSContext2D, image: Image, width: number, height: number): void {
  const scale = Math.max(width / image.width, height / image.height);
  const w = image.width * scale;
  const h = image.height * scale;
  ctx.drawImage(image, (width - w) / 2, (height - h) / 2, w, h);
}

function ellipsize(ctx: SKRSContext2D, text: string, maxWidth: number): string {
  if (ctx.measureText(text).width <= maxWidth) return text;
  const chars = [...text]; // 서로게이트 쌍(이모지 등)이 잘리지 않도록
  let end = chars.length;
  while (end > 0 && ctx.measureText(`${chars.slice(0, end).join('')}…`).width > maxWidth) end--;
  return `${chars.slice(0, end).join('').trimEnd()}…`;
}

/** 글자 간격을 넓혀 가운데 정렬 */
function drawSpacedText(ctx: SKRSContext2D, text: string, centerX: number, y: number, spacing: number): void {
  const chars = [...text];
  const widths = chars.map((c) => ctx.measureText(c).width);
  const total = widths.reduce((a, b) => a + b, 0) + spacing * (chars.length - 1);
  let x = centerX - total / 2;
  ctx.textAlign = 'left';
  chars.forEach((c, i) => {
    ctx.fillText(c, x, y);
    x += (widths[i] ?? 0) + spacing;
  });
  ctx.textAlign = 'center';
}

function roundRectPath(ctx: SKRSContext2D, x: number, y: number, w: number, h: number, r: number): void {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function drawGlow(ctx: SKRSContext2D, x: number, y: number, radius: number, color: string): void {
  const g = ctx.createRadialGradient(x, y, 0, x, y, radius);
  g.addColorStop(0, color);
  g.addColorStop(1, 'rgba(0, 0, 0, 0)');
  ctx.fillStyle = g;
  ctx.fillRect(x - radius, y - radius, radius * 2, radius * 2);
}

function drawDefaultBackground(ctx: SKRSContext2D): void {
  const bg = ctx.createLinearGradient(0, 0, CARD_WIDTH, CARD_HEIGHT);
  bg.addColorStop(0, COLORS.cocoa);
  bg.addColorStop(0.55, COLORS.chestnut);
  bg.addColorStop(1, COLORS.caramel);
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, CARD_WIDTH, CARD_HEIGHT);

  // 흐릿한 빛망울
  drawGlow(ctx, 170, 90, 260, 'rgba(243, 217, 164, 0.22)');
  drawGlow(ctx, 900, 430, 300, 'rgba(255, 190, 120, 0.25)');
  drawGlow(ctx, 760, 40, 160, 'rgba(255, 247, 234, 0.10)');
  drawGlow(ctx, 512, 210, 230, 'rgba(255, 220, 170, 0.16)');
}

function drawIllustrationBackground(ctx: SKRSContext2D, image: Image): void {
  drawCover(ctx, image, CARD_WIDTH, CARD_HEIGHT);

  // 글자 영역(하단)만 어둡게
  const bottom = ctx.createLinearGradient(0, 270, 0, CARD_HEIGHT);
  bottom.addColorStop(0, 'rgba(25, 14, 8, 0)');
  bottom.addColorStop(0.45, 'rgba(25, 14, 8, 0.42)');
  bottom.addColorStop(1, 'rgba(25, 14, 8, 0.7)');
  ctx.fillStyle = bottom;
  ctx.fillRect(0, 270, CARD_WIDTH, CARD_HEIGHT - 270);
}

function drawPhotoBackground(ctx: SKRSContext2D, image: Image): void {
  ctx.save();
  ctx.filter = 'blur(6px)';
  // 블러 가장자리가 비치지 않도록 조금 크게
  ctx.translate(-20, -20);
  drawCover(ctx, image, CARD_WIDTH + 40, CARD_HEIGHT + 40);
  ctx.restore();

  const overlay = ctx.createLinearGradient(0, 0, 0, CARD_HEIGHT);
  overlay.addColorStop(0, 'rgba(25, 14, 8, 0.45)');
  overlay.addColorStop(1, 'rgba(25, 14, 8, 0.78)');
  ctx.fillStyle = overlay;
  ctx.fillRect(0, 0, CARD_WIDTH, CARD_HEIGHT);
}

function drawFrame(ctx: SKRSContext2D): void {
  ctx.save();
  roundRectPath(ctx, 18, 18, CARD_WIDTH - 36, CARD_HEIGHT - 36, 28);
  ctx.strokeStyle = 'rgba(255, 247, 234, 0.18)';
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.restore();
}

function drawAvatar(ctx: SKRSContext2D, avatar: Image | null, cx: number, cy: number, r: number): void {
  // 링 바깥 그림자
  ctx.save();
  ctx.shadowColor = 'rgba(0, 0, 0, 0.45)';
  ctx.shadowBlur = 30;
  ctx.shadowOffsetY = 8;
  ctx.beginPath();
  ctx.arc(cx, cy, r + 10, 0, Math.PI * 2);
  ctx.fillStyle = COLORS.cocoa;
  ctx.fill();
  ctx.restore();

  // 그라데이션 링
  const ring = ctx.createLinearGradient(cx - r, cy - r, cx + r, cy + r);
  ring.addColorStop(0, COLORS.gold);
  ring.addColorStop(0.5, COLORS.cream);
  ring.addColorStop(1, COLORS.caramel);
  ctx.beginPath();
  ctx.arc(cx, cy, r + 8, 0, Math.PI * 2);
  ctx.fillStyle = ring;
  ctx.fill();

  // 프로필 사진 (불러오기 실패 시 그라데이션 원)
  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.closePath();
  ctx.clip();
  if (avatar) {
    ctx.drawImage(avatar, cx - r, cy - r, r * 2, r * 2);
  } else {
    const fallback = ctx.createLinearGradient(cx - r, cy - r, cx + r, cy + r);
    fallback.addColorStop(0, COLORS.chestnut);
    fallback.addColorStop(1, COLORS.caramel);
    ctx.fillStyle = fallback;
    ctx.fillRect(cx - r, cy - r, r * 2, r * 2);
  }
  ctx.restore();
}

/* ---------- 메인 ---------- */

export async function renderWelcomeCard(input: WelcomeCardInput): Promise<Buffer> {
  loadFonts();

  return withRenderSlot(async () => {
    const avatar = await fetchImage(input.avatarUrl);

    const canvas = createCanvas(CARD_WIDTH, CARD_HEIGHT);
    const ctx = canvas.getContext('2d');

    if (!input.background) drawDefaultBackground(ctx);
    else if (input.background.style === 'illustration') drawIllustrationBackground(ctx, input.background.image);
    else drawPhotoBackground(ctx, input.background.image);

    // 밝은 일러스트 위에서도 글자가 읽히도록 그림자 강화
    const strongShadow = input.background?.style === 'illustration';
    drawFrame(ctx);

    const centerX = CARD_WIDTH / 2;
    drawAvatar(ctx, avatar, centerX, 175, 100);

    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';

    // WELCOME
    ctx.save();
    ctx.shadowColor = 'rgba(0, 0, 0, 0.55)';
    ctx.shadowBlur = strongShadow ? 10 : 0;
    ctx.font = font(600, 24);
    ctx.fillStyle = COLORS.gold;
    drawSpacedText(ctx, 'WELCOME', centerX, 340, 10);
    ctx.restore();

    // 이름
    ctx.save();
    ctx.shadowColor = strongShadow ? 'rgba(0, 0, 0, 0.7)' : 'rgba(0, 0, 0, 0.45)';
    ctx.shadowBlur = strongShadow ? 20 : 16;
    ctx.shadowOffsetY = 4;
    ctx.font = font(800, 58);
    ctx.fillStyle = COLORS.cream;
    ctx.fillText(ellipsize(ctx, input.displayName, 860), centerX, 405);
    ctx.restore();

    // 서버 이름 · N번째 멤버
    ctx.save();
    ctx.shadowColor = 'rgba(0, 0, 0, 0.6)';
    ctx.shadowBlur = strongShadow ? 10 : 0;
    ctx.font = font(strongShadow ? 600 : 400, 26);
    ctx.fillStyle = strongShadow ? COLORS.cream : COLORS.creamSoft;
    const sub = `${input.serverName} · ${input.memberCount.toLocaleString('ko-KR')}번째 멤버`;
    ctx.fillText(ellipsize(ctx, sub, 860), centerX, 450);
    ctx.restore();

    return canvas.encode('png');
  });
}

/** 배경 이미지를 카드 크기로 맞춰 PNG로 변환 (저장용) */
export async function normalizeBackground(source: Buffer): Promise<Buffer> {
  const image = await loadImage(source);
  const canvas = createCanvas(CARD_WIDTH, CARD_HEIGHT);
  drawCover(canvas.getContext('2d'), image, CARD_WIDTH, CARD_HEIGHT);
  return canvas.encode('png');
}

export { loadImage };
