"use client";

import { useMemo, useState } from "react";
import type { DayBucket, Summary } from "@/lib/usage";
import { daySpan, zeroDay } from "@/lib/derive";
import { WEEKDAYS_LONG, addDays, fmtCount, fmtDelta, fmtMultiple, modelColor, modelPalette, num, shortDay, shortModel, usdExact, usdFine, weekdayOf } from "@/lib/format";
import { fillDays, pctDelta, shareOf, sum } from "@/lib/stats";

export type Slot = "A" | "B";
export type QuickKind = "prev" | "week" | "extremes";
export type Tone = "warn" | "good" | "neutral";

/** Differences below half a cent are treated as "no difference". */
const EPS = 0.005;

// ---- small pure helpers ----
const hasData = (d: DayBucket | undefined): d is DayBucket => !!d && (d.cost > 0 || d.messages > 0);
const usd2 = (n: number) => usdExact(Math.abs(n));
const signedUsd = (n: number) => `${n >= 0 ? "+" : "−"}${usd2(n)}`;
const hourLabel = (h: number) => `${String(h).padStart(2, "0")}:00`;
const hoursOf = (d: DayBucket): number[] => Array.from({ length: 24 }, (_, h) => d.hours?.[h] ?? 0);
const dayName = (d: DayBucket, fallback: Slot) => (d.day ? shortDay(d.day) : fallback);

/** Local weekday name of a day key ("Tuesday"); "" for a missing key. */
export function weekdayName(key: string | null): string {
  return key ? WEEKDAYS_LONG[weekdayOf(key)] : "";
}

/** Every calendar day of the range (idle days as zero rows), oldest first. */
export function compareDays(summary: Summary): DayBucket[] {
  const span = daySpan(summary);
  return span ? fillDays(summary.byDay, span.from, span.to, zeroDay) : [];
}

// ---- selection state ----
export interface Selection {
  a: string | null;
  b: string | null;
  slot: Slot;
}

/** Default pair: A = latest active day; B = same weekday a week earlier if it has data, else the previous active day. */
export function defaultPair(days: DayBucket[]): { a: string | null; b: string | null } {
  if (days.length === 0) return { a: null, b: null };
  const active = days.filter(hasData);
  const a = active.length ? active[active.length - 1].day : days[days.length - 1].day;
  return { a, b: defaultB(days, a) };
}

function defaultB(days: DayBucket[], a: string): string | null {
  const week = addDays(a, -7);
  if (hasData(days.find((d) => d.day === week))) return week;
  const before = days.filter((d) => hasData(d) && d.day < a);
  return before.length ? before[before.length - 1].day : null;
}

/**
 * Re-resolve a selection against the current range: a slot whose day is no
 * longer in `days` (range/effort filter changed, data refreshed) falls back to
 * the default for that slot. Pure so the fallback is testable.
 */
export function resolveSelection(days: DayBucket[], sel: Selection): Selection {
  const has = (k: string | null) => k !== null && days.some((d) => d.day === k);
  const def = defaultPair(days);
  const a = has(sel.a) ? sel.a : def.a;
  const b = has(sel.b) ? sel.b : a ? defaultB(days, a) : null;
  return { a, b, slot: sel.slot };
}

/** Assign `day` to the active slot, then flip the slot. */
export function pickDay(sel: Selection, day: string): Selection {
  return sel.slot === "A" ? { a: day, b: sel.b, slot: "B" } : { a: sel.a, b: day, slot: "A" };
}

/** Exchange A and B. A no-op unless both slots hold a day (otherwise A and B would become the same). */
export function swapSlots(sel: Selection): Selection {
  return sel.a === null || sel.b === null ? sel : { ...sel, a: sel.b, b: sel.a };
}

// ---- quick picks ----
export interface QuickPick {
  kind: QuickKind;
  label: string;
  disabled: boolean;
  active: boolean;
}

/** New a/b for a quick comparison, or null when it can't apply to this range. */
export function quickTarget(days: DayBucket[], a: string | null, kind: QuickKind): { a: string; b: string } | null {
  const byKey = new Map(days.map((d) => [d.day, d]));
  if (kind === "extremes") {
    const weekdays = days.filter((d) => hasData(d) && ![0, 6].includes(weekdayOf(d.day)));
    if (weekdays.length < 2) return null;
    const hi = weekdays.reduce((x, y) => (y.cost > x.cost ? y : x));
    const lo = weekdays.reduce((x, y) => (y.cost < x.cost ? y : x));
    return hi.day === lo.day ? null : { a: hi.day, b: lo.day };
  }
  if (!a) return null;
  const target = addDays(a, kind === "prev" ? -1 : -7);
  return hasData(byKey.get(target)) ? { a, b: target } : null;
}

export function quickPicks(days: DayBucket[], a: string | null, b: string | null): QuickPick[] {
  const defs: Array<[QuickKind, string]> = [
    ["prev", "vs previous day"],
    ["week", "vs same day last week"],
    ["extremes", "Busiest vs quietest weekday"],
  ];
  return defs.map(([kind, label]) => {
    const t = quickTarget(days, a, kind);
    return { kind, label, disabled: t === null, active: t !== null && t.a === a && t.b === b };
  });
}

// ---- day strip ----
export interface StripDay {
  day: string;
  n: number; // day of month
  heightPct: number; // cost relative to the priciest day, 0..100
  isA: boolean;
  isB: boolean;
  aria: string;
}

export function dayStrip(days: DayBucket[], a: string | null, b: string | null): StripDay[] {
  const max = Math.max(0, ...days.map((d) => d.cost));
  return days.map((d) => ({
    day: d.day,
    n: Number(d.day.slice(8)),
    heightPct: shareOf(d.cost, max) * 100,
    isA: d.day === a,
    isB: d.day === b,
    aria: `${shortDay(d.day)}, ${weekdayName(d.day)} · ${usdExact(d.cost)}${d.day === a && d.day === b ? ", selected as A and B" : d.day === a ? ", selected as A" : d.day === b ? ", selected as B" : ""}`,
  }));
}

// ---- slot headers ----
export interface SlotView {
  slot: Slot;
  day: string | null;
  label: string;
  dow: string;
  active: boolean;
  aria: string;
}

export function slotView(slot: Slot, day: string | null, activeSlot: Slot): SlotView {
  const label = day ? shortDay(day) : "No day";
  return { slot, day, label, dow: weekdayName(day), active: slot === activeSlot, aria: `Slot ${slot}: ${day ? `${label}, ${weekdayName(day)}` : "no day selected"}` };
}

// ---- comparison cards ----
export interface CompareCard {
  label: string;
  a: string;
  b: string;
  delta: string;
  tone: Tone;
}

// null (not 0) when the denominator is 0: an average over nothing is unknown, not free.
const turnsPerSession = (d: DayBucket): number | null => ((d.sessions ?? 0) > 0 ? d.messages / (d.sessions ?? 1) : null);
const costPerMsg = (d: DayBucket): number | null => (d.messages > 0 ? d.cost / d.messages : null);

export function compareCards(A: DayBucket, B: DayBucket): CompareCard[] {
  const card = (label: string, va: number | null, vb: number | null, fmt: (n: number) => string, costLike: boolean): CompareCard => {
    const delta = va === null || vb === null ? null : pctDelta(va, vb);
    const tone: Tone = !costLike || delta === null || delta === 0 ? "neutral" : delta > 0 ? "warn" : "good";
    return { label, a: va === null ? "—" : fmt(va), b: vb === null ? "—" : fmt(vb), delta: fmtDelta(delta), tone };
  };
  return [
    card("Cost", A.cost, B.cost, usdExact, true),
    card("Messages", A.messages, B.messages, num, false),
    card("Avg turns / session", turnsPerSession(A), turnsPerSession(B), (n) => n.toFixed(0), false),
    card("Cost / message", costPerMsg(A), costPerMsg(B), usdFine, true),
  ];
}

// ---- hour by hour ----
export interface HourPair {
  hour: number;
  label: string; // axis label, only every 3rd hour
  aPct: number; // share of the shared max, 0..100
  bPct: number;
  tip: string;
}

export function pairHours(A: DayBucket, B: DayBucket): HourPair[] {
  const ha = hoursOf(A);
  const hb = hoursOf(B);
  const max = Math.max(...ha, ...hb);
  return ha.map((v, h) => ({
    hour: h,
    label: h % 3 === 0 ? String(h).padStart(2, "0") : "",
    aPct: shareOf(v, max) * 100,
    bPct: shareOf(hb[h], max) * 100,
    tip: `${hourLabel(h)} · A ${usdExact(v)} · B ${usdExact(hb[h])}`,
  }));
}

/** Screen-reader text for the hour chart: every hour with spend, plus the peaks. */
export function hoursSummary(A: DayBucket, B: DayBucket): string {
  const ha = hoursOf(A);
  const hb = hoursOf(B);
  const rows = ha.flatMap((v, h) => (v > 0 || hb[h] > 0 ? [`${hourLabel(h)} A ${usdExact(v)}, B ${usdExact(hb[h])}`] : []));
  return rows.length ? `Cost per hour, local time. ${rows.join("; ")}.` : "No hourly spend on either day.";
}

// ---- model diff ----
export interface ModelDiffRow {
  model: string;
  label: string;
  color: string;
  diff: number; // A - B
  diffLabel: string;
  posPct: number; // bar to the right (A spent more), 0..100 of half the track
  negPct: number; // bar to the left (B spent more)
}

export function modelDiff(A: DayBucket, B: DayBucket, colorOf: (model: string) => string = modelColor): ModelDiffRow[] {
  const costs = new Map<string, number>();
  for (const m of A.models ?? []) costs.set(m.model, (costs.get(m.model) ?? 0) + m.cost);
  for (const m of B.models ?? []) costs.set(m.model, (costs.get(m.model) ?? 0) - m.cost);
  const rows = [...costs].map(([model, diff]) => ({ model, diff })).filter((r) => Math.abs(r.diff) >= EPS);
  const maxAbs = Math.max(0, ...rows.map((r) => Math.abs(r.diff)));
  return rows
    .sort((x, y) => Math.abs(y.diff) - Math.abs(x.diff) || x.model.localeCompare(y.model))
    .map(({ model, diff }) => ({
      model,
      label: shortModel(model),
      color: colorOf(model),
      diff,
      diffLabel: signedUsd(diff),
      posPct: diff > 0 ? shareOf(diff, maxAbs) * 100 : 0,
      negPct: diff < 0 ? shareOf(-diff, maxAbs) * 100 : 0,
    }));
}

// ---- cost by token type ----
// Segments are stacked in this order; steps are picked so neighbours differ
// (mockup choices: input grey, output light grey, cache write violet, cache read teal).
export const TOKEN_TYPES = [
  { key: "input", label: "Input", color: "oklch(var(--token-input))" },
  { key: "output", label: "Output", color: "oklch(var(--token-output))" },
  { key: "cacheWrite", label: "Cache write", color: "oklch(var(--token-cache-write))" },
  { key: "cacheRead", label: "Cache read", color: "oklch(var(--token-cache-read))" },
] as const;

export interface TokenPart {
  key: string;
  label: string;
  color: string;
  sharePct: number; // 0..100 of that day's token cost
  tip: string;
}

export interface TokenTypeRow {
  slot: Slot;
  dayLabel: string;
  totalLabel: string;
  parts: TokenPart[];
  summary: string; // screen-reader text with every share
}

export function tokenTypeRows(A: DayBucket, B: DayBucket): TokenTypeRow[] {
  const row = (slot: Slot, d: DayBucket): TokenTypeRow => {
    const t = d.tokenCost;
    const total = t ? sum(TOKEN_TYPES.map((k) => t[k.key])) : 0;
    return {
      slot,
      dayLabel: dayName(d, slot),
      totalLabel: usdExact(d.cost),
      summary: "",
      parts: TOKEN_TYPES.map((k) => {
        const cost = t?.[k.key] ?? 0;
        const sharePct = shareOf(cost, total) * 100;
        return { key: k.key, label: k.label, color: k.color, sharePct, tip: `${k.label} · ${usdExact(cost)} (${Math.round(sharePct)}%)` };
      }),
    };
  };
  return [row("A", A), row("B", B)].map((r) => ({
    ...r,
    summary: `${r.slot}, ${r.dayLabel}, total ${r.totalLabel}: ${r.parts.map((p) => p.tip).join(", ")}.`,
  }));
}

// ---- top sessions ----
export interface TopSessionRow {
  session: string;
  id: string;
  project: string;
  turnsLabel: string;
  costLabel: string;
}

export interface TopSessionsGroup {
  slot: Slot;
  dayLabel: string;
  rows: TopSessionRow[];
}

export function topSessionRows(A: DayBucket, B: DayBucket): TopSessionsGroup[] {
  const group = (slot: Slot, d: DayBucket): TopSessionsGroup => ({
    slot,
    dayLabel: dayName(d, slot),
    rows: (d.topSessions ?? []).slice(0, 3).map((s) => ({
      session: s.session,
      id: s.session.slice(0, 8),
      project: s.project,
      turnsLabel: fmtCount(s.messages, "turn"),
      costLabel: usdExact(s.cost),
    })),
  });
  return [group("A", A), group("B", B)];
}

// ---- what changed ----
export interface Finding {
  tone: "up" | "down" | "neutral";
  text: string;
}

const peakHour = (d: DayBucket): number | null => {
  const h = hoursOf(d);
  const max = Math.max(...h);
  return max > 0 ? h.indexOf(max) : null;
};

export function whatChanged(A: DayBucket, B: DayBucket): Finding[] {
  const la = dayName(A, "A");
  const lb = dayName(B, "B");
  const out: Finding[] = [];
  const dCost = A.cost - B.cost;

  if (A.cost <= 0 && B.cost <= 0) {
    out.push({ tone: "neutral", text: `Neither ${la} nor ${lb} has any spend.` });
  } else if (B.cost <= 0) {
    out.push({ tone: "up", text: `${la} cost ${usd2(A.cost)}; ${lb} had no spend to compare against.` });
  } else if (A.cost <= 0) {
    out.push({ tone: "down", text: `${la} had no spend; ${lb} cost ${usd2(B.cost)}.` });
  } else {
    const same = Math.abs(dCost) < EPS;
    const tone = same ? "neutral" : dCost > 0 ? "up" : "down";
    const word = same ? "about the same as" : `${usd2(dCost)} ${dCost > 0 ? "more" : "less"} than`;
    out.push({ tone, text: `${la} cost ${word} ${lb} (${fmtMultiple(A.cost / B.cost, 2)}).` });
  }

  const driver = modelDiff(A, B)[0];
  if (driver) {
    out.push({ tone: "neutral", text: `Biggest driver: ${driver.label}, ${signedUsd(driver.diff)}.` });
  }

  const ta = turnsPerSession(A);
  const tb = turnsPerSession(B);
  if (ta !== null && tb !== null) {
    const longer = ta > tb * 1.15;
    out.push({
      tone: longer ? "up" : "neutral",
      text: `Sessions averaged ${ta.toFixed(0)} turns vs ${tb.toFixed(0)}${longer ? ", so later turns re-read more context." : "."}`,
    });
  }

  const pa = peakHour(A);
  const pb = peakHour(B);
  if (pa !== null && pb !== null) {
    out.push({
      tone: "neutral",
      text: pa === pb ? `Both days peaked at ${hourLabel(pa)}.` : `Peak hour ${hourLabel(pa)} on A vs ${hourLabel(pb)} on B.`,
    });
  }
  return out;
}

// ---- the hook ----
const dayOrZero = (days: DayBucket[], key: string | null): DayBucket => days.find((d) => d.day === key) ?? zeroDay("");

/** Guidance line under the title; explains why B may be missing. */
export function compareHint(days: DayBucket[], b: string | null): string {
  if (b !== null) return "Choose a slot, then click a day in the strip below.";
  return days.filter(hasData).length <= 1 ? "Only one active day in this range." : "No earlier active day found — pick day B below.";
}

export function useCompareView(summary: Summary) {
  const days = useMemo(() => compareDays(summary), [summary]);
  const [raw, setRaw] = useState<Selection>({ a: null, b: null, slot: "A" });
  const sel = useMemo(() => resolveSelection(days, raw), [days, raw]);

  const A = useMemo(() => dayOrZero(days, sel.a), [days, sel.a]);
  const B = useMemo(() => dayOrZero(days, sel.b), [days, sel.b]);

  // Only an explicit pick / swap / quick pick pins a day; changing the slot
  // alone leaves defaults unpinned so they keep tracking the range.
  const pick = (day: string) => setRaw((r) => pickDay(r, day));
  const setSlot = (slot: Slot) => setRaw((r) => ({ ...r, slot }));
  const swap = () => setRaw((r) => ({ ...swapSlots(sel), slot: r.slot }));
  const applyQuick = (kind: QuickKind) => {
    const t = quickTarget(days, sel.a, kind);
    if (t) setRaw((r) => ({ ...r, a: t.a, b: t.b }));
  };

  const colorOf = useMemo(() => modelPalette(summary.allModels), [summary.allModels]);

  return {
    hasDays: days.length > 0,
    needsSecondDay: sel.b === null,
    canSwap: sel.a !== null && sel.b !== null,
    hint: compareHint(days, sel.b),
    slots: [slotView("A", sel.a, sel.slot), slotView("B", sel.b, sel.slot)] as [SlotView, SlotView],
    strip: useMemo(() => dayStrip(days, sel.a, sel.b), [days, sel.a, sel.b]),
    quick: useMemo(() => quickPicks(days, sel.a, sel.b), [days, sel.a, sel.b]),
    cards: useMemo(() => compareCards(A, B), [A, B]),
    hours: useMemo(() => pairHours(A, B), [A, B]),
    hoursSummary: useMemo(() => hoursSummary(A, B), [A, B]),
    findings: useMemo(() => whatChanged(A, B), [A, B]),
    models: useMemo(() => modelDiff(A, B, colorOf), [A, B, colorOf]),
    tokenRows: useMemo(() => tokenTypeRows(A, B), [A, B]),
    tops: useMemo(() => topSessionRows(A, B), [A, B]),
    pick,
    setSlot,
    swap,
    applyQuick,
  };
}
