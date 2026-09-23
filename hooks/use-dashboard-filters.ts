"use client";

import { useMemo, useState } from "react";
import { compareEffort, type Effort } from "@/lib/effort";
import type { Summary } from "@/lib/usage";

export type DateRangeValue = { start: string; end: string };

// `getRange()` is evaluated at click time (in the onClick handler), not
// during render — presets like "Today"/"This month" depend on the current
// date, and calling `new Date()` while building the list at render/mount
// time would freeze them as of whenever the list was built (stale after
// midnight) and is impure besides. Keeping `new Date()` out of render/useMemo
// entirely is what react-hooks's purity checks want.
export type DatePreset = { key: string; label: string; getRange: () => DateRangeValue };

// Format a Date as the local YYYY-MM-DD key the inputs/API use.
function toKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

// Default window: the last 30 days, ending today.
function defaultRange(): DateRangeValue {
  const to = new Date();
  const from = new Date();
  from.setDate(from.getDate() - 29);
  return { start: toKey(from), end: toKey(to) };
}

function daysBackRange(daysBack: number): DateRangeValue {
  const to = new Date();
  const from = new Date();
  from.setDate(from.getDate() - daysBack);
  return { start: toKey(from), end: toKey(to) };
}

// Static list — each entry's `getRange()` computes its window fresh when
// called, so the list itself never goes stale and needs no rebuilding.
const PRESETS: DatePreset[] = [
  { key: "today", label: "Today", getRange: () => ({ start: toKey(new Date()), end: toKey(new Date()) }) },
  { key: "7d", label: "7d", getRange: () => daysBackRange(6) },
  { key: "30d", label: "30d", getRange: () => daysBackRange(29) },
  { key: "90d", label: "90d", getRange: () => daysBackRange(89) },
  {
    key: "month",
    label: "This month",
    getRange: () => {
      const to = new Date();
      return { start: toKey(new Date(to.getFullYear(), to.getMonth(), 1)), end: toKey(to) };
    },
  },
  {
    key: "year",
    label: "This year",
    getRange: () => {
      const to = new Date();
      return { start: toKey(new Date(to.getFullYear(), 0, 1)), end: toKey(to) };
    },
  },
];

// "Jun 1, 2026 – Jun 28, 2026" for the Overview subtitle.
function rangeLabel({ start, end }: DateRangeValue): string {
  if (!start || !end) return "";
  const fmt = (s: string) => {
    const [y, m, d] = s.split("-").map(Number);
    return new Date(y, m - 1, d).toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  };
  return `${fmt(start)} – ${fmt(end)}`;
}

// Date range + presets + effort selection state, and the derived rangeKey
// used to reset per-range view state (search/sort/expand) when the window
// or effort filter changes. Does not depend on the fetched `Summary` (that
// would create a circular dependency with useUsageSummary, which itself
// needs `range`/`effort`); callers derive `effortOptions` from the fetched
// data with the separate `effortOptions()` helper below.
export function useDashboardFilters() {
  const [range, setRange] = useState<DateRangeValue>(defaultRange);
  const [effort, setEffort] = useState<Effort | null>(null);
  // Which preset (by key) is active, for the highlight — stored alongside
  // `range` instead of recomputed by re-calling each preset's `getRange()`
  // at render (that would need `new Date()` during render again, and would
  // false-positive-highlight "Today" after midnight even though the stored
  // range is now yesterday's). Selecting a preset sets this; editing a date
  // input directly clears it (setRangeDirect).
  const [selectedPreset, setSelectedPreset] = useState<string | null>("30d");

  const rangeKey = useMemo(() => `${range.start}_${range.end}_${effort ?? "all"}`, [range, effort]);
  const label = useMemo(() => rangeLabel(range), [range]);

  function selectPreset(preset: DatePreset) {
    setRange(preset.getRange());
    setSelectedPreset(preset.key);
  }

  // For direct edits to the From/To inputs (not a preset click).
  function setRangeDirect(next: DateRangeValue) {
    setRange(next);
    setSelectedPreset(null);
  }

  return {
    range,
    setRange: setRangeDirect,
    effort,
    setEffort,
    presets: PRESETS,
    selectedPreset,
    selectPreset,
    rangeKey,
    rangeLabel: label,
  };
}

// Keep the currently selected effort visible as a chip even if the latest
// response's availableEfforts doesn't include it (e.g. filter narrowed a
// window that no longer has that level).
export function effortOptions(data: Summary | null, effort: Effort | null): Effort[] {
  const opts = data?.availableEfforts ?? [];
  if (effort && !opts.includes(effort)) return [...opts, effort].sort(compareEffort);
  return opts;
}
