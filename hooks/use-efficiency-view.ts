"use client";

import { useMemo } from "react";
import type { EffortBucket, ModelBucket, Summary } from "@/lib/usage";
import { EFFORT_LABEL, EFFORT_ORDER, type Effort } from "@/lib/effort";
import { cacheShare, dayKeyOf, modelPalette, shortDay, shortModel, tokens, usdExact, usdFine, num, fmtDelta } from "@/lib/format";
import { pctDelta, safeDiv } from "@/lib/stats";
import { useExpandable } from "@/hooks/use-expandable";
import { deriveEffortCostPerMsg } from "@/lib/derive";

// --- efficiency helpers (token "bang per buck") ---
type Tokens = { input: number; output: number; cacheCreate: number; cacheRead: number };

// Share of fresh token flow that is the model *generating* vs you feeding context.
export function outputShare(t: Tokens): number {
  const denom = t.input + t.output;
  return denom > 0 ? (t.output / denom) * 100 : 0;
}

// Output tokens produced per $ of API-equivalent cost — the bottom-line "value per spend".
export function outputPerDollar(cost: number, output: number): number {
  return cost > 0 ? output / cost : 0;
}

// ---- headline KPIs ----
export interface ActionKpi {
  key: "costPerMsg" | "saved" | "bestOutput" | "effortRatio";
  label: string;
  value: string;
  sub: string;
}

export function deriveEfficiencyKpis(s: Summary): ActionKpi[] {
  const t = s.totals;
  const cpm = safeDiv(t.cost, t.messages);
  const prev = s.previous;
  const vsWhat = prev?.partial ? "same point in previous period" : prev ? `${shortDay(dayKeyOf(prev.from))} – ${shortDay(dayKeyOf(prev.to))}` : "";
  const vsPrev = prev
    ? `${fmtDelta(pctDelta(cpm, safeDiv(prev.totals.cost, prev.totals.messages)))} vs ${vsWhat}`
    : "no earlier period to compare with";

  // Best model by output tokens per $, compared against the model that costs the most.
  const ranked = s.byModel
    .filter((m) => m.cost > 0 && m.output > 0)
    .map((m) => ({ m, pd: outputPerDollar(m.cost, m.output) }))
    .sort((a, b) => b.pd - a.pd);
  const best = ranked[0];
  const topSpend = s.byModel.filter((m) => m.cost > 0).sort((a, b) => b.cost - a.cost)[0];
  const topRanked = ranked.find((r) => r.m.model === topSpend?.model);
  const bestSub = !best
    ? "no output recorded in this range"
    : `${tokens(Math.round(best.pd))} output tokens per $` +
      (topRanked && topRanked.m.model !== best.m.model ? ` (${shortModel(topRanked.m.model)}: ${tokens(Math.round(topRanked.pd))})` : "");

  const effort = deriveEffortCostPerMsg(s);

  return [
    { key: "costPerMsg", label: "Cost per message", value: usdFine(cpm), sub: vsPrev },
    {
      key: "saved",
      label: "Saved by caching",
      value: usdExact(s.cacheNetSaved),
      sub: `${cacheShare(t).toFixed(1)}% of input-side tokens were cache reads`,
    },
    { key: "bestOutput", label: "Best output per $", value: best ? shortModel(best.m.model) : "—", sub: bestSub },
    {
      key: "effortRatio",
      label: "Max vs Low effort",
      value: effort.ratioLabel ?? "—",
      sub: effort.ratioLabel ? "cost per message at Max relative to Low" : "needs both Low and Max effort in range",
    },
  ];
}

// ---- per-model table (expandable by effort) ----
export interface EfficiencyMetrics {
  messages: number;
  cost: number;
  costLabel: string;
  costPerMsg: number;
  costPerMsgLabel: string;
  outShare: number;
  outShareLabel: string;
  cacheShare: number;
  cacheShareLabel: string;
  perDollar: number;
  perDollarLabel: string;
}

export interface EfficiencyModelRow extends EfficiencyMetrics {
  model: string;
  label: string;
  color: string;
  efforts: Array<EfficiencyMetrics & { effort: Effort; label: string }>;
}

function metricsOf(b: ModelBucket | EffortBucket): EfficiencyMetrics {
  const costPerMsg = safeDiv(b.cost, b.messages);
  const perDollar = outputPerDollar(b.cost, b.output);
  return {
    messages: b.messages,
    cost: b.cost,
    costLabel: usdExact(b.cost),
    costPerMsg,
    costPerMsgLabel: usdFine(costPerMsg),
    outShare: outputShare(b),
    outShareLabel: `${outputShare(b).toFixed(0)}%`,
    cacheShare: cacheShare(b),
    cacheShareLabel: `${cacheShare(b).toFixed(0)}%`,
    perDollar,
    perDollarLabel: num(Math.round(perDollar)),
  };
}

export function deriveModelRows(byModel: ModelBucket[], allModels: string[] = byModel.map((m) => m.model)): EfficiencyModelRow[] {
  const colorOf = modelPalette(allModels);
  return byModel
    .filter((m) => m.cost > 0)
    .sort((a, b) => b.cost - a.cost)
    .map((m) => ({
      model: m.model,
      label: shortModel(m.model),
      color: colorOf(m.model),
      ...metricsOf(m),
      efforts: (m.efforts ?? []).map((e) => ({ effort: e.effort, label: EFFORT_LABEL[e.effort], ...metricsOf(e) })),
    }));
}

// ---- effort x model grid ----
export interface GridCell {
  value: number | null; // cost per message; null = this model never ran at this effort
  label: string;
  intensity: number; // 0 (cheapest cell) .. 1 (priciest cell)
  alpha: number; // background opacity derived from intensity
  strong: boolean; // background dense enough that the label needs the on-primary text colour
  tip: string;
}

export interface EffortModelGrid {
  models: Array<{ model: string; label: string }>; // columns, cost desc
  efforts: Array<{ effort: Effort; label: string }>; // rows, low -> max
  cells: GridCell[][]; // [effortRow][modelCol]
}

export function effortModelGrid(byModel: ModelBucket[]): EffortModelGrid {
  const models = byModel.filter((m) => m.cost > 0).sort((a, b) => b.cost - a.cost);
  const present = new Set<Effort>();
  for (const m of models) for (const e of m.efforts ?? []) if (e.messages > 0) present.add(e.effort);
  const efforts = EFFORT_ORDER.filter((e) => present.has(e));

  const raw = efforts.map((effort) =>
    models.map((m) => {
      const e = m.efforts?.find((x) => x.effort === effort);
      return e && e.messages > 0 ? safeDiv(e.cost, e.messages) : null;
    }),
  );
  const vals = raw.flat().filter((v): v is number => v !== null);
  const lo = Math.min(...vals);
  const hi = Math.max(...vals);

  const cells = raw.map((row, ri) =>
    row.map((value, ci): GridCell => {
      const intensity = value === null || hi === lo ? 0 : (value - lo) / (hi - lo);
      return {
        value,
        label: value === null ? "—" : usdFine(value),
        intensity,
        alpha: value === null ? 0 : 0.08 + intensity * 0.5,
        strong: value !== null && 0.08 + intensity * 0.5 > 0.4,
        tip: `${shortModel(models[ci].model)} at ${EFFORT_LABEL[efforts[ri]]} effort: ${value === null ? "no messages" : `${usdFine(value)} per message`}`,
      };
    }),
  );

  return {
    models: models.map((m) => ({ model: m.model, label: shortModel(m.model) })),
    efforts: efforts.map((effort) => ({ effort, label: EFFORT_LABEL[effort] })),
    cells,
  };
}

/** Generated takeaway under the grid. `ratioLabel` is the Max-vs-Low multiple, if known. */
export function effortGridNote(grid: EffortModelGrid, ratioLabel: string | null): string {
  const filled = (ri: number) => grid.cells[ri].map((c, ci) => ({ c, ci })).filter((x) => x.c.value !== null);
  const highRow = grid.efforts.findIndex((e) => e.effort === "high");
  let row = highRow >= 0 && filled(highRow).length >= 2 ? highRow : -1;
  if (row < 0) {
    let bestCount = 1; // need at least two models to compare
    grid.efforts.forEach((_, ri) => {
      if (filled(ri).length > bestCount) {
        bestCount = filled(ri).length;
        row = ri;
      }
    });
  }
  const ratio = ratioLabel ? `Max effort costs ${ratioLabel} Low.` : "";
  if (row < 0) return `Not enough models share an effort level to compare them. ${ratio}`.trim();

  const cells = filled(row).sort((a, b) => (a.c.value as number) - (b.c.value as number));
  const cheap = cells[0];
  const pricey = cells[cells.length - 1];
  return (
    `For ${grid.efforts[row].label}-effort work, ${grid.models[cheap.ci].label} costs ${cheap.c.label} per message ` +
    `vs ${pricey.c.label} on ${grid.models[pricey.ci].label}. ${ratio}`
  ).trim();
}

// Efficiency view model: headline KPIs, the expandable per-model table, and
// the effort x model grid with its generated note.
export function useEfficiencyView(data: Summary) {
  const kpis = useMemo(() => deriveEfficiencyKpis(data), [data]);
  const modelRows = useMemo(() => deriveModelRows(data.byModel, data.allModels), [data.byModel, data.allModels]);
  const grid = useMemo(() => effortModelGrid(data.byModel), [data.byModel]);
  const gridNote = useMemo(() => effortGridNote(grid, deriveEffortCostPerMsg(data).ratioLabel), [grid, data]);
  const { isOpen: isModelOpen, toggle: toggleModel } = useExpandable();

  return { kpis, modelRows, grid, gridNote, isModelOpen, toggleModel };
}
