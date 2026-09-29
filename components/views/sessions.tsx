"use client";

import type { SessionRow, Summary } from "@/lib/usage";
import { num, tokens, usdExact } from "@/lib/format";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableRow, TableHeader } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Empty, shortModel, SortHeader } from "@/components/stats";
import { ModelLegend, ParetoCurve, SessionScatter } from "@/components/charts";
import { shortSessionId } from "@/lib/derive";
import { extraModelsLabel, useSessionsView } from "@/hooks/use-sessions-view";

export function SessionsView({ data }: { data: Summary }) {
  const {
    rows,
    models,
    query,
    setQuery,
    model,
    setModel,
    filtered,
    sortKey,
    dir,
    toggleSort,
    isRowOpen,
    toggleRow,
    pareto,
    scatter,
    countLabel,
  } = useSessionsView(data);

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">Every transcript in range. Click a row for its per-model breakdown.</p>

      <section className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium">Where the money concentrates</CardTitle>
            <p className="text-xs text-muted-foreground">Share of cost vs. share of sessions, most expensive first</p>
          </CardHeader>
          <CardContent className="space-y-3">
            {rows.length ? (
              <>
                {pareto.top10Label && pareto.top20Label ? (
                  <div className="flex gap-6">
                    <div>
                      <div className="text-2xl font-semibold tabular-nums">{pareto.top10Label}</div>
                      <div className="text-xs text-muted-foreground">of cost from the top 10% of sessions</div>
                    </div>
                    <div>
                      <div className="text-2xl font-semibold tabular-nums">{pareto.top20Label}</div>
                      <div className="text-xs text-muted-foreground">from the top 20%</div>
                    </div>
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground">Needs 10+ sessions for the top-10% / top-20% shares.</p>
                )}
                <ParetoCurve pareto={pareto} />
              </>
            ) : (
              <Empty />
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="gap-2">
            <CardTitle className="text-sm font-medium">Session length vs. cost</CardTitle>
            <p className="text-xs text-muted-foreground">One dot per session, log scales · ringed = over 2× typical cost for its length</p>
            <ModelLegend items={scatter.series} />
          </CardHeader>
          <CardContent>{scatter.total ? <SessionScatter scatter={scatter} /> : <Empty />}</CardContent>
        </Card>
      </section>

      <Card>
        <CardHeader className="gap-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <CardTitle className="text-sm font-medium">All sessions</CardTitle>
              <p className="mt-1 text-xs text-muted-foreground">{countLabel}</p>
            </div>
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search project or session id…"
              aria-label="Search sessions"
              className="h-8 w-full max-w-[240px] sm:w-[240px]"
            />
          </div>
          <div className="flex flex-wrap gap-1.5">
            <FilterChip label="All models" active={model === "all"} onClick={() => setModel("all")} />
            {models.map((m) => (
              <FilterChip key={m} label={shortModel(m)} active={model === m} onClick={() => setModel(m)} />
            ))}
          </div>
        </CardHeader>
        <CardContent>
          {filtered.length === 0 ? (
            <Empty label="No sessions match your filters" />
          ) : (
            <div className="max-h-[640px] overflow-auto rounded-md border">
              <Table>
                <TableHeader className="sticky top-0 z-10 bg-card">
                  <TableRow>
                    <TableHead>Session</TableHead>
                    <SortHeader label="Project" active={sortKey === "project"} dir={dir} onClick={() => toggleSort("project")} />
                    <SortHeader label="Date" active={sortKey === "day"} dir={dir} onClick={() => toggleSort("day")} />
                    <SortHeader label="Model" active={sortKey === "model"} dir={dir} onClick={() => toggleSort("model")} />
                    <SortHeader label="Msgs" active={sortKey === "messages"} dir={dir} onClick={() => toggleSort("messages")} alignRight />
                    <SortHeader label="Input" active={sortKey === "input"} dir={dir} onClick={() => toggleSort("input")} alignRight />
                    <SortHeader label="Output" active={sortKey === "output"} dir={dir} onClick={() => toggleSort("output")} alignRight />
                    <SortHeader label="Cache rd" active={sortKey === "cacheRead"} dir={dir} onClick={() => toggleSort("cacheRead")} alignRight />
                    <SortHeader label="Cost" active={sortKey === "cost"} dir={dir} onClick={() => toggleSort("cost")} alignRight />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((s) => (
                    <Row key={s.session} s={s} open={isRowOpen(s.session)} onToggle={() => toggleRow(s.session)} />
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function Row({ s, open, onToggle }: { s: SessionRow; open: boolean; onToggle: () => void }) {
  const expandable = s.modelBreakdown.length > 1;
  return (
    <>
      <TableRow
        className={expandable ? "cursor-pointer" : undefined}
        onClick={expandable ? onToggle : undefined}
      >
        <TableCell className="whitespace-nowrap font-mono text-xs text-muted-foreground">
          <span className="inline-flex items-center gap-1.5">
            {expandable ? (
              <button
                type="button"
                aria-expanded={open}
                aria-label={open ? "Collapse models" : "Expand models"}
                onClick={(e) => {
                  e.stopPropagation();
                  onToggle();
                }}
                className="text-muted-foreground hover:text-foreground"
              >
                <span className={`inline-block text-xs transition-transform ${open ? "rotate-90" : ""}`}>▶</span>
              </button>
            ) : (
              <span className="inline-block w-3" />
            )}
            {shortSessionId(s.session)}
          </span>
        </TableCell>
        <TableCell className="max-w-[200px] truncate font-medium" title={s.project}>
          {s.project}
        </TableCell>
        <TableCell className="whitespace-nowrap text-muted-foreground">{s.day}</TableCell>
        <TableCell>
          <Badge variant="secondary" className="font-normal">
            {shortModel(s.model)}
          </Badge>
          {s.models.length > 1 && <span className="ml-1 text-[11px] text-muted-foreground">{extraModelsLabel(s)}</span>}
        </TableCell>
        <TableCell className="text-right tabular-nums text-muted-foreground">{num(s.messages)}</TableCell>
        <TableCell className="text-right tabular-nums text-muted-foreground">{tokens(s.input)}</TableCell>
        <TableCell className="text-right tabular-nums text-muted-foreground">{tokens(s.output)}</TableCell>
        <TableCell className="text-right tabular-nums text-muted-foreground">{tokens(s.cacheRead)}</TableCell>
        <TableCell className="text-right font-medium tabular-nums">{usdExact(s.cost)}</TableCell>
      </TableRow>
      {open &&
        expandable &&
        s.modelBreakdown.map((m) => (
          <TableRow key={m.model} className="bg-muted/30 hover:bg-muted/30 text-xs">
            <TableCell />
            <TableCell />
            <TableCell />
            <TableCell className="pl-3">
              <Badge variant="outline" className="font-normal text-muted-foreground">
                {shortModel(m.model)}
              </Badge>
            </TableCell>
            <TableCell className="text-right tabular-nums text-muted-foreground">{num(m.messages)}</TableCell>
            <TableCell className="text-right tabular-nums text-muted-foreground">{tokens(m.input)}</TableCell>
            <TableCell className="text-right tabular-nums text-muted-foreground">{tokens(m.output)}</TableCell>
            <TableCell className="text-right tabular-nums text-muted-foreground">{tokens(m.cacheRead)}</TableCell>
            <TableCell className="text-right tabular-nums text-muted-foreground">{usdExact(m.cost)}</TableCell>
          </TableRow>
        ))}
    </>
  );
}

function FilterChip({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <Button
      type="button"
      size="sm"
      variant={active ? "default" : "outline"}
      onClick={onClick}
      className="h-7 rounded-full px-3 text-xs"
    >
      {label}
    </Button>
  );
}
