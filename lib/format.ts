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
const FAMILY_COLORS: Array<[string, string]> = [
  ["opus", "#E07B53"],
  ["sonnet", "#6C9CF0"],
  ["fable", "#B69CF7"],
  ["haiku", "#3E9E8A"],
];
const FALLBACK_COLORS = ["#E8B24A", "#8FBF6A", "#D66FA0", "#7FB7C4"];
const LIGHTNESS_SHIFTS = [0, -10, 10, -18, 18];

function hexToHsl(hex: string): [number, number, number] {
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  const d = max - min;
  if (d === 0) return [0, 0, l * 100];
  const s = d / (1 - Math.abs(2 * l - 1));
  let h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  h *= 60;
  return [h < 0 ? h + 360 : h, s * 100, l * 100];
}

export function modelColor(model: string): string {
  const id = model.toLowerCase().replace(/-\d{8}$/, "");
  const family = FAMILY_COLORS.find(([f]) => id.includes(f));
  let base: string;
  if (family) base = family[1];
  else {
    let h = 0;
    for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
    return FALLBACK_COLORS[h % FALLBACK_COLORS.length];
  }
  const nums = id.match(/\d+/g) ?? [];
  const version = Number(nums[0] ?? 0) * 10 + Number(nums[1] ?? 0);
  const shift = LIGHTNESS_SHIFTS[version % LIGHTNESS_SHIFTS.length];
  if (shift === 0) return base;
  const [h, s, l] = hexToHsl(base);
  return `hsl(${h.toFixed(0)} ${s.toFixed(0)}% ${Math.min(80, Math.max(42, l + shift)).toFixed(0)}%)`;
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
