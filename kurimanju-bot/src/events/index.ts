import type { Client, ClientEvents } from 'discord.js';
import type { BotEvent } from '../types/event';
import ready from './ready';
import guildCreate from './guildCreate';
import guildDelete from './guildDelete';
import interactionCreate from './interactionCreate';
import error from './error';
import messageCreate from './messageCreate';
import channelDelete from './channelDelete';
import guildMemberAdd from './guildMemberAdd';

function register<K extends keyof ClientEvents>(client: Client, event: BotEvent<K>): void {
  const listener = (...args: ClientEvents[K]): void => {
    event.execute(...args).catch((err: unknown) => {
      console.error(`[event:${String(event.name)}]`, err);
    });
  };
  if (event.once) client.once(event.name, listener);
  else client.on(event.name, listener);
}

// 이벤트 추가 시 여기에 등록
export function registerEvents(client: Client): void {
  register(client, ready);
  register(client, guildCreate);
  register(client, guildDelete);
  register(client, interactionCreate);
  register(client, error);
  register(client, messageCreate);
  register(client, channelDelete);
  register(client, guildMemberAdd);
}
