"use client";

import { useMemo } from "react";
import type { Summary } from "@/lib/usage";
import { usd, usdExact } from "@/lib/format";
import { shareOf, sum } from "@/lib/stats";

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const WEEKDAYS_LONG = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
// Monday-first reading order for the grid (heatmap is indexed 0 = Sunday).
const ORDER = [1, 2, 3, 4, 5, 6, 0];

export interface HeatmapMarginals {
  rowTotals: number[]; // 7, indexed by weekday (0 = Sun)
  colTotals: number[]; // 24, indexed by hour
  total: number;
  maxCell: number;
  peakWeekday: number;
  peakHour: number;
}

/** Sum each weekday row and each hour column of heatmap[weekday][hour]; find the peaks. */
export function heatmapMarginals(heatmap: number[][]): HeatmapMarginals {
  const rowTotals = heatmap.map((row) => sum(row));
  const colTotals = Array.from({ length: 24 }, (_, h) => sum(heatmap.map((row) => row[h] ?? 0)));
  const argmax = (xs: number[]) => xs.reduce((best, x, i) => (x > xs[best] ? i : best), 0);
  return {
    rowTotals,
    colTotals,
    total: sum(rowTotals),
    maxCell: Math.max(0, ...heatmap.flat()),
    peakWeekday: argmax(rowTotals),
    peakHour: argmax(colTotals),
  };
}

export interface PatternStat {
  label: string;
  value: string;
  sub: string;
}

const hh = (h: number) => `${String(h).padStart(2, "0")}:00`;

export function derivePatternStats(heatmap: number[][]): PatternStat[] {
  const m = heatmapMarginals(heatmap);
  const active = m.colTotals.filter((c) => shareOf(c, m.total) > 0.01).length;
  const peakHourCost = m.colTotals[m.peakHour] ?? 0;
  return [
    { label: "Peak hour", value: `${hh(m.peakHour)}–${hh((m.peakHour + 1) % 24)}`, sub: `${usd(peakHourCost)} in range` },
    { label: "Peak day", value: WEEKDAYS_LONG[m.peakWeekday], sub: `${usd(m.rowTotals[m.peakWeekday] ?? 0)} in range` },
    {
      label: "Busiest hour share",
      value: `${(shareOf(peakHourCost, m.total) * 100).toFixed(1)}%`,
      sub: "of total cost",
    },
    { label: "Active hours", value: `${active} / 24`, sub: "hours with more than 1% of cost" },
  ];
}

// ---- presentational model for the grid ----
export interface HeatCell {
  hour: number;
  alpha: number; // 0 = empty cell, else 0.12..1
  tip: string;
}

export interface HeatRow {
  weekday: number;
  label: string;
  cells: HeatCell[];
  totalLabel: string;
  totalPct: number; // relative to the busiest weekday (0..100)
}

export interface HeatCol {
  hour: number;
  tip: string;
  heightPct: number; // relative to the busiest hour (0..100)
}

// Screen-reader equivalent of the grid (the visual grid is aria-hidden).
export interface HeatTable {
  head: string[]; // "Day", then one entry per hour, then "Total"
  rows: Array<{ label: string; values: string[]; total: string }>; // values[hour]
  footer: { label: string; values: string[]; total: string }; // hourly totals
}

export interface HeatmapModel {
  rows: HeatRow[];
  table: HeatTable;
  cols: HeatCol[];
  hourLabels: Array<{ hour: number; label: string }>; // sparse: every 3rd hour is labelled
  maxLabel: string; // legend upper bound
}

export function deriveHeatmapModel(heatmap: number[][]): HeatmapModel {
  const m = heatmapMarginals(heatmap);
  const maxRow = Math.max(0, ...m.rowTotals);
  const maxCol = Math.max(0, ...m.colTotals);
  const hours = Array.from({ length: 24 }, (_, h) => hh(h));
  return {
    table: {
      head: ["Day", ...hours, "Total"],
      rows: ORDER.map((wd) => ({
        label: WEEKDAYS_LONG[wd],
        values: Array.from({ length: 24 }, (_, h) => usdExact(heatmap[wd]?.[h] ?? 0)),
        total: usdExact(m.rowTotals[wd]),
      })),
      footer: { label: "All days", values: m.colTotals.map((c) => usdExact(c)), total: usdExact(m.total) },
    },
    rows: ORDER.map((wd) => ({
      weekday: wd,
      label: WEEKDAYS[wd],
      cells: Array.from({ length: 24 }, (_, h) => {
        const cost = heatmap[wd]?.[h] ?? 0;
        return {
          hour: h,
          alpha: cost > 0 ? 0.12 + shareOf(cost, m.maxCell) * 0.88 : 0,
          tip: `${WEEKDAYS_LONG[wd]} ${hh(h)} — ${usdExact(cost)}`,
        };
      }),
      totalLabel: usd(m.rowTotals[wd]),
      totalPct: shareOf(m.rowTotals[wd], maxRow) * 100,
    })),
    cols: m.colTotals.map((c, h) => ({ hour: h, tip: `${hh(h)} — ${usdExact(c)} total`, heightPct: shareOf(c, maxCol) * 100 })),
    hourLabels: Array.from({ length: 24 }, (_, h) => ({ hour: h, label: h % 3 === 0 ? String(h) : "" })),
    maxLabel: usd(m.maxCell),
  };
}

/** True when any cell has cost; an all-zero grid shows the empty state instead of a blank chart. */
export function hasHeatmapData(heatmap: number[][]): boolean {
  return heatmapMarginals(heatmap).total > 0;
}

export function usePatternsView(data: Summary) {
  const stats = useMemo(() => derivePatternStats(data.heatmap), [data.heatmap]);
  const model = useMemo(() => deriveHeatmapModel(data.heatmap), [data.heatmap]);
  return { stats, model, hasData: hasHeatmapData(data.heatmap) };
}
