import type { Command } from '../types/command';
import ping from './ping';
import settings from './settings';

// 커맨드 추가 시 여기에 등록
export const commands: readonly Command[] = [ping, settings];

export const commandMap: ReadonlyMap<string, Command> = new Map(
  commands.map((command) => [command.data.name, command]),
);
