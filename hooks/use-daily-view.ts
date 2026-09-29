"use client";

import { useMemo } from "react";
import type { DayBucket, Summary } from "@/lib/usage";
import { WEEKDAYS, weekdayOf, cacheShare, modelColor, num, shortDay, shortModel, tokens, usdExact } from "@/lib/format";
import { safeDiv, shareOf, sum } from "@/lib/stats";
import { useSortable } from "@/hooks/use-sortable";
import { useExpandable } from "@/hooks/use-expandable";

export type DailySortKey = "day" | "cost" | "messages" | "input" | "output" | "cacheCreate" | "cacheRead" | "perDollar";


// All tokens (input + output + cache write + cache read) bought per $. Cache
// reads dominate, which is the point: caching is what makes tokens cheap.
export function tokensPerDollar(d: { input: number; output: number; cacheCreate: number; cacheRead: number; cost: number }): number {
  return d.cost > 0 ? (d.input + d.output + d.cacheCreate + d.cacheRead) / d.cost : 0;
}

function compareDaily(a: DayBucket, b: DayBucket, key: DailySortKey): number {
  if (key === "day") return a.day.localeCompare(b.day);
  if (key === "perDollar") return tokensPerDollar(a) - tokensPerDollar(b);
  return (a[key] as number) - (b[key] as number);
}

// ---- per-row presentation model ----
export interface DailyModelPart {
  model: string;
  label: string;
  color: string;
  messages: number;
  cost: number;
  costLabel: string;
  pctOfDay: number; // 0..100
}

export interface DailyRow {
  d: DayBucket;
  dateLabel: string;
  dow: string;
  barWidthPct: number; // this day's cost relative to the priciest day (0..100)
  parts: DailyModelPart[]; // per-model split, drives the stacked bar and the expanded rows
  cacheSharePct: number;
  cacheShareLabel: string;
  tokensPerDollar: number;
  tokensPerDollarLabel: string;
}

export function deriveDailyRows(rows: DayBucket[], maxCost: number): DailyRow[] {
  return rows.map((d) => ({
    d,
    dateLabel: shortDay(d.day),
    dow: WEEKDAYS[weekdayOf(d.day)],
    barWidthPct: shareOf(d.cost, maxCost) * 100,
    parts: (d.models ?? []).map((m) => ({
      model: m.model,
      label: shortModel(m.model),
      color: modelColor(m.model),
      messages: m.messages,
      cost: m.cost,
      costLabel: usdExact(m.cost),
      pctOfDay: shareOf(m.cost, d.cost) * 100,
    })),
    cacheSharePct: cacheShare(d),
    cacheShareLabel: `${cacheShare(d).toFixed(0)}%`,
    tokensPerDollar: tokensPerDollar(d),
    tokensPerDollarLabel: num(Math.round(tokensPerDollar(d))),
  }));
}

// ---- header stats ----
export interface DailyStat {
  label: string;
  value: string;
  sub: string;
}

/** Whole local days spanned by the window, or null for an unbounded ("all") range. */
export function rangeDayCount(from: number, to: number): number | null {
  return from > 0 ? Math.round((to - from + 1) / 86_400_000) : null;
}

/** "weekend days average 40% of weekday cost", or a neutral fallback. */
export function weekendNote(byDay: DayBucket[]): string {
  const wk = byDay.filter((d) => ![0, 6].includes(weekdayOf(d.day)));
  const we = byDay.filter((d) => [0, 6].includes(weekdayOf(d.day)));
  if (!wk.length || !we.length) return "active days in range";
  const ratio = safeDiv(safeDiv(sum(we.map((d) => d.cost)), we.length), safeDiv(sum(wk.map((d) => d.cost)), wk.length));
  return `weekend days average ${(ratio * 100).toFixed(0)}% of weekday cost`;
}

export function deriveDailyStats(s: Summary): DailyStat[] {
  const { byDay, totals } = s;
  const days = byDay.length;
  const span = rangeDayCount(s.from, s.to);
  const peak = [...byDay].sort((a, b) => b.cost - a.cost)[0];
  return [
    { label: "Active days", value: span ? `${days} / ${span}` : num(days), sub: "days with any usage" },
    { label: "Avg cost / day", value: usdExact(safeDiv(totals.cost, days)), sub: weekendNote(byDay) },
    {
      label: "Peak day",
      value: peak ? shortDay(peak.day) : "—",
      sub: peak ? `${usdExact(peak.cost)} · ${WEEKDAYS[weekdayOf(peak.day)]}` : "no usage",
    },
    {
      label: "Tokens per $",
      value: tokens(Math.round(tokensPerDollar(totals))),
      sub: "cache reads make tokens cheap",
    },
  ];
}

// Sort + row-expand view model for the Daily table, plus its stats.
export function useDailyView(data: Summary) {
  const { sortKey, dir, sorted, toggle } = useSortable<DayBucket, DailySortKey>(
    data.byDay,
    compareDaily,
    "day",
    () => true, // numeric high-first, and dates most-recent-first
  );
  const { isOpen, toggle: toggleRow } = useExpandable();

  const maxCost = useMemo(() => Math.max(0, ...data.byDay.map((d) => d.cost)), [data.byDay]);
  const rows = useMemo(() => deriveDailyRows(sorted, maxCost), [sorted, maxCost]);
  const stats = useMemo(() => deriveDailyStats(data), [data]);
  const models = useMemo(
    () => data.byModel.filter((m) => m.cost > 0).map((m) => ({ model: m.model, label: shortModel(m.model), color: modelColor(m.model) })),
    [data.byModel],
  );

  return {
    rows,
    stats,
    models,
    days: data.byDay.length,
    sortKey,
    dir,
    toggleSort: toggle,
    isRowOpen: isOpen,
    toggleRow,
  };
}
