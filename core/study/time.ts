/** Short durations for the rating buttons and the done screen: "<1m", "10m", "3h", "4d", "2.5mo", "1.2y". */

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/** One decimal, dropped when it is 0: 2.5, 3. */
function oneDecimal(x: number): string {
  const r = Math.round(x * 10) / 10;
  return Number.isInteger(r) ? String(r) : r.toFixed(1);
}

export function formatInterval(ms: number): string {
  const t = Math.max(0, ms);
  if (t < MINUTE) return '<1m';
  if (t < HOUR) return `${Math.round(t / MINUTE)}m`;
  if (t < DAY) return `${oneDecimal(t / HOUR)}h`;
  const days = t / DAY;
  if (days < 30) return `${Math.round(days)}d`;
  if (days < 365) return `${oneDecimal(days / 30)}mo`;
  return `${oneDecimal(days / 365)}y`;
}
