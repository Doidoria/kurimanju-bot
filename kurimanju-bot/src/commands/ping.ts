import { InteractionContextType, MessageFlags, SlashCommandBuilder } from 'discord.js';
import type { Command } from '../types/command';

const ping: Command = {
  data: new SlashCommandBuilder()
    .setName('ping')
    .setDescription('Check if Kurimanju is awake')
    .setDescriptionLocalizations({ ko: '쿠리만쥬가 깨어 있는지 확인해요' })
    .setContexts(InteractionContextType.Guild),

  async execute(interaction) {
    const ws = interaction.client.ws.ping;
    await interaction.reply({
      content: `🌰 퐁! 게이트웨이 지연: ${ws >= 0 ? `${ws}ms` : '측정 중'}`,
      flags: MessageFlags.Ephemeral,
    });
  },
};

export default ping;
