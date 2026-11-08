const seoulDateFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Seoul',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

const SEOUL_OFFSET_MS = 9 * 60 * 60 * 1000; // 한국은 서머타임 없음

/** Asia/Seoul 기준 자정부터 지난 분 (0~1439) */
export function seoulMinutesOfDay(date: Date = new Date()): number {
  const seoul = new Date(date.getTime() + SEOUL_OFFSET_MS);
  return seoul.getUTCHours() * 60 + seoul.getUTCMinutes();
}

/** Asia/Seoul 기준 날짜 문자열 (YYYY-MM-DD) */
export function seoulDateString(date: Date = new Date()): string {
  return seoulDateFormatter.format(date);
}
