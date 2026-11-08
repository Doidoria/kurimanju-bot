import { Events } from 'discord.js';
import { defineEvent } from '../types/event';
import { subscribeGuildSettings } from '../services/guildSettings';

export default defineEvent({
  name: Events.GuildCreate,
  async execute(guild) {
    subscribeGuildSettings(guild.id);
    console.log(`[guildCreate] ${guild.name} (${guild.id}) 참가 → 설정 구독`);
  },
});
