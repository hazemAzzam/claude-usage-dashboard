"use client";

import { useMemo } from "react";
import type { ProjectRow, Summary } from "@/lib/usage";
import { cacheShare } from "@/lib/format";
import { useSortable } from "@/hooks/use-sortable";
import { useExpandable } from "@/hooks/use-expandable";

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

export type EfficiencySortKey = "project" | "sessions" | "cost" | "output" | "perDollar" | "outShare" | "cacheShare";

export type EfficiencyProjectRow = {
  row: ProjectRow;
  perDollar: number;
  outShare: number;
  cacheShare: number;
};

function compareEfficiency(a: EfficiencyProjectRow, b: EfficiencyProjectRow, key: EfficiencySortKey): number {
  switch (key) {
    case "project":
      return a.row.project.localeCompare(b.row.project);
    case "sessions":
      return a.row.sessions - b.row.sessions;
    case "cost":
      return a.row.cost - b.row.cost;
    case "output":
      return a.row.output - b.row.output;
    case "perDollar":
      return a.perDollar - b.perDollar;
    case "outShare":
      return a.outShare - b.outShare;
    case "cacheShare":
      return a.cacheShare - b.cacheShare;
  }
}

// Efficiency view model: per-project metrics + sortable rows, per-model list
// (cost-desc), model-breakdown row expansion, and the overall baseline used
// to color a project's Output/$ above/below average.
export function useEfficiencyView(data: Summary) {
  const { totals } = data;

  const projectMetrics = useMemo<EfficiencyProjectRow[]>(
    () =>
      data.byProject
        .filter((p) => p.cost > 0)
        .map((p) => ({
          row: p,
          perDollar: outputPerDollar(p.cost, p.output),
          outShare: outputShare(p),
          cacheShare: cacheShare(p),
        })),
    [data.byProject],
  );

  const { sortKey, dir, sorted, toggle } = useSortable<EfficiencyProjectRow, EfficiencySortKey>(
    projectMetrics,
    compareEfficiency,
    "perDollar",
    (key) => key !== "project",
  );

  const { isOpen: isModelOpen, toggle: toggleModel } = useExpandable();

  const models = useMemo(() => [...data.byModel].filter((m) => m.cost > 0).sort((a, b) => b.cost - a.cost), [data.byModel]);

  const baseline = outputPerDollar(totals.cost, totals.output);

  return {
    totals,
    baseline,
    models,
    isModelOpen,
    toggleModel,
    projectRows: sorted,
    sortKey,
    dir,
    toggleSort: toggle,
  };
}
