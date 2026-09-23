"use client";

import { useMemo, useState } from "react";
import { tokens } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { DateRangeInputs } from "@/components/date-range-inputs";
import { EffortFilter } from "@/components/effort-filter";
import { OverviewView } from "@/components/views/overview";
import { SessionsView } from "@/components/views/sessions";
import { ProjectsView } from "@/components/views/projects";
import { DailyView } from "@/components/views/daily";
import { EfficiencyView } from "@/components/views/efficiency";
import { PatternsView } from "@/components/views/patterns";
import { effortOptions, useDashboardFilters } from "@/hooks/use-dashboard-filters";
import { useUsageSummary } from "@/hooks/use-usage-summary";

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
  const [view, setView] = useState<View>("overview");
  const { range, setRange, effort, setEffort, presets, selectedPreset, selectPreset, rangeKey, rangeLabel } =
    useDashboardFilters();
  const { data, error, loading, refresh } = useUsageSummary(range, effort);
  const effortOpts = useMemo(() => effortOptions(data, effort), [data, effort]);

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
          <DateRangeInputs
            value={range}
            onChange={setRange}
            presets={presets}
            selectedPreset={selectedPreset}
            onSelectPreset={selectPreset}
          />
          <EffortFilter value={effort} options={effortOpts} onChange={setEffort} />
          <Button variant="outline" size="sm" onClick={refresh} disabled={loading} title="Re-scan transcripts">
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
        <div className={loading ? "opacity-60 transition-opacity" : "transition-opacity"}>
          {view === "overview" && <OverviewView data={data} rangeLabel={rangeLabel} />}
          {view === "sessions" && <SessionsView key={rangeKey} data={data} />}
          {view === "projects" && <ProjectsView key={rangeKey} data={data} />}
          {view === "daily" && <DailyView data={data} />}
          {view === "efficiency" && <EfficiencyView data={data} />}
          {view === "patterns" && <PatternsView data={data} />}

          <footer className="mt-10 border-t pt-4 text-xs text-muted-foreground">
            Parsed {tokens(data.totals.messages)} messages in {data.parseMs} ms · data cached, click Refresh to re-scan ·
            costs are list-price equivalents, not your subscription billing.
          </footer>
        </div>
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
