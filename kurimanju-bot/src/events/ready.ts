import { ActivityType, Events } from 'discord.js';
import { defineEvent } from '../types/event';
import { subscribeGuildSettings } from '../services/guildSettings';
import { loadFonts } from '../services/welcomeCard';
import { startDailyNoticeScheduler } from '../services/dailyNotice';

export default defineEvent({
  name: Events.ClientReady,
  once: true,
  async execute(client) {
    loadFonts();
    for (const guild of client.guilds.cache.values()) {
      subscribeGuildSettings(guild.id);
    }
    startDailyNoticeScheduler(client);
    client.user.setActivity('밤만쥬 굽는 중', { type: ActivityType.Custom });
    console.log(`[ready] ${client.user.tag} 로그인 · 서버 ${client.guilds.cache.size}개 설정 구독`);
  },
});
