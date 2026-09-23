// Pure, client-safe (no node imports). Shared source of truth for the
// "effort" reasoning-level dimension so both server aggregation (lib/usage.ts)
// and client components (effort-filter.tsx, efficiency.tsx) agree on the
// set of levels, their order, and their display labels.

export const EFFORT_ORDER = ["low", "medium", "high", "xhigh", "max", "unknown"] as const;

export type Effort = (typeof EFFORT_ORDER)[number];

// UI labels — xhigh/max get friendlier names than the raw log values.
export const EFFORT_LABEL: Record<Effort, string> = {
  low: "Low",
  medium: "Medium",
  high: "High",
  xhigh: "Extra",
  max: "Max",
  unknown: "Unknown",
};

const KNOWN = new Set<string>(EFFORT_ORDER);

export function isEffort(s: string | null): s is Effort {
  return s !== null && KNOWN.has(s);
}

// Anything unrecognised (including missing/null/malformed values from older
// Claude Code logs that predate the `effort` field) buckets into "unknown".
export function parseEffort(v: unknown): Effort {
  return typeof v === "string" && isEffort(v) ? v : "unknown";
}

export function compareEffort(a: Effort, b: Effort): number {
  return EFFORT_ORDER.indexOf(a) - EFFORT_ORDER.indexOf(b);
}
