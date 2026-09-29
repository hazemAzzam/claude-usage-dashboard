"use client";

import type { Summary } from "@/lib/usage";
import { EFFORT_LABEL } from "@/lib/effort";
import { num, tokens, usd, usdExact, usdFine } from "@/lib/format";
import { CostByModel, ModelSplit, ProjectBars, TokenBars, PALETTE } from "@/components/charts";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DataTable, Empty, Kpi, MiniStat, shortModel } from "@/components/stats";

function cacheSavings(t: Summary["totals"]): number {
  // Cached reads cost 0.1x of input; this is the ~0.9x you'd have paid without caching,
  // valued at a $4/1M blended input rate (rough, model-agnostic).
  return (t.cacheRead * 0.9 * 4) / 1e6;
}

export function OverviewView({ data, rangeLabel }: { data: Summary; rangeLabel?: string }) {
  const t = data.totals;
  const totalIn = t.input + t.cacheCreate + t.cacheRead;
  const cacheReadShare = totalIn > 0 ? (t.cacheRead / totalIn) * 100 : 0;
  const days = data.byDay.length;
  const avgPerDay = days ? t.cost / days : 0;
  const avgPerSession = t.sessions ? t.cost / t.sessions : 0;

  return (
    <>
      <section className="mb-6 grid grid-cols-2 gap-4 md:grid-cols-4">
        <Kpi label="Total cost" value={usdExact(t.cost)} sub={rangeLabel} />
        <Kpi label="Sessions" value={num(t.sessions)} sub={`${num(t.messages)} assistant messages`} />
        <Kpi label="Tokens" value={tokens(totalIn + t.output)} sub={`${tokens(t.output)} output`} />
        <Kpi label="Cache read share" value={`${cacheReadShare.toFixed(0)}%`} sub="of all input tokens" hint={cacheReadShare} />
      </section>

      <section className="mb-6 grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-sm font-medium">Cost over time</CardTitle>
            <p className="text-xs text-muted-foreground">By model — toggle any line below</p>
          </CardHeader>
          <CardContent>
            {data.byDayModel.length ? <CostByModel series={data.byDayModel} models={data.byModel} /> : <Empty />}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium">Cost by model</CardTitle>
          </CardHeader>
          <CardContent>
            {data.byModel.some((m) => m.cost > 0) ? (
              <>
                <ModelSplit data={data.byModel} />
                <ul className="mt-2 space-y-1.5">
                  {data.byModel
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

      <section className="mb-6 grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-sm font-medium">Top projects by cost</CardTitle>
          </CardHeader>
          <CardContent>{data.byProject.length ? <ProjectBars data={data.byProject} /> : <Empty />}</CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium">Token breakdown</CardTitle>
          </CardHeader>
          <CardContent>
            <TokenBars totals={t} />
          </CardContent>
        </Card>
      </section>

      <section className="mb-6 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium">Most expensive sessions</CardTitle>
          </CardHeader>
          <CardContent>
            <DataTable
              head={["Project", "Date", "Msgs", "Cost"]}
              rows={data.topSessions.map((s) => [s.project, s.day, num(s.messages), usdExact(s.cost)])}
              alignRight={[2, 3]}
            />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium">By model</CardTitle>
          </CardHeader>
          <CardContent>
            <DataTable
              head={["Model", "Msgs", "Tokens", "Cost"]}
              rows={data.byModel.map((m) => [
                <Badge key={m.model} variant="secondary" className="font-normal">
                  {shortModel(m.model)}
                </Badge>,
                num(m.messages),
                tokens(m.input + m.output + m.cacheCreate + m.cacheRead),
                usdExact(m.cost),
              ])}
              alignRight={[1, 2, 3]}
            />
          </CardContent>
        </Card>
      </section>

      <section className="mb-6 grid grid-cols-1 gap-4 md:grid-cols-3">
        <MiniStat label="Avg cost / day" value={usdExact(avgPerDay)} />
        <MiniStat label="Avg cost / session" value={usdExact(avgPerSession)} />
        <MiniStat label="Cache savings" value={usdExact(cacheSavings(t))} hint="vs. paying full input price for cached reads" />
      </section>

      {data.byEffort.some((e) => e.messages > 0) && (
        <section className="mb-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-sm font-medium">Cost by effort</CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="grid grid-cols-2 gap-x-4 gap-y-1.5 sm:grid-cols-3 lg:grid-cols-6">
                {data.byEffort
                  .filter((e) => e.messages > 0)
                  .map((e) => (
                    <li key={e.effort} className="flex flex-col gap-0.5 rounded-md border px-2.5 py-1.5">
                      <span className="text-xs text-muted-foreground">{EFFORT_LABEL[e.effort]}</span>
                      <span className="text-sm font-medium tabular-nums">{usdExact(e.cost)}</span>
                      <span className="text-[11px] text-muted-foreground tabular-nums">
                        {num(e.messages)} msgs · {usdFine(e.messages ? e.cost / e.messages : 0)}/msg
                      </span>
                    </li>
                  ))}
              </ul>
            </CardContent>
          </Card>
        </section>
      )}
    </>
  );
}
