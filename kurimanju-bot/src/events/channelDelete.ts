import { Events } from 'discord.js';
import { defineEvent } from '../types/event';
import { forgetWebhook } from '../services/emojiEnlarge';

export default defineEvent({
  name: Events.ChannelDelete,
  async execute(channel) {
    forgetWebhook(channel.id);
  },
});
