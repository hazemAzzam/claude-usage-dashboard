"use client";

import { useDeferredValue, useMemo, useState } from "react";
import type { SessionRow, Summary } from "@/lib/usage";
import { fmtCount, fmtShare, modelColor, modelPalette, shortModel, num, usdExact } from "@/lib/format";
import { cumulative, median, shareOf } from "@/lib/stats";
import { useSortable } from "@/hooks/use-sortable";
import { useExpandable } from "@/hooks/use-expandable";

export type SessionSortKey = "project" | "day" | "model" | "cost" | "messages" | "input" | "output" | "cacheRead";

const NUMERIC: Set<SessionSortKey> = new Set(["cost", "messages", "input", "output", "cacheRead"]);

function compareSessions(a: SessionRow, b: SessionRow, key: SessionSortKey): number {
  if (key === "project") return a.project.localeCompare(b.project);
  if (key === "day") return a.day.localeCompare(b.day);
  if (key === "model") return a.model.localeCompare(b.model);
  return (a[key] as number) - (b[key] as number);
}

// ---- Pareto: how concentrated is spend in the costliest sessions? ----
export interface ParetoPoint {
  x: number; // % of sessions (0..100), costliest first
  y: number; // cumulative % of cost (0..100)
}

export interface Pareto {
  points: ParetoPoint[];
  // Cost share of the costliest 10% / 20% of sessions (0..1). null below 10
  // sessions, where "10% of sessions" is less than one session and the
  // headline would be meaningless.
  top10Share: number | null;
  top20Share: number | null;
  top10Label: string | null;
  top20Label: string | null;
  markerX: number; // x (% of sessions) where the "top 10%" marker sits: the whole sessions counted
}

const MAX_PARETO_POINTS = 200;
export const MIN_PARETO_SESSIONS = 10;

export function derivePareto(sessions: SessionRow[]): Pareto {
  const costs = sessions.map((s) => s.cost).sort((a, b) => b - a);
  const n = costs.length;
  const total = costs.reduce((a, c) => a + c, 0);
  const cum = cumulative(costs);
  const countFor = (frac: number) => Math.max(1, Math.ceil(n * frac));
  const shareAt = (frac: number) => (n === 0 ? 0 : shareOf(cum[countFor(frac) - 1], total));

  // Thin very long lists so the SVG stays small; always keep the last point.
  const stride = Math.max(1, Math.ceil(n / MAX_PARETO_POINTS));
  const points: ParetoPoint[] = [{ x: 0, y: 0 }];
  for (let i = 0; i < n; i += stride) points.push({ x: shareOf(i + 1, n) * 100, y: shareOf(cum[i], total) * 100 });
  if (n > 0 && (n - 1) % stride !== 0) points.push({ x: 100, y: shareOf(cum[n - 1], total) * 100 });

  const enough = n >= MIN_PARETO_SESSIONS;
  const top10Share = enough ? shareAt(0.1) : null;
  const top20Share = enough ? shareAt(0.2) : null;
  return {
    points,
    top10Share,
    top20Share,
    top10Label: top10Share === null ? null : fmtShare(top10Share),
    top20Label: top20Share === null ? null : fmtShare(top20Share),
    markerX: n === 0 ? 10 : shareOf(countFor(0.1), n) * 100,
  };
}

// ---- Scatter: session length vs cost (log-log), outliers ringed ----
export interface ScatterPoint {
  session: string;
  project: string;
  model: string;
  messages: number;
  cost: number;
  outlier: boolean; // cost > 2x the median cost of same-model sessions of similar length
  tip: string;
}

export interface ScatterSeries {
  model: string;
  label: string;
  color: string;
  points: ScatterPoint[];
}

// Power-of-10 axis bounds and ticks for a log scale.
export interface LogAxis {
  domain: [number, number];
  ticks: number[];
}

export interface SessionScatter {
  series: ScatterSeries[];
  outliers: number;
  total: number;
  x: LogAxis;
  y: LogAxis;
}

const OUTLIER_FACTOR = 2;
const MIN_BIN_SAMPLES = 3; // a median of 1-2 sessions says nothing about "typical"

/** Length bin of a session: floor(log2(messages)). */
export function lengthBin(messages: number): number {
  return Math.floor(Math.log2(Math.max(1, messages)));
}

/** Smallest power-of-10 range containing all values (which must be > 0), with a tick per power. */
export function logAxis(values: number[]): LogAxis {
  if (!values.length) return { domain: [1, 10], ticks: [1, 10] };
  const lo = Math.floor(Math.log10(Math.min(...values)) + 1e-9);
  let hi = Math.ceil(Math.log10(Math.max(...values)) - 1e-9);
  if (hi <= lo) hi = lo + 1;
  const ticks = Array.from({ length: hi - lo + 1 }, (_, i) => Number(`1e${lo + i}`));
  return { domain: [ticks[0], ticks[ticks.length - 1]], ticks };
}

export function deriveScatter(sessions: SessionRow[], colorOf: (model: string) => string = modelColor): SessionScatter {
  // Log axes can't show zero, so free/empty sessions are left out.
  const usable = sessions.filter((s) => s.cost > 0 && s.messages > 0);
  // "Typical" = same model AND similar length: opus vs haiku costs differ ~10x.
  const binKey = (s: SessionRow) => `${s.model}\0${lengthBin(s.messages)}`;
  const bins = new Map<string, number[]>();
  for (const s of usable) {
    const k = binKey(s);
    const list = bins.get(k);
    if (list) list.push(s.cost);
    else bins.set(k, [s.cost]);
  }
  const medians = new Map<string, number>();
  for (const [k, costs] of bins) if (costs.length >= MIN_BIN_SAMPLES) medians.set(k, median(costs));

  const byModel = new Map<string, ScatterPoint[]>();
  let outliers = 0;
  for (const s of usable) {
    const outlier = s.cost > OUTLIER_FACTOR * (medians.get(binKey(s)) ?? Infinity);
    if (outlier) outliers += 1;
    const pt: ScatterPoint = {
      session: s.session,
      project: s.project,
      model: s.model,
      messages: s.messages,
      cost: s.cost,
      outlier,
      tip: `${s.project} · ${shortModel(s.model)} · ${fmtCount(s.messages, "msg")} · ${usdExact(s.cost)}${outlier ? " · well above typical for its length" : ""}`,
    };
    const list = byModel.get(s.model);
    if (list) list.push(pt);
    else byModel.set(s.model, [pt]);
  }
  const series = [...byModel.entries()]
    .map(([model, points]) => ({ model, label: shortModel(model), color: colorOf(model), points }))
    .sort((a, b) => b.points.length - a.points.length);
  return {
    series,
    outliers,
    total: usable.length,
    x: logAxis(usable.map((s) => s.messages)),
    y: logAxis(usable.map((s) => s.cost)),
  };
}

/** "+2" for a session that used 3 models, "" for a single-model session. */
export function extraModelsLabel(s: Pick<SessionRow, "models">): string {
  return s.models.length > 1 ? `+${s.models.length - 1}` : "";
}

/** "37 of 412 sessions" (or just the total when nothing is filtered out). */
export function sessionCountLabel(shown: number, total: number): string {
  return shown === total ? fmtCount(total, "session") : `${num(shown)} of ${fmtCount(total, "session")}`;
}

// Search/filter/sort + row-expand view model for the Sessions table. The
// search text is deferred so typing stays responsive while a large
// `allSessions` list re-filters.
export function useSessionsView(data: Summary) {
  const rows = data.allSessions;
  const [query, setQuery] = useState("");
  const deferredQuery = useDeferredValue(query);
  const [model, setModel] = useState<string>("all");

  const models = useMemo(() => {
    const set = new Set<string>();
    for (const r of rows) for (const m of r.models) set.add(m);
    return [...set].sort();
  }, [rows]);

  const filtered = useMemo(() => {
    const needle = deferredQuery.trim().toLowerCase();
    let out = rows;
    if (needle) out = out.filter((r) => r.project.toLowerCase().includes(needle) || r.session.toLowerCase().includes(needle));
    if (model !== "all") out = out.filter((r) => r.models.includes(model));
    return out;
  }, [rows, deferredQuery, model]);

  const { sortKey, dir, sorted, toggle } = useSortable<SessionRow, SessionSortKey>(
    filtered,
    compareSessions,
    "cost",
    (key) => NUMERIC.has(key),
  );

  const { isOpen, toggle: toggleRow } = useExpandable();

  // Both charts describe the whole range, so they ignore the table's search/model filters.
  const pareto = useMemo(() => derivePareto(rows), [rows]);
  const colorOf = useMemo(() => modelPalette(data.allModels), [data.allModels]);
  const scatter = useMemo(() => deriveScatter(rows, colorOf), [rows, colorOf]);
  const countLabel = sessionCountLabel(filtered.length, rows.length);

  return {
    rows,
    models,
    query,
    setQuery,
    model,
    setModel,
    filtered: sorted,
    sortKey,
    dir,
    toggleSort: toggle,
    isRowOpen: isOpen,
    toggleRow,
    pareto,
    scatter,
    countLabel,
  };
}
