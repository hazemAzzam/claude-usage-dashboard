// Pure, client-safe numeric helpers (no node:* imports, no server-only).
// Views/hooks use these instead of doing arithmetic inline.

/** Relative change (cur - prev) / prev. null when prev is 0/missing (no baseline). */
export function pctDelta(cur: number, prev: number | null | undefined): number | null {
  if (prev == null || prev === 0) return null;
  return (cur - prev) / Math.abs(prev);
}

/**
 * Trailing moving average. Output has the same length as the input. For the
 * first n-1 points the window is partial (mean of what exists so far), so the
 * result is always numbers — nothing is null; the return type stays nullable
 * so callers can treat "no data" uniformly.
 */
export function movingAverage(xs: number[], n = 7): (number | null)[] {
  n = Math.max(1, Math.floor(n)); // guard n <= 0 / fractions
  const out: (number | null)[] = [];
  let sum = 0;
  for (let i = 0; i < xs.length; i++) {
    sum += xs[i];
    if (i >= n) sum -= xs[i - n];
    out.push(sum / Math.min(i + 1, n));
  }
  return out;
}

/** Running total. */
export function cumulative(xs: number[]): number[] {
  let sum = 0;
  return xs.map((x) => (sum += x));
}

/** Median; 0 for an empty list. */
export function median(xs: number[]): number {
  if (xs.length === 0) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const mid = s.length >> 1;
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

/** part / total, 0 when total is 0. */
export function shareOf(part: number, total: number): number {
  return total === 0 ? 0 : part / total;
}

/**
 * Projected month-end total: (spend so far / daysElapsed) x daysInMonth.
 * `cumByDay[i]` is cumulative spend through day i+1; the value at day
 * `daysElapsed` is used (clamped to the series length, so trailing days with no
 * data at all still count as elapsed zero-spend days when the series is short).
 * 0 when there is no data or daysElapsed < 1.
 */
export function linearProjection(cumByDay: number[], daysElapsed: number, daysInMonth: number): number {
  if (cumByDay.length === 0 || daysElapsed < 1) return 0;
  const total = cumByDay[Math.min(Math.floor(daysElapsed), cumByDay.length) - 1];
  return (total / Math.floor(daysElapsed)) * daysInMonth;
}

/** Index/value points for chart libraries that want row objects. */
export function toSeries(xs: number[]): Array<{ i: number; v: number }> {
  return xs.map((v, i) => ({ i, v }));
}

/** part / count, 0 when count is 0 (an average). */
export function safeDiv(part: number, count: number): number {
  return count === 0 ? 0 : part / count;
}

/** Sum of a list. */
export function sum(xs: number[]): number {
  let s = 0;
  for (const x of xs) s += x;
  return s;
}

/**
 * Densify a per-day series: one row for EVERY local calendar day from
 * `fromKey` to `toKey` (inclusive, YYYY-MM-DD), taking existing rows as-is and
 * `make(day)` for gaps. Walks days with `new Date(y, m, d + 1)` so a DST
 * change can't skip or repeat a day. Rows outside the span are dropped.
 * Needed so moving averages and sparklines count idle days as $0.
 */
export function fillDays<T extends { day: string }>(
  rows: T[],
  fromKey: string,
  toKey: string,
  make: (day: string) => T,
): T[] {
  const byDay = new Map(rows.map((r) => [r.day, r]));
  const out: T[] = [];
  const [y, m, d] = fromKey.split("-").map(Number);
  for (let i = 0; i < 20_000; i++) {
    const dt = new Date(y, m - 1, d + i);
    const key = `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}-${String(dt.getDate()).padStart(2, "0")}`;
    if (key > toKey) break;
    out.push(byDay.get(key) ?? make(key));
  }
  return out;
}
