import { Events } from 'discord.js';
import { defineEvent } from '../types/event';
import { handleMemberJoin } from '../services/welcome';

export default defineEvent({
  name: Events.GuildMemberAdd,
  async execute(member) {
    try {
      await handleMemberJoin(member);
    } catch (error) {
      console.error(`[welcome] ${member.guild.id}/${member.id} 처리 실패`, error);
    }
  },
});
