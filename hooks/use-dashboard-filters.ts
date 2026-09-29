"use client";

import { useMemo, useState } from "react";
import type { DateRange } from "react-day-picker";
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
export function toKey(d: Date): string {
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
    return new Date(y, m - 1, d).toLocaleDateString("en-US", {
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
  // range is now yesterday's). Selecting a preset sets this; applying a
  // hand-picked popover range clears it (applyRange).
  const [selectedPreset, setSelectedPreset] = useState<string | null>("30d");

  const rangeKey = useMemo(() => `${range.start}_${range.end}_${effort ?? "all"}`, [range, effort]);
  const label = useMemo(() => rangeLabel(range), [range]);

  function selectPreset(preset: DatePreset) {
    setRange(preset.getRange());
    setSelectedPreset(preset.key);
  }

  function selectPresetKey(key: string) {
    const preset = PRESETS.find((p) => p.key === key);
    if (preset) selectPreset(preset);
  }

  // Commit a range chosen in the date popover; keeps the preset highlight if
  // the applied range is still an untouched preset pick.
  function applyRange(next: DateRangeValue, presetKey: string | null) {
    setRange(next);
    setSelectedPreset(presetKey);
  }

  return {
    range,
    applyRange,
    effort,
    setEffort,
    presets: PRESETS,
    selectedPreset,
    selectPreset,
    selectPresetKey,
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

// ---- date-range popover draft (top bar's DateRangePicker) ----
//
// The popover edits a *draft* range; nothing reaches the dashboard filters
// until Apply, and Cancel/close discards it. The helpers below are pure and
// exported so the presentational picker never does date math itself.

// "2026-06-08" -> local Date (a plain `new Date("2026-06-08")` would parse as
// UTC and shift a day in negative-offset timezones).
export function parseKey(s: string): Date {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, m - 1, d);
}

// Inclusive number of calendar days between two YYYY-MM-DD keys.
export function dayCount(start: string, end: string): number {
  const a = parseKey(start);
  const b = parseKey(end);
  // Round: a DST change makes the ms difference off by an hour either way.
  return Math.round((b.getTime() - a.getTime()) / 86_400_000) + 1;
}

export function valueToDraft(value: DateRangeValue): DateRange | undefined {
  return value.start && value.end ? { from: parseKey(value.start), to: parseKey(value.end) } : undefined;
}

// A draft is only appliable once both ends are picked.
export function draftToValue(draft: DateRange | undefined): DateRangeValue | null {
  return draft?.from && draft.to ? { start: toKey(draft.from), end: toKey(draft.to) } : null;
}

const shortDate = (d: Date, withYear: boolean) =>
  d.toLocaleDateString("en-US", { month: "short", day: "numeric", ...(withYear ? { year: "numeric" } : {}) });

export function draftLabel(draft: DateRange | undefined): string {
  if (!draft?.from) return "Pick a start date";
  if (!draft.to) return shortDate(draft.from, true);
  return `${shortDate(draft.from, false)} – ${shortDate(draft.to, true)}`;
}

export function draftHint(draft: DateRange | undefined): string {
  if (!draft?.from) return "";
  if (!draft.to) return "Pick an end date";
  const days = dayCount(toKey(draft.from), toKey(draft.to));
  return `${days} ${days === 1 ? "day" : "days"}`;
}

// The compact presets shown in the top bar's segmented control ("Today" and
// the longer windows live only in the popover's list).
const SEGMENT_KEYS = new Set(["7d", "30d", "90d", "month", "year"]);
export function segmentPresets(presets: DatePreset[]): DatePreset[] {
  return presets.filter((p) => SEGMENT_KEYS.has(p.key));
}

export type PresetRow = { key: string; label: string; hint: string; active: boolean };

// Popover preset list with "N days" hints. `days` is evaluated by the caller
// at open time (see useDateRangeDraft) so this stays render-pure.
export function presetRows(presets: DatePreset[], days: Record<string, number>, activeKey: string | null): PresetRow[] {
  return presets.map((p) => ({
    key: p.key,
    label: p.label,
    hint: p.key in days ? `${days[p.key]}d` : "",
    active: activeKey === p.key,
  }));
}

export function useDateRangeDraft(
  value: DateRangeValue,
  presets: DatePreset[],
  selectedPreset: string | null,
  onApply: (next: DateRangeValue, presetKey: string | null) => void,
) {
  const [open, setOpenState] = useState(false);
  const [draft, setDraft] = useState<DateRange | undefined>(() => valueToDraft(value));
  const [month, setMonth] = useState<Date>(() => parseKey(value.start || toKey(new Date())));
  const [activePreset, setActivePreset] = useState<string | null>(selectedPreset);
  const [days, setDays] = useState<Record<string, number>>({});

  // Reset the draft from the committed value every time the popover opens
  // (in the event handler, not an effect) so Cancel/outside-click never leaves
  // a stale draft behind. Preset day counts are computed here too — they call
  // each preset's getRange(), which reads the current date.
  function setOpen(next: boolean) {
    if (next) {
      setDraft(valueToDraft(value));
      setMonth(parseKey(value.start || toKey(new Date())));
      setActivePreset(selectedPreset);
      setDays(
        Object.fromEntries(
          presets.map((p) => {
            const r = p.getRange();
            return [p.key, dayCount(r.start, r.end)];
          }),
        ),
      );
    }
    setOpenState(next);
  }

  function pickPreset(key: string) {
    const preset = presets.find((p) => p.key === key);
    if (!preset) return;
    const r = preset.getRange();
    setDraft(valueToDraft(r));
    setMonth(parseKey(r.start));
    setActivePreset(key);
  }

  // A hand-picked calendar selection is no longer any preset.
  function pickRange(next: DateRange | undefined) {
    setDraft(next);
    setActivePreset(null);
  }

  const applied = draftToValue(draft);

  function apply() {
    if (!applied) return;
    onApply(applied, activePreset);
    setOpenState(false);
  }

  return {
    open,
    setOpen,
    draft,
    pickRange,
    month,
    setMonth,
    rows: presetRows(presets, days, activePreset),
    pickPreset,
    label: draftLabel(draft),
    hint: draftHint(draft),
    canApply: applied !== null,
    apply,
    cancel: () => setOpenState(false),
  };
}
