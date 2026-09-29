export function usd(n: number): string {
  if (!isFinite(n)) return "$0.00";
  if (Math.abs(n) >= 1000) return `$${(n / 1000).toFixed(2)}k`;
  return `$${n.toFixed(2)}`;
}

export function usdExact(n: number): string {
  return n.toLocaleString("en-US", { style: "currency", currency: "USD" });
}

// Small per-unit amounts (e.g. cost per message) where two decimals round away
// the signal — shows up to 4 fraction digits so sub-cent values stay visible.
export function usdFine(n: number): string {
  if (!isFinite(n)) return "$0.00";
  return n.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 4,
  });
}

export function tokens(n: number): string {
  if (n >= 1e9) return `${(n / 1e9).toFixed(2)}B`;
  if (n >= 1e6) return `${(n / 1e6).toFixed(2)}M`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(1)}k`;
  return `${n}`;
}

export function num(n: number): string {
  return n.toLocaleString("en-US");
}

/** "1 msg" / "721 msgs" — count with thousands separators plus a noun that takes a plain "s" in the plural. */
export function fmtCount(n: number, noun: string): string {
  return `${num(n)} ${noun}${n === 1 ? "" : "s"}`;
}

export function shortDay(day: string): string {
  // YYYY-MM-DD -> "Jun 8"
  const [, m, d] = day.split("-").map(Number);
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return `${months[m - 1]} ${d}`;
}

// Share of all input volume served cheaply from cache (cache reads ≈ 10% of
// input price). Shared by the Daily and Efficiency views' derivation hooks —
// kept here rather than duplicated in each hook file.
export function cacheShare(t: { input: number; cacheCreate: number; cacheRead: number }): number {
  const denom = t.input + t.cacheCreate + t.cacheRead;
  return denom > 0 ? (t.cacheRead / denom) * 100 : 0;
}

// "claude-opus-4-8-20250101" -> "opus-4-8". Lives here (not in components/)
// so hooks can build labels without importing from the UI layer.
export function shortModel(m: string): string {
  return m.replace(/^claude-/, "").replace(/-\d{8}$/, "");
}

// One colour per model FAMILY (matches the design mockups): opus chart-1,
// sonnet chart-2, fable chart-3, haiku chart-4, anything else chart-5. The
// family colour is fixed by construction, so it is the same on every page and
// under every filter. Several versions of one family (opus-4-1 vs opus-4-8)
// are told apart by an alpha step of the family colour, assigned in the order
// `modelPalette` receives them (pass `Summary.allModels`: cost desc over ALL
// records, so a version keeps its step across filters): the first version is
// full strength, later ones 0.72, 0.5, 0.36 (then repeat 0.36). Colours are
// tokens only, never hard-coded.
const FAMILY_CHART: Array<[string, number]> = [
  ["opus", 1],
  ["sonnet", 2],
  ["fable", 3],
  ["haiku", 4],
];
const OTHER_CHART = 5;
const VERSION_ALPHA = [1, 0.72, 0.5, 0.36];
const normModel = (model: string) => model.toLowerCase().replace(/-\d{8}$/, "");
const familyChart = (id: string) => FAMILY_CHART.find(([f]) => id.includes(f))?.[1] ?? OTHER_CHART;
const chartColor = (step: number, alpha = 1) =>
  alpha >= 1 ? `oklch(var(--chart-${step}))` : `oklch(var(--chart-${step}) / ${alpha})`;

// Context-free fallback: the family colour at full strength.
export function modelColor(model: string): string {
  return chartColor(familyChart(normModel(model)));
}

export function modelPalette(models: string[]): (model: string) => string {
  const color = new Map<string, string>();
  const perFamily = new Map<number, number>();
  for (const m of models) {
    const id = normModel(m);
    if (color.has(id)) continue;
    const step = familyChart(id);
    const rank = perFamily.get(step) ?? 0;
    perFamily.set(step, rank + 1);
    color.set(id, chartColor(step, VERSION_ALPHA[Math.min(rank, VERSION_ALPHA.length - 1)]));
  }
  return (model) => color.get(normModel(model)) ?? modelColor(model);
}

// Effort-level dot/bar colour (mockups: low -> max ramp from dim grey to the
// accent). `null` is the "All efforts" row. Tokens only.
const EFFORT_TOKEN: Record<string, string> = {
  low: "effort-1",
  medium: "effort-2",
  high: "effort-3",
  xhigh: "effort-4",
  max: "effort-5",
  unknown: "effort-unknown",
};
export function effortColor(effort: string | null): string {
  return `oklch(var(--${effort === null ? "effort-all" : (EFFORT_TOKEN[effort] ?? "effort-unknown")}))`;
}

// "62%" from a 0..1 share.
export function fmtShare(share: number, digits = 0): string {
  return `${(share * 100).toFixed(digits)}%`;
}

// "7.4×" from a ratio.
export function fmtMultiple(x: number, digits = 1): string {
  return `${x.toFixed(digits)}×`;
}

// A relative change as "▲ 12.3%" / "▼ 4.0%"; "n/a" when there is no baseline.
// The arrow is text so the direction survives without colour.
export function fmtDelta(delta: number | null): string {
  if (delta === null) return "n/a";
  const pct = (Math.abs(delta) * 100).toFixed(1);
  if (delta === 0 || pct === "0.0") return "0.0%";
  return `${delta > 0 ? "▲" : "▼"} ${pct}%`;
}

// Local YYYY-MM-DD key of an epoch-ms instant (same convention as UsageRecord.day).
export function dayKeyOf(ms: number): string {
  const d = new Date(ms);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

// Compact axis-tick dollars: $0.001, $0.50, $12, $1.5K.
export function fmtUSDShort(n: number): string {
  const a = Math.abs(n);
  if (a >= 1000) return `$${(n / 1000).toFixed(1).replace(/\.0$/, "")}K`;
  if (a >= 10) return `$${Math.round(n)}`;
  if (a >= 0.01 || a === 0) return `$${n.toFixed(2)}`;
  return `$${n}`;
}

export const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
export const WEEKDAYS_LONG = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

// Local weekday (0 = Sun) of a YYYY-MM-DD key.
export function weekdayOf(day: string): number {
  const [y, m, d] = day.split("-").map(Number);
  return new Date(y, m - 1, d).getDay();
}

// Local YYYY-MM-DD key `n` calendar days after `key` (DST-safe: uses Date parts).
export function addDays(key: string, n: number): string {
  const [y, m, d] = key.split("-").map(Number);
  return dayKeyOf(new Date(y, m - 1, d + n).getTime());
}
