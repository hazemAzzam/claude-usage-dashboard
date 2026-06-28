export function usd(n: number): string {
  if (!isFinite(n)) return "$0.00";
  if (Math.abs(n) >= 1000) return `$${(n / 1000).toFixed(2)}k`;
  return `$${n.toFixed(2)}`;
}

export function usdExact(n: number): string {
  return n.toLocaleString("en-US", { style: "currency", currency: "USD" });
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
