import { cert, getApps, initializeApp, type App } from 'firebase-admin/app';
import { getFirestore, type Firestore } from 'firebase-admin/firestore';
import { requireEnv } from './env';

let db: Firestore | null = null;

/**
 * 처음 호출될 때 초기화 (deploy-commands처럼 DB가 필요 없는 스크립트는 Firebase 환경 변수를 요구하지 않음)
 */
export function getDb(): Firestore {
  if (db) return db;

  const app: App =
    getApps()[0] ??
    initializeApp({
      credential: cert({
        projectId: requireEnv('FIREBASE_PROJECT_ID'),
        clientEmail: requireEnv('FIREBASE_CLIENT_EMAIL'),
        // .env에서는 줄바꿈이 문자 그대로 "\n"으로 들어오므로 실제 줄바꿈으로 변환
        privateKey: requireEnv('FIREBASE_PRIVATE_KEY').replace(/\\n/g, '\n'),
      }),
    });

  db = getFirestore(app);
  return db;
}