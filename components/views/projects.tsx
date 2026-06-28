"use client";

import { useMemo, useState } from "react";
import type { ProjectRow, Summary } from "@/lib/usage";
import { num, tokens, usd, usdExact } from "@/lib/format";
import { CostOverTime, ModelSplit, TokenBars, PALETTE } from "@/components/charts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { DataTable, Empty, MiniStat, shortModel } from "@/components/stats";

export function ProjectsView({ data }: { data: Summary }) {
  const projects = data.byProject;
  const [selected, setSelected] = useState<string>(projects[0]?.project ?? "");
  const active = projects.find((p) => p.project === selected) ?? projects[0];
  const max = projects[0]?.cost || 1;

  if (!projects.length) return <Empty />;

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-[300px_1fr]">
      <Card className="h-fit">
        <CardHeader>
          <CardTitle className="text-sm font-medium">Projects ({projects.length})</CardTitle>
        </CardHeader>
        <CardContent className="px-2">
          <ul className="max-h-[680px] space-y-0.5 overflow-auto">
            {projects.map((p, i) => {
              const on = p.project === active?.project;
              return (
                <li key={p.project}>
                  <button
                    type="button"
                    onClick={() => setSelected(p.project)}
                    className={`w-full rounded-md px-2 py-2 text-left transition-colors ${
                      on ? "bg-accent" : "hover:bg-accent/50"
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="truncate text-sm font-medium">{p.project}</span>
                      <span className="shrink-0 text-xs tabular-nums text-muted-foreground">{usd(p.cost)}</span>
                    </div>
                    <div className="mt-1.5 h-1 w-full overflow-hidden rounded-full bg-muted">
                      <div
                        className="h-full rounded-full"
                        style={{ width: `${(p.cost / max) * 100}%`, background: PALETTE[i % PALETTE.length] }}
                      />
                    </div>
                  </button>
                </li>
              );
            })}
          </ul>
        </CardContent>
      </Card>

      {active && <ProjectDetail project={active} summary={data} />}
    </div>
  );
}

function ProjectDetail({ project, summary }: { project: ProjectRow; summary: Summary }) {
  const totalIn = project.input + project.cacheCreate + project.cacheRead;
  const cacheShare = totalIn > 0 ? (project.cacheRead / totalIn) * 100 : 0;
  const avgSession = project.sessions ? project.cost / project.sessions : 0;
  const projSessions = useMemo(
    () =>
      summary.allSessions
        .filter((s) => s.project === project.project)
        .sort((a, b) => b.lastTs - a.lastTs)
        .slice(0, 15),
    [summary.allSessions, project.project],
  );

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold tracking-tight">{project.project}</h2>
        <p className="text-sm text-muted-foreground">
          {usdExact(project.cost)} · {num(project.sessions)} sessions · {num(project.messages)} messages ·{" "}
          {tokens(totalIn + project.output)} tokens
        </p>
      </div>

      <section className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <MiniStat label="Total cost" value={usdExact(project.cost)} />
        <MiniStat label="Avg / session" value={usdExact(avgSession)} />
        <MiniStat label="Cache read share" value={`${cacheShare.toFixed(0)}%`} />
        <MiniStat label="Output tokens" value={tokens(project.output)} />
      </section>

      <section className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-sm font-medium">Cost over time</CardTitle>
          </CardHeader>
          <CardContent>{project.byDay.length ? <CostOverTime data={project.byDay} /> : <Empty />}</CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium">Models used</CardTitle>
          </CardHeader>
          <CardContent>
            {project.models.some((m) => m.cost > 0) ? (
              <>
                <ModelSplit data={project.models} />
                <ul className="mt-2 space-y-1.5">
                  {project.models
                    .filter((m) => m.cost > 0)
                    .map((m, i) => (
                      <li key={m.model} className="flex items-center justify-between text-xs">
                        <span className="flex items-center gap-2">
                          <span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: PALETTE[i % PALETTE.length] }} />
                          {shortModel(m.model)}
                        </span>
                        <span className="tabular-nums text-muted-foreground">{usd(m.cost)}</span>
                      </li>
                    ))}
                </ul>
              </>
            ) : (
              <Empty />
            )}
          </CardContent>
        </Card>
      </section>

      <section className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium">Token breakdown</CardTitle>
          </CardHeader>
          <CardContent>
            <TokenBars totals={project} />
          </CardContent>
        </Card>
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-sm font-medium">
              Sessions {project.sessions > 15 ? `(latest 15 of ${num(project.sessions)})` : `(${num(project.sessions)})`}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <DataTable
              head={["Date", "Model", "Msgs", "Tokens", "Cost"]}
              rows={projSessions.map((s) => [
                s.day,
                <Badge key={s.session} variant="secondary" className="font-normal">
                  {shortModel(s.model)}
                </Badge>,
                num(s.messages),
                tokens(s.input + s.output + s.cacheCreate + s.cacheRead),
                usdExact(s.cost),
              ])}
              alignRight={[2, 3, 4]}
            />
          </CardContent>
        </Card>
      </section>
    </div>
  );
}
