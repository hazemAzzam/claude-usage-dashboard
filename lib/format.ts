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
