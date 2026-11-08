import { requireEnv } from './lib/env';
import { client } from './lib/client';
import { registerEvents } from './events';
import { unsubscribeAllGuildSettings } from './services/guildSettings';
import { stopDailyNoticeScheduler } from './services/dailyNotice';

registerEvents(client);

process.on('unhandledRejection', (reason) => {
  console.error('[unhandledRejection]', reason);
});

let shuttingDown = false;

async function shutdown(signal: string): Promise<void> {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`[shutdown] ${signal} 수신, 종료합니다`);
  try {
    stopDailyNoticeScheduler();
    unsubscribeAllGuildSettings();
    await client.destroy();
  } finally {
    process.exit(0);
  }
}

process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('SIGTERM', () => void shutdown('SIGTERM'));

client.login(requireEnv('DISCORD_TOKEN')).catch((error: unknown) => {
  console.error('[login] 로그인 실패 (토큰 확인)', error);
  process.exit(1);
});
