"use client";

import { useMemo, useState } from "react";
import type { ModelBucket, Summary } from "@/lib/usage";
import { num, tokens, usdExact } from "@/lib/format";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableRow, TableHeader } from "@/components/ui/table";
import { Empty, Kpi, MiniStat, shortModel, SortHeader } from "@/components/stats";
import { EfficiencyBars } from "@/components/charts";

// --- efficiency helpers (token "bang per buck") ---
type Tokens = { input: number; output: number; cacheCreate: number; cacheRead: number };

// Share of fresh token flow that is the model *generating* vs you feeding context.
function outputShare(t: Tokens): number {
  const denom = t.input + t.output;
  return denom > 0 ? (t.output / denom) * 100 : 0;
}

// Share of all input volume served cheaply from cache (cache reads ≈ 10% of input price).
function cacheShare(t: Tokens): number {
  const denom = t.input + t.cacheCreate + t.cacheRead;
  return denom > 0 ? (t.cacheRead / denom) * 100 : 0;
}

// Output tokens produced per $ of API-equivalent cost — the bottom-line "value per spend".
function outputPerDollar(cost: number, output: number): number {
  return cost > 0 ? output / cost : 0;
}

type Key =
  | "project"
  | "sessions"
  | "cost"
  | "output"
  | "perDollar"
  | "outShare"
  | "cacheShare";

export function EfficiencyView({ data }: { data: Summary }) {
  const { totals } = data;

  const [sortKey, setSortKey] = useState<Key>("perDollar");
  const [dir, setDir] = useState<"asc" | "desc">("desc");

  // Overall baseline used to color each project as above/below your own average.
  const baseline = outputPerDollar(totals.cost, totals.output);

  const projectRows = useMemo(() => {
    const withMetrics = data.byProject
      .filter((p) => p.cost > 0)
      .map((p) => ({
        row: p,
        perDollar: outputPerDollar(p.cost, p.output),
        outShare: outputShare(p),
        cacheShare: cacheShare(p),
      }));

    withMetrics.sort((a, b) => {
      switch (sortKey) {
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
    });
    if (dir === "desc") withMetrics.reverse();
    return withMetrics;
  }, [data.byProject, sortKey, dir]);

  function toggle(key: Key) {
    if (sortKey === key) setDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSortKey(key);
      setDir(key === "project" ? "asc" : "desc");
    }
  }

  if (!totals.sessions) return <Empty />;

  const models: ModelBucket[] = [...data.byModel].filter((m) => m.cost > 0).sort((a, b) => b.cost - a.cost);

  return (
    <div className="space-y-4">
      {/* Headline efficiency KPIs */}
      <section className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <Kpi
          label="Output share"
          value={`${outputShare(totals).toFixed(0)}%`}
          sub="generated vs. fed context"
          hint={outputShare(totals)}
        />
        <Kpi
          label="Cache-read share"
          value={`${cacheShare(totals).toFixed(0)}%`}
          sub="input served from cache"
          hint={cacheShare(totals)}
        />
        <Kpi
          label="Output per $"
          value={`${num(Math.round(baseline))}`}
          sub="tokens per dollar"
        />
        <Kpi
          label="Cost per session"
          value={usdExact(totals.sessions ? totals.cost / totals.sessions : 0)}
          sub={`${num(totals.sessions)} sessions`}
        />
      </section>

      {/* Secondary stats */}
      <section className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <MiniStat
          label="Cost / message"
          value={usdExact(totals.messages ? totals.cost / totals.messages : 0)}
          hint={`${num(totals.messages)} messages`}
        />
        <MiniStat
          label="Avg output / session"
          value={tokens(Math.round(totals.sessions ? totals.output / totals.sessions : 0))}
        />
        <MiniStat
          label="Avg context / session"
          value={tokens(Math.round(totals.sessions ? (totals.input + totals.cacheRead) / totals.sessions : 0))}
          hint="fresh input + cache read"
        />
        <MiniStat label="Total output" value={tokens(totals.output)} />
      </section>

      {/* What the numbers mean */}
      <Card>
        <CardContent className="pt-6 text-xs leading-relaxed text-muted-foreground">
          <span className="font-medium text-foreground">How to read this:</span>{" "}
          <span className="text-foreground">Output share</span> is how much of your token flow the model
          actually generates (higher = less context overhead).{" "}
          <span className="text-foreground">Cache-read share</span> is how much input is reused cheaply from
          cache instead of re-sent at full price (higher = far cheaper sessions).{" "}
          <span className="text-foreground">Output&nbsp;per&nbsp;$</span> is the bottom line — the same spend
          buying more output means better utilization. The project table below shows where you&apos;re efficient
          and where context overhead is dragging you down.
        </CardContent>
      </Card>

      {/* Output per dollar by project */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium">Output per $ by project</CardTitle>
        </CardHeader>
        <CardContent>
          <EfficiencyBars data={data.byProject} />
        </CardContent>
      </Card>

      {/* Per-model efficiency */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium">Efficiency by model</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-auto rounded-md border">
            <Table>
              <TableHeader className="bg-card">
                <TableRow>
                  <TableCell className="font-medium">Model</TableCell>
                  <TableCell className="text-right font-medium">Msgs</TableCell>
                  <TableCell className="text-right font-medium">Cost</TableCell>
                  <TableCell className="text-right font-medium">Output</TableCell>
                  <TableCell className="text-right font-medium">Output / $</TableCell>
                  <TableCell className="text-right font-medium">Output %</TableCell>
                </TableRow>
              </TableHeader>
              <TableBody>
                {models.map((m) => (
                  <TableRow key={m.model}>
                    <TableCell className="whitespace-nowrap font-medium">{shortModel(m.model)}</TableCell>
                    <TableCell className="text-right tabular-nums text-muted-foreground">{num(m.messages)}</TableCell>
                    <TableCell className="text-right tabular-nums text-muted-foreground">{usdExact(m.cost)}</TableCell>
                    <TableCell className="text-right tabular-nums text-muted-foreground">{tokens(m.output)}</TableCell>
                    <TableCell className="text-right font-medium tabular-nums">
                      {num(Math.round(outputPerDollar(m.cost, m.output)))}
                    </TableCell>
                    <TableCell className="text-right tabular-nums text-muted-foreground">
                      {outputShare(m).toFixed(0)}%
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Per-project efficiency (sortable) */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium">Efficiency by project</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="max-h-[640px] overflow-auto rounded-md border">
            <Table>
              <TableHeader className="sticky top-0 z-10 bg-card">
                <TableRow>
                  <SortHeader label="Project" active={sortKey === "project"} dir={dir} onClick={() => toggle("project")} />
                  <SortHeader label="Sessions" active={sortKey === "sessions"} dir={dir} onClick={() => toggle("sessions")} alignRight />
                  <SortHeader label="Cost" active={sortKey === "cost"} dir={dir} onClick={() => toggle("cost")} alignRight />
                  <SortHeader label="Output" active={sortKey === "output"} dir={dir} onClick={() => toggle("output")} alignRight />
                  <SortHeader label="Output / $" active={sortKey === "perDollar"} dir={dir} onClick={() => toggle("perDollar")} alignRight />
                  <SortHeader label="Output %" active={sortKey === "outShare"} dir={dir} onClick={() => toggle("outShare")} alignRight />
                  <SortHeader label="Cache rd %" active={sortKey === "cacheShare"} dir={dir} onClick={() => toggle("cacheShare")} alignRight />
                </TableRow>
              </TableHeader>
              <TableBody>
                {projectRows.map(({ row, perDollar, outShare, cacheShare: cShare }) => (
                  <TableRow key={row.project}>
                    <TableCell className="max-w-[220px] truncate font-medium" title={row.project}>{row.project}</TableCell>
                    <TableCell className="text-right tabular-nums text-muted-foreground">{num(row.sessions)}</TableCell>
                    <TableCell className="text-right tabular-nums text-muted-foreground">{usdExact(row.cost)}</TableCell>
                    <TableCell className="text-right tabular-nums text-muted-foreground">{tokens(row.output)}</TableCell>
                    <TableCell
                      className={`text-right font-medium tabular-nums ${
                        perDollar >= baseline ? "text-emerald-500" : "text-amber-500"
                      }`}
                    >
                      {num(Math.round(perDollar))}
                    </TableCell>
                    <TableCell className="text-right tabular-nums text-muted-foreground">{outShare.toFixed(0)}%</TableCell>
                    <TableCell className="text-right tabular-nums text-muted-foreground">{cShare.toFixed(0)}%</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          <p className="mt-2 text-[11px] text-muted-foreground">
            Output / $ is colored against your overall average ({num(Math.round(baseline))} tok/$):{" "}
            <span className="text-emerald-500">green</span> = above,{" "}
            <span className="text-amber-500">amber</span> = below.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
