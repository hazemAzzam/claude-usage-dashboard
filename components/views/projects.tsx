"use client";

import Link from "next/link";
import type { Summary } from "@/lib/usage";
import { num } from "@/lib/format";
import { DailyStackedCost, ModelLegend } from "@/components/charts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Empty, MiniStat } from "@/components/stats";
import { useProjectsView } from "@/hooks/use-projects-view";

export function ProjectsView({ data }: { data: Summary }) {
  const { list, detail, activeProject, setSelected, query, setQuery, countLabel, total } = useProjectsView(data);

  if (!total) return <Empty />;

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-[300px_1fr]">
      <Card className="h-fit">
        <CardHeader className="gap-2">
          <div className="flex items-baseline justify-between">
            <CardTitle className="text-sm font-medium">Projects</CardTitle>
            <span className="text-xs text-muted-foreground">{countLabel}</span>
          </div>
          <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Filter projects…" aria-label="Filter projects" className="h-8" />
        </CardHeader>
        <CardContent className="px-2">
          {list.length ? (
            <ul className="max-h-[680px] space-y-0.5 overflow-auto" aria-label="Projects">
              {list.map((p) => (
                <li key={p.project}>
                  <button
                    type="button"
                    aria-pressed={p.project === activeProject}
                    onClick={() => setSelected(p.project)}
                    className={`w-full rounded-md px-2 py-2 text-left transition-colors ${p.project === activeProject ? "bg-accent" : "hover:bg-accent/50"}`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="truncate text-sm font-medium">{p.project}</span>
                      <span className="shrink-0 text-xs tabular-nums text-muted-foreground">{p.costLabel}</span>
                    </div>
                    <div className="mt-1.5 h-1 w-full overflow-hidden rounded-full bg-muted">
                      <div className="h-full rounded-full bg-primary/70" style={{ width: `${p.widthPct}%` }} />
                    </div>
                    <div className="mt-1 text-[11px] text-muted-foreground">{p.sessionsLabel}</div>
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="px-2 py-4 text-center text-xs text-muted-foreground">No projects match</p>
          )}
        </CardContent>
      </Card>

      {detail && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="text-lg font-semibold tracking-tight">{detail.project}</h2>
            <span className="text-sm text-muted-foreground">{detail.shareLabel}</span>
          </div>

          <section className="grid grid-cols-2 gap-4 md:grid-cols-4">
            {detail.stats.map((s) => (
              <MiniStat key={s.label} label={s.label} value={s.value} />
            ))}
          </section>

          <Card>
            <CardHeader className="gap-2">
              <CardTitle className="text-sm font-medium">Cost over time</CardTitle>
              <p className="text-xs text-muted-foreground">USD per day, stacked by model</p>
              <ModelLegend items={detail.legend} />
            </CardHeader>
            <CardContent>
              {detail.days.length ? (
                <DailyStackedCost rows={detail.days} models={detail.legend} label={`Daily cost of ${detail.project} stacked by model`} />
              ) : (
                <Empty />
              )}
            </CardContent>
          </Card>

          <section className="grid grid-cols-1 gap-4 xl:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="text-sm font-medium">By model</CardTitle>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Model</TableHead>
                      <TableHead className="text-right">Msgs</TableHead>
                      <TableHead className="text-right">Cost</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {detail.byModel.map((m) => (
                      <TableRow key={m.model}>
                        <TableCell>
                          <span className="inline-flex items-center gap-1.5">
                            <span className="inline-block h-1.5 w-1.5 rounded-full" style={{ background: m.color }} aria-hidden />
                            {m.label}
                          </span>
                          <div className="mt-1 h-1 overflow-hidden rounded-full bg-muted">
                            <div className="h-full rounded-full" style={{ width: `${m.widthPct}%`, background: m.color }} />
                          </div>
                        </TableCell>
                        <TableCell className="text-right tabular-nums text-muted-foreground">{num(m.messages)}</TableCell>
                        <TableCell className="text-right tabular-nums">{m.costLabel}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex-row items-baseline justify-between space-y-0">
                <CardTitle className="text-sm font-medium">{detail.sessionsTitle}</CardTitle>
                <Link href="/sessions" className="text-xs text-muted-foreground hover:text-foreground">
                  Open in Sessions
                </Link>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Session</TableHead>
                      <TableHead>Day</TableHead>
                      <TableHead>Model</TableHead>
                      <TableHead className="text-right">Msgs</TableHead>
                      <TableHead className="text-right">Cost</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {detail.sessions.map((s) => (
                      <TableRow key={s.session}>
                        <TableCell className="font-mono text-xs text-muted-foreground">{s.id}</TableCell>
                        <TableCell className="whitespace-nowrap text-muted-foreground">{s.day}</TableCell>
                        <TableCell>
                          <span className="inline-flex items-center gap-1.5">
                            <span className="inline-block h-1.5 w-1.5 rounded-full" style={{ background: s.color }} aria-hidden />
                            {s.label}
                          </span>
                        </TableCell>
                        <TableCell className="text-right tabular-nums text-muted-foreground">{num(s.messages)}</TableCell>
                        <TableCell className="text-right tabular-nums">{s.costLabel}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </section>
        </div>
      )}
    </div>
  );
}
