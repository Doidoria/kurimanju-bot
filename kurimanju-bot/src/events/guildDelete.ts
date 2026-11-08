import { Events } from 'discord.js';
import { defineEvent } from '../types/event';
import { unsubscribeGuildSettings } from '../services/guildSettings';

export default defineEvent({
  name: Events.GuildDelete,
  async execute(guild) {
    // 서버 장애(unavailable)일 때도 발생하지만, 복구되면 guildCreate로 다시 구독됨
    unsubscribeGuildSettings(guild.id);
    console.log(`[guildDelete] ${guild.id} → 설정 구독 해제`);
  },
});
