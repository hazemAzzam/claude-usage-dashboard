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

// One colour per model FAMILY (matches the design mockups), with lightness
// nudged per version so two models of the same family (opus-4-1 vs opus-4-8)
// stay distinguishable in stacked bars and legends. Stateless and
// deterministic: the shift depends only on the id's version digits, so a model
// has the same colour in every chart and table.
// Model series colours come from the shadcn chart tokens (greys in the neutral
// theme), never hard-coded colours. Only chart-1..4 are used for series:
// chart-5 (0.269) is nearly invisible on the card background. `modelPalette`
// ranks models in the order given (pass `Summary.allModels`: cost desc, all
// records, so colours are stable across filters and pages) and assigns steps
// light -> dark. Beyond 4 models steps repeat: the monochrome palette
// separates at most ~4 series (documented in CLAUDE.md).
const SERIES_STEPS = 4;
const FAMILY_STEP: Array<[string, number]> = [
  ["opus", 1],
  ["sonnet", 2],
  ["haiku", 4],
];
const chartVar = (step: number) => `oklch(var(--chart-${step}))`;
const normModel = (model: string) => model.toLowerCase().replace(/-\d{8}$/, "");

// Context-free fallback: one step per known family, unknown -> chart-3.
export function modelColor(model: string): string {
  const id = normModel(model);
  return chartVar(FAMILY_STEP.find(([f]) => id.includes(f))?.[1] ?? 3);
}

export function modelPalette(models: string[]): (model: string) => string {
  const color = new Map<string, string>();
  for (const m of models) {
    const id = normModel(m);
    if (!color.has(id)) color.set(id, chartVar((color.size % SERIES_STEPS) + 1));
  }
  return (model) => color.get(normModel(model)) ?? modelColor(model);
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
