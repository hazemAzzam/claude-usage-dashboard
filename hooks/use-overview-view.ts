"use client";

import { useMemo } from "react";
import type { Summary } from "@/lib/usage";
import { EFFORT_LABEL } from "@/lib/effort";
import {
  dayKeyOf,
  fmtDelta,
  fmtMultiple,
  fmtShare,
  modelPalette,
  num,
  shortDay,
  shortModel,
  usd,
  usdExact,
  usdFine,
} from "@/lib/format";
import { cumulative, fillDays, linearProjection, movingAverage, pctDelta, safeDiv, shareOf, sum, toSeries } from "@/lib/stats";
import { daySpan, deriveEffortCostPerMsg, zeroDay, type DailyByModelRow, type DailyModelLegend } from "@/lib/derive";
import type { PlanPrice } from "@/hooks/use-plan-price";

// Everything the Overview needs, derived once from a Summary. The exported
// derive* functions are pure (and unit-tested); the hook only memoises them.

// ---- KPI cards ----
export type DeltaTone = "good" | "warn" | "neutral";

export interface Kpi {
  key: "cost" | "sessions" | "costPerMsg" | "saved";
  label: string;
  value: string; // display string
  delta: number | null; // relative change vs the previous window; null = no baseline
  deltaLabel: string; // "▲ 12.3%" / "n/a" (arrow is text so it survives without colour)
  tone: DeltaTone;
  spark: Array<{ i: number; v: number }>; // current range, one point per active day
  sub: string;
}

// Colour semantics: cost up is bad ("warn"), savings up is good. `goodWhenUp`
// null means the direction carries no judgement (session count).
export function deltaTone(delta: number | null, goodWhenUp: boolean | null): DeltaTone {
  if (delta === null || delta === 0 || goodWhenUp === null) return "neutral";
  return delta > 0 === goodWhenUp ? "good" : "warn";
}

export function deriveKpis(s: Summary): Kpi[] {
  const t = s.totals;
  const prev = s.previous;
  const cpm = safeDiv(t.cost, t.messages);
  const prevCpm = prev ? safeDiv(prev.totals.cost, prev.totals.messages) : null;
  // Idle days count as zero so sparklines show real gaps, not a squeezed active-days-only line.
  const span = daySpan(s);
  const days = span ? fillDays(s.byDay, span.from, span.to, zeroDay) : s.byDay;
  const note = prev?.partial ? " · vs same point in previous period" : "";

  const mk = (
    key: Kpi["key"],
    label: string,
    value: string,
    cur: number,
    before: number | null,
    goodWhenUp: boolean | null,
    spark: number[],
    sub: string,
  ): Kpi => {
    const delta = before === null ? null : pctDelta(cur, before);
    return { key, label, value, delta, deltaLabel: fmtDelta(delta), tone: deltaTone(delta, goodWhenUp), spark: toSeries(spark), sub: `${sub}${note}` };
  };

  return [
    mk("cost", "Total cost", usdExact(t.cost), t.cost, prev ? prev.totals.cost : null, false,
      days.map((d) => d.cost), "API-equivalent"),
    mk("sessions", "Sessions", num(t.sessions), t.sessions, prev ? prev.totals.sessions : null, null,
      days.map((d) => d.sessions ?? 0), `${num(t.messages)} assistant messages`),
    mk("costPerMsg", "Cost per message", usdFine(cpm), cpm, prevCpm, false,
      days.map((d) => safeDiv(d.cost, d.messages)), "average per assistant message"),
    mk("saved", "Saved by caching", usdExact(s.cacheNetSaved), s.cacheNetSaved, prev ? prev.cacheNetSaved : null, true,
      days.map((d) => d.saved), "net of the cache-write premium"),
  ];
}

/** "API-equivalent cost · High effort · compared with Aug 3 – Aug 31". */
export function deriveSubtitle(s: Summary): string {
  const effort = s.effort ? `${EFFORT_LABEL[s.effort]} effort` : "All efforts";
  const window = s.previous ? `${shortDay(dayKeyOf(s.previous.from))} – ${shortDay(dayKeyOf(s.previous.to))}` : "";
  const cmp = !s.previous
    ? "no earlier period to compare with"
    : s.previous.partial
      ? `compared with the same point in the previous period (${window})`
      : `compared with ${window}`;
  return `API-equivalent cost · ${effort} · ${cmp}`;
}

// ---- "Long sessions cost more per turn" ----
export interface TurnRow {
  label: string;
  late: boolean; // turn 151+ (highlighted; feeds the /compact callout)
  messages: number;
  costPerMsg: number;
  costLabel: string;
  share: number; // of in-range spend
  shareLabel: string;
}

export interface TurnCost {
  hasData: boolean; // any message in any bucket
  rows: TurnRow[];
  lateMultiple: number | null; // cost/msg of turns 151+ vs turns 1-25
  lateShare: number; // share of spend from turns 151+
  callout: string | null;
}

const LATE_FROM = 151;

export function deriveTurnCost(s: Summary): TurnCost {
  const total = sum(s.turnBuckets.map((b) => b.cost));
  const rows = s.turnBuckets.map((b) => {
    const costPerMsg = safeDiv(b.cost, b.messages);
    const share = shareOf(b.cost, total);
    return { label: b.label, late: b.lo >= LATE_FROM, messages: b.messages, costPerMsg, costLabel: usdFine(costPerMsg), share, shareLabel: fmtShare(share) };
  });
  const hasData = s.turnBuckets.some((b) => b.messages > 0);
  const late = s.turnBuckets.filter((b) => b.lo >= LATE_FROM);
  const lateCost = sum(late.map((b) => b.cost));
  const lateMsgs = sum(late.map((b) => b.messages));
  const first = rows[0]?.costPerMsg ?? 0;
  const lateMultiple = first > 0 && lateMsgs > 0 ? safeDiv(lateCost, lateMsgs) / first : null;
  const lateShare = shareOf(lateCost, total);

  let callout: string | null = null;
  if (lateMultiple !== null) {
    callout = `Turns after #150 cost ${fmtMultiple(lateMultiple)} the first 25 and make up ${fmtShare(lateShare)} of spend.`;
    if (lateMultiple > 1) {
      // First bucket whose per-message cost is over 2x the opening bucket's.
      const steep = s.turnBuckets.find((b) => b.messages > 0 && b.cost / b.messages > 2 * first);
      callout += steep ? ` Consider running /compact before turn ${steep.lo}.` : " Consider /compact earlier in long sessions.";
    }
  }
  return { hasData, rows, lateMultiple, lateShare, callout };
}

// ---- "Value vs your plan" ----
export interface PlanPoint {
  day: string; // YYYY-MM-DD
  cum: number | null; // cumulative spend through this day (null after today)
  projected: number | null; // dashed projection, from today to month end
  plan: number; // the plan price (reference line)
}

export interface PlanValue {
  series: PlanPoint[];
  price: number;
  daysElapsed: number;
  cumToday: number;
  multiple: number; // cumToday / price
  multipleLabel: string;
  paidOffDay: string | null; // first day cumulative spend reached the plan price
  paidOffLabel: string | null;
  showProjection: boolean; // needs >= 3 elapsed days, or the extrapolation is noise
  projectedTotal: number;
  projectLabel: string | null; // "→ $1,234.00 by Sep 30", only while projecting
  monthLabel: string;
  subtitle: string;
  hasData: boolean;
}

const MIN_PROJECTION_DAYS = 3;
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

/** Days of `planMonth` that count as elapsed at `now` (epoch ms). */
export function daysElapsedIn(month: string, daysInMonth: number, now: number): number {
  const [y, m] = month.split("-").map(Number);
  if (now >= new Date(y, m, 1).getTime()) return daysInMonth;
  if (now < new Date(y, m - 1, 1).getTime()) return 0;
  return new Date(now).getDate();
}

export function derivePlanValue(planMonth: Summary["planMonth"], price: PlanPrice, now: number): PlanValue {
  const { daysInMonth, byDay } = planMonth;
  const [y, m] = planMonth.month.split("-").map(Number);
  const cumAll = cumulative(byDay.map((d) => d.cost));
  const daysElapsed = Math.min(daysElapsedIn(planMonth.month, daysInMonth, now), cumAll.length);
  const cumToday = daysElapsed > 0 ? cumAll[daysElapsed - 1] : 0;
  const projecting = daysElapsed >= MIN_PROJECTION_DAYS && daysElapsed < daysInMonth;
  const projectedTotal = projecting ? linearProjection(cumAll, daysElapsed, daysInMonth) : cumToday;

  const series = byDay.map((d, i): PlanPoint => {
    const n = i + 1;
    let projected: number | null = null;
    if (projecting && n >= daysElapsed) {
      projected = cumToday + ((projectedTotal - cumToday) * (n - daysElapsed)) / (daysInMonth - daysElapsed);
    }
    return { day: d.day, cum: n <= daysElapsed ? cumAll[i] : null, projected, plan: price };
  });

  const paid = series.find((p) => p.cum !== null && p.cum >= price);
  const lastDay = byDay[byDay.length - 1]?.day ?? "";
  return {
    series,
    price,
    daysElapsed,
    cumToday,
    multiple: cumToday / price,
    multipleLabel: fmtMultiple(cumToday / price),
    paidOffDay: paid?.day ?? null,
    paidOffLabel: paid ? `Plan paid off ${shortDay(paid.day)}` : null,
    showProjection: projecting,
    projectedTotal,
    projectLabel: projecting ? `→ ${usd(projectedTotal)} by ${shortDay(lastDay)}` : null,
    monthLabel: `${MONTHS[m - 1]} ${y}`,
    subtitle: `Cumulative API-equivalent spend in ${MONTHS[m - 1]} ${y} — this calendar month, all efforts, regardless of the selected range`,
    hasData: cumToday > 0,
  };
}

// ---- Daily cost by model + 7-day average ----
export interface DailyByModel {
  rows: DailyByModelRow[];
  models: DailyModelLegend[];
}

export function deriveDailyByModel(s: Summary): DailyByModel {
  const colorOf = modelPalette(s.allModels);
  const models = s.byModel
    .filter((m) => m.cost > 0)
    .map((m) => ({ model: m.model, label: shortModel(m.model), color: colorOf(m.model) }));
  const span = daySpan(s);
  // Every calendar day in the span, idle days as $0, so the 7-day average is a true 7 days.
  const dense = span
    ? fillDays<DailyByModelRow>(s.byDayModel, span.from, span.to, (day) => ({ day, ...Object.fromEntries(models.map((m) => [m.model, 0])) }))
    : s.byDayModel;
  const totals = dense.map((r) => sum(models.map((m) => Number(r[m.model]) || 0)));
  const ma = movingAverage(totals, 7);
  const rows = dense.map((r, i) => ({ ...r, total: totals[i], ma7: ma[i] ?? 0 }));
  return { rows, models };
}

// ---- hook ----
export function useOverviewView(s: Summary, planPrice: PlanPrice) {
  const kpis = useMemo(() => deriveKpis(s), [s]);
  const subtitle = useMemo(() => deriveSubtitle(s), [s]);
  const turn = useMemo(() => deriveTurnCost(s), [s]);
  // `generatedAt` (server clock at build) doubles as "today" so the render stays pure.
  const plan = useMemo(() => derivePlanValue(s.planMonth, planPrice, s.generatedAt), [s.planMonth, planPrice, s.generatedAt]);
  const daily = useMemo(() => deriveDailyByModel(s), [s]);
  const effort = useMemo(() => deriveEffortCostPerMsg(s), [s]);
  return { kpis, subtitle, turn, plan, daily, effort };
}
