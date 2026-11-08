import { Events } from 'discord.js';
import { defineEvent } from '../types/event';

export default defineEvent({
  name: Events.Error,
  async execute(error) {
    console.error('[client:error]', error);
  },
});
