// Pure, client-safe derivations shared by more than one view hook (and by the
// chart components' prop types). Rule: view hooks (hooks/use-*-view.ts) never
// import each other; anything two of them need lives here. No React, no
// node:*, no runtime import from lib/usage.ts (types only).
import type { DayBucket, Summary } from "@/lib/usage";
import { EFFORT_LABEL, type Effort } from "@/lib/effort";
import { dayKeyOf, fmtMultiple, usdFine } from "@/lib/format";
import { safeDiv } from "@/lib/stats";

/** First 8 chars of a session id, for compact display. */
export function shortSessionId(id: string): string {
  return id.slice(0, 8);
}

// ---- stacked-by-model chart rows ----
export interface DailyModelLegend {
  model: string;
  label: string;
  color: string;
}

// One row per day: `day`, optionally `total`/`ma7`, plus one numeric key per model id.
export type DailyByModelRow = { day: string; [key: string]: number | string };

// ---- cost per message by effort ----
export interface EffortCostRow {
  effort: Effort;
  label: string;
  messages: number;
  costPerMsg: number;
  costLabel: string;
}

export interface EffortCostPerMsg {
  rows: EffortCostRow[];
  ratio: number | null; // Max cost/msg over Low cost/msg
  ratioLabel: string | null; // "7.4×"
  note: string | null;
}

export function deriveEffortCostPerMsg(s: Summary): EffortCostPerMsg {
  const rows = s.byEffort
    .filter((e) => e.messages > 0)
    .map((e) => {
      const costPerMsg = safeDiv(e.cost, e.messages);
      return { effort: e.effort, label: EFFORT_LABEL[e.effort], messages: e.messages, costPerMsg, costLabel: usdFine(costPerMsg) };
    });
  const low = rows.find((r) => r.effort === "low")?.costPerMsg ?? 0;
  const max = rows.find((r) => r.effort === "max")?.costPerMsg ?? 0;
  const ratio = low > 0 && max > 0 ? max / low : null;
  const ratioLabel = ratio === null ? null : fmtMultiple(ratio);
  return { rows, ratio, ratioLabel, note: ratioLabel === null ? null : `Max costs ${ratioLabel} Low per message` };
}

// ---- the day span every per-day series is densified over ----
/**
 * Inclusive local-day span for per-day series. Bounded range: from the range
 * start to the earlier of range end and "today" (`generatedAt`), so a range
 * running into the future doesn't pad with idle future days. Unbounded
 * ("all"): first to last ACTIVE day. null when there is nothing to span.
 */
export function daySpan(s: Pick<Summary, "from" | "to" | "generatedAt" | "byDay">): { from: string; to: string } | null {
  if (s.from > 0) {
    const from = dayKeyOf(s.from);
    const to = dayKeyOf(Math.min(s.to, s.generatedAt));
    return { from, to: to < from ? from : to };
  }
  if (!s.byDay.length) return null;
  return { from: s.byDay[0].day, to: s.byDay[s.byDay.length - 1].day };
}

/** An all-zero day row (for `fillDays` gaps on `Summary.byDay`). */
export function zeroDay(day: string): DayBucket {
  return { day, cost: 0, input: 0, output: 0, cacheCreate: 0, cacheRead: 0, messages: 0, saved: 0, sessions: 0 };
}
