import { Events } from 'discord.js';
import { defineEvent } from '../types/event';
import { handleEmojiMessage } from '../services/emojiEnlarge';
import { handleNicknameMessage } from '../services/nickname';

export default defineEvent({
  name: Events.MessageCreate,
  async execute(message) {
    // 별명 변경 채널은 이모지 확대에서 자동 제외되므로 두 기능이 같은 메시지를 동시에 처리하지 않음
    try {
      await handleNicknameMessage(message);
    } catch (error) {
      console.error(`[nickname] ${message.channelId} 처리 실패`, error);
    }

    try {
      await handleEmojiMessage(message);
    } catch (error) {
      console.error(`[emoji] ${message.channelId} 처리 실패`, error);
    }
  },
});
