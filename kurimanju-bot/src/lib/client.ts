import { Client, GatewayIntentBits } from 'discord.js';

export const client = new Client({
  intents: [
    // 길드·채널 캐시, 슬래시 커맨드, 길드 입장/퇴장 이벤트
    GatewayIntentBits.Guilds,
    // 2·3단계: 메시지 수신 (이모지 확대, 별명 변경 채널)
    GatewayIntentBits.GuildMessages,
    // 2·3단계 [Privileged]: 메시지 내용 읽기 (이모지만 있는지 판별, 입력한 별명 읽기)
    GatewayIntentBits.MessageContent,
    // 3·4단계 [Privileged]: 멤버 입장 이벤트(guildMemberAdd), 멤버 정보로 별명 변경
    GatewayIntentBits.GuildMembers,
  ],
});
