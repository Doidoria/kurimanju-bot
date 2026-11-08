import { REST, Routes } from 'discord.js';
import { listEnv, requireEnv } from './lib/env';
import { commands } from './commands';

async function main(): Promise<void> {
  const token = requireEnv('DISCORD_TOKEN');
  const clientId = requireEnv('DISCORD_CLIENT_ID');
  const guildIds = listEnv('DEPLOY_GUILD_IDS');

  if (guildIds.length === 0) {
    throw new Error('DEPLOY_GUILD_IDS가 비어 있습니다. 테스트 서버 ID를 넣어 주세요.');
  }

  const rest = new REST().setToken(token);
  const body = commands.map((command) => command.data.toJSON());

  // 길드 단위 등록: 즉시 반영, 같은 목록으로 덮어쓰므로 삭제된 커맨드도 정리됨
  for (const guildId of guildIds) {
    await rest.put(Routes.applicationGuildCommands(clientId, guildId), { body });
    console.log(`[deploy] ${guildId}: 커맨드 ${body.length}개 등록`);
  }
}

main().catch((error: unknown) => {
  console.error('[deploy] 실패', error);
  process.exit(1);
});
