"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { Summary } from "@/lib/usage";
import { tokens } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { DateRangeInputs, type DateRangeValue } from "@/components/date-range-inputs";
import { EffortFilter } from "@/components/effort-filter";
import { compareEffort, type Effort } from "@/lib/effort";
import { OverviewView } from "@/components/views/overview";
import { SessionsView } from "@/components/views/sessions";
import { ProjectsView } from "@/components/views/projects";
import { DailyView } from "@/components/views/daily";
import { EfficiencyView } from "@/components/views/efficiency";
import { PatternsView } from "@/components/views/patterns";

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

// The Base-UI tabs' built-in active style uses `data-active:` variants that don't
// compile under Tailwind v3, so we drive the highlight from controlled state here.
const tabCls = (on: boolean) =>
  on ? "!bg-primary !text-primary-foreground shadow-sm" : "";

type View = "overview" | "sessions" | "projects" | "daily" | "efficiency" | "patterns";
const VIEWS: { key: View; label: string }[] = [
  { key: "overview", label: "Overview" },
  { key: "sessions", label: "Sessions" },
  { key: "projects", label: "Projects" },
  { key: "daily", label: "Daily" },
  { key: "efficiency", label: "Efficiency" },
  { key: "patterns", label: "Patterns" },
];

export default function Page() {
  const [range, setRange] = useState<DateRangeValue>(defaultRange);
  const [effort, setEffort] = useState<Effort | null>(null);
  const [view, setView] = useState<View>("overview");
  const [data, setData] = useState<Summary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async (r: DateRangeValue, ef: Effort | null, refresh = false, signal?: AbortSignal) => {
    if (!r.start || !r.end) return;
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ start: r.start, end: r.end });
      if (ef) params.set("effort", ef);
      if (refresh) params.set("refresh", "1");
      const res = await fetch(`/api/usage?${params.toString()}`, { signal });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Request failed");
      setData(json);
    } catch (e) {
      if (e instanceof DOMException && e.name === "AbortError") return;
      setError(e instanceof Error ? e.message : "Failed to load");
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, []);

  // Cancel the in-flight request when range/effort change again before it
  // resolves, so a stale (slower, earlier) response never overwrites newer
  // state — without this, overlapping fetches race and the last to resolve
  // wins regardless of which request was issued more recently.
  useEffect(() => {
    const controller = new AbortController();
    load(range, effort, false, controller.signal);
    return () => controller.abort();
  }, [range, effort, load]);

  // Stable string key for resetting per-range view state when the window or
  // effort filter changes.
  const rangeKey = useMemo(() => `${range.start}_${range.end}_${effort ?? "all"}`, [range, effort]);
  const label = rangeLabel(range);

  // Keep the currently selected effort visible as a chip even if the latest
  // response's availableEfforts doesn't include it (e.g. filter narrowed a
  // window that no longer has that level).
  const effortOptions = useMemo(() => {
    const opts = data?.availableEfforts ?? [];
    if (effort && !opts.includes(effort)) return [...opts, effort].sort(compareEffort);
    return opts;
  }, [data, effort]);

  return (
    <main className="mx-auto max-w-6xl px-5 py-8">
      <header className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Claude Code Usage</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            API-equivalent cost &amp; token usage from your local{" "}
            <code className="rounded bg-muted px-1.5 py-0.5 text-[12px]">~/.claude/projects</code> transcripts.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <DateRangeInputs value={range} onChange={setRange} />
          <EffortFilter value={effort} options={effortOptions} onChange={setEffort} />
          <Button variant="outline" size="sm" onClick={() => load(range, effort, true)} disabled={loading} title="Re-scan transcripts">
            {loading ? "…" : "↻ Refresh"}
          </Button>
        </div>
      </header>

      <Tabs value={view} onValueChange={(v) => setView(v as View)} className="mb-6">
        <TabsList>
          {VIEWS.map((v) => (
            <TabsTrigger key={v.key} value={v.key} className={tabCls(view === v.key)}>
              {v.label}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      {error && (
        <div className="mb-6 rounded-lg border border-destructive/50 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {error}
        </div>
      )}

      {!data && !error && <Skeleton />}

      {data && (
        <>
          {view === "overview" && <OverviewView data={data} rangeLabel={label} />}
          {view === "sessions" && <SessionsView key={rangeKey} data={data} />}
          {view === "projects" && <ProjectsView key={rangeKey} data={data} />}
          {view === "daily" && <DailyView data={data} />}
          {view === "efficiency" && <EfficiencyView data={data} />}
          {view === "patterns" && <PatternsView data={data} />}

          <footer className="mt-10 border-t pt-4 text-xs text-muted-foreground">
            Parsed {tokens(data.totals.messages)} messages in {data.parseMs} ms · data cached, click Refresh to re-scan ·
            costs are list-price equivalents, not your subscription billing.
          </footer>
        </>
      )}
    </main>
  );
}

function Skeleton() {
  return (
    <div className="grid animate-pulse grid-cols-2 gap-4 md:grid-cols-4">
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className="h-24 rounded-xl border bg-card" />
      ))}
    </div>
  );
}
