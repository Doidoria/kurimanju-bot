// 쿠리만쥬 봇 pm2 설정 (레벨링 봇과 별도 프로세스)
// 사용: npm run build → pm2 start ecosystem.config.js → pm2 save
module.exports = {
  apps: [
    {
      name: 'kurimanju-bot',
      cwd: __dirname,
      script: 'dist/index.js',
      args: '--env=prod', // .env.prod 사용

      // 단일 쓰기 주체 전제 (별명 횟수, 웹후크 캐시) → 반드시 fork 1개
      exec_mode: 'fork',
      instances: 1,

      autorestart: true,
      restart_delay: 5000, // 토큰 오류 등으로 반복 재시작할 때 디스코드 로그인 남용 방지
      max_restarts: 10,
      min_uptime: '30s',
      max_memory_restart: '400M', // 환영 카드 렌더링 포함 여유값
      kill_timeout: 10000, // 종료 처리(리스너 해제, 연결 종료) 시간

      time: true, // 로그에 시각 표시
      env: {
        NODE_ENV: 'production',
      },
    },
  ],
};
