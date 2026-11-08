import { existsSync } from 'node:fs';
import { config } from 'dotenv';

/**
 * --env=prod → .env.prod, 없으면 .env (테스트)
 * Windows에서도 동작하도록 환경 변수 대신 실행 인자로 선택
 */
const envName = process.argv.find((arg) => arg.startsWith('--env='))?.slice('--env='.length);
const envPath = envName ? `.env.${envName}` : '.env';

if (!existsSync(envPath)) {
  throw new Error(`${envPath} 파일이 없습니다.`);
}
config({ path: envPath, quiet: true });
console.log(`[env] ${envPath} 사용`);

export function requireEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`환경 변수 ${name}이(가) 비어 있습니다. ${envPath} 파일을 확인하세요.`);
  }
  return value;
}

export function listEnv(name: string): string[] {
  return (process.env[name] ?? '')
    .split(',')
    .map((v) => v.trim())
    .filter((v) => v.length > 0);
}