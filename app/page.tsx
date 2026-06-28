"use client";

import { useCallback, useEffect, useState } from "react";
import type { Summary, Range } from "@/lib/usage";
import { tokens } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { OverviewView } from "@/components/views/overview";
import { SessionsView } from "@/components/views/sessions";
import { ProjectsView } from "@/components/views/projects";
import { DailyView } from "@/components/views/daily";
import { PatternsView } from "@/components/views/patterns";

const RANGES: { key: Range; label: string }[] = [
  { key: "7d", label: "7 days" },
  { key: "30d", label: "30 days" },
  { key: "90d", label: "90 days" },
  { key: "all", label: "All time" },
];

// The Base-UI tabs' built-in active style uses `data-active:` variants that don't
// compile under Tailwind v3, so we drive the highlight from controlled state here.
const tabCls = (on: boolean) =>
  on ? "!bg-primary !text-primary-foreground shadow-sm" : "";

type View = "overview" | "sessions" | "projects" | "daily" | "patterns";
const VIEWS: { key: View; label: string }[] = [
  { key: "overview", label: "Overview" },
  { key: "sessions", label: "Sessions" },
  { key: "projects", label: "Projects" },
  { key: "daily", label: "Daily" },
  { key: "patterns", label: "Patterns" },
];

export default function Page() {
  const [range, setRange] = useState<Range>("30d");
  const [view, setView] = useState<View>("overview");
  const [data, setData] = useState<Summary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async (r: Range, refresh = false) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/usage?range=${r}${refresh ? "&refresh=1" : ""}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Request failed");
      setData(json);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load(range);
  }, [range, load]);

  const rangeLabel = RANGES.find((r) => r.key === range)?.label;

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
        <div className="flex items-center gap-2">
          <Tabs value={range} onValueChange={(v) => setRange(v as Range)}>
            <TabsList>
              {RANGES.map((r) => (
                <TabsTrigger key={r.key} value={r.key} className={tabCls(range === r.key)}>
                  {r.label}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
          <Button variant="outline" size="sm" onClick={() => load(range, true)} disabled={loading} title="Re-scan transcripts">
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
          {view === "overview" && <OverviewView data={data} rangeLabel={rangeLabel} />}
          {view === "sessions" && <SessionsView key={range} data={data} />}
          {view === "projects" && <ProjectsView key={range} data={data} />}
          {view === "daily" && <DailyView data={data} />}
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
