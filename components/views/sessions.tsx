"use client";

import type { SessionRow, Summary } from "@/lib/usage";
import { num, tokens, usdExact } from "@/lib/format";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableRow, TableHeader } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Empty, MiniStat, shortModel, SortHeader } from "@/components/stats";
import { useSessionsView } from "@/hooks/use-sessions-view";

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
    shownCost,
    avgCost,
  } = useSessionsView(data);

  return (
    <div className="space-y-4">
      <section className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <MiniStat label="Sessions" value={num(rows.length)} hint="in selected range" />
        <MiniStat label="Shown" value={num(filtered.length)} hint={`${usdExact(shownCost)} of cost`} />
        <MiniStat label="Avg / session" value={usdExact(avgCost)} />
        <MiniStat
          label="Most expensive"
          value={rows[0] ? usdExact(rows[0].cost) : "—"}
          hint={rows[0]?.project}
        />
      </section>

      <Card>
        <CardHeader className="gap-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <CardTitle className="text-sm font-medium">All sessions</CardTitle>
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Filter by project…"
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
        <TableCell className="max-w-[200px] truncate font-medium">
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
            <span className="truncate">{s.project}</span>
          </span>
        </TableCell>
        <TableCell className="whitespace-nowrap text-muted-foreground">{s.day}</TableCell>
        <TableCell>
          <Badge variant="secondary" className="font-normal">
            {shortModel(s.model)}
          </Badge>
          {s.models.length > 1 && <span className="ml-1 text-[11px] text-muted-foreground">+{s.models.length - 1}</span>}
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
