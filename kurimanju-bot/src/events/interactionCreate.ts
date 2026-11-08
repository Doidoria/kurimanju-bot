import { Events, MessageFlags } from 'discord.js';
import { defineEvent } from '../types/event';
import { commandMap } from '../commands';

const ERROR_MESSAGE = '⚠️ 처리 중 오류가 발생했어요. 잠시 후 다시 시도해 주세요.';

export default defineEvent({
  name: Events.InteractionCreate,
  async execute(interaction) {
    if (!interaction.isChatInputCommand()) return;

    const command = commandMap.get(interaction.commandName);
    if (!command) return;

    try {
      await command.execute(interaction);
    } catch (error) {
      console.error(`[command:${interaction.commandName}]`, error);
      try {
        if (interaction.replied) {
          await interaction.followUp({ content: ERROR_MESSAGE, flags: MessageFlags.Ephemeral });
        } else if (interaction.deferred) {
          await interaction.editReply({ content: ERROR_MESSAGE });
        } else {
          await interaction.reply({ content: ERROR_MESSAGE, flags: MessageFlags.Ephemeral });
        }
      } catch (replyError) {
        console.error('[command] 에러 응답 실패', replyError);
      }
    }
  },
});
