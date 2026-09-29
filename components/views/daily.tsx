"use client";

import type { Summary } from "@/lib/usage";
import { num, tokens, usdExact } from "@/lib/format";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableRow, TableHeader, TableHead } from "@/components/ui/table";
import { Empty, MiniStat, SortHeader } from "@/components/stats";
import { ModelLegend } from "@/components/charts";
import { useDailyView, type DailyRow } from "@/hooks/use-daily-view";

export function DailyView({ data }: { data: Summary }) {
  const { rows, stats, models, days, sortKey, dir, toggleSort, isRowOpen, toggleRow } = useDailyView(data);

  if (!days) return <Empty />;

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">One row per day. Click a day for its per-model split.</p>

      <section className="grid grid-cols-2 gap-4 md:grid-cols-4">
        {stats.map((s) => (
          <MiniStat key={s.label} label={s.label} value={s.value} hint={s.sub} />
        ))}
      </section>

      <Card>
        <CardHeader className="gap-2">
          <CardTitle className="text-sm font-medium">Daily breakdown</CardTitle>
          <ModelLegend items={models} />
        </CardHeader>
        <CardContent>
          <div className="max-h-[640px] overflow-auto rounded-md border">
            <Table>
              <TableHeader className="sticky top-0 z-10 bg-card">
                <TableRow>
                  <SortHeader label="Date" active={sortKey === "day"} dir={dir} onClick={() => toggleSort("day")} />
                  <TableHead className="min-w-[140px]">Share of range</TableHead>
                  <SortHeader label="Msgs" active={sortKey === "messages"} dir={dir} onClick={() => toggleSort("messages")} alignRight />
                  <SortHeader label="Input" active={sortKey === "input"} dir={dir} onClick={() => toggleSort("input")} alignRight />
                  <SortHeader label="Output" active={sortKey === "output"} dir={dir} onClick={() => toggleSort("output")} alignRight />
                  <SortHeader label="Cache wr" active={sortKey === "cacheCreate"} dir={dir} onClick={() => toggleSort("cacheCreate")} alignRight />
                  <SortHeader label="Cache rd" active={sortKey === "cacheRead"} dir={dir} onClick={() => toggleSort("cacheRead")} alignRight />
                  <SortHeader label="Tokens / $" active={sortKey === "perDollar"} dir={dir} onClick={() => toggleSort("perDollar")} alignRight />
                  <SortHeader label="Cost" active={sortKey === "cost"} dir={dir} onClick={() => toggleSort("cost")} alignRight />
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r) => (
                  <DayRow key={r.d.day} r={r} open={isRowOpen(r.d.day)} onToggle={() => toggleRow(r.d.day)} />
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function DayRow({ r, open, onToggle }: { r: DailyRow; open: boolean; onToggle: () => void }) {
  const { d } = r;
  const expandable = r.parts.length > 1;
  return (
    <>
      <TableRow className={expandable ? "cursor-pointer" : undefined} onClick={expandable ? onToggle : undefined}>
        <TableCell className="whitespace-nowrap font-medium">
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
            {r.dateLabel}
            <span className="text-[11px] font-normal text-muted-foreground">{r.dow}</span>
          </span>
        </TableCell>
        <TableCell>
          <div className="flex h-2 overflow-hidden rounded-[2px]" style={{ width: `${r.barWidthPct}%` }} role="img" aria-label={`${r.dateLabel}: ${usdExact(d.cost)}`}>
            {r.parts.map((p) => (
              <span key={p.model} title={`${p.label} ${p.costLabel}`} className="h-2" style={{ width: `${p.pctOfDay}%`, background: p.color }} />
            ))}
          </div>
        </TableCell>
        <TableCell className="text-right tabular-nums text-muted-foreground">{num(d.messages)}</TableCell>
        <TableCell className="text-right tabular-nums text-muted-foreground">{tokens(d.input)}</TableCell>
        <TableCell className="text-right tabular-nums text-muted-foreground">{tokens(d.output)}</TableCell>
        <TableCell className="text-right tabular-nums text-muted-foreground">{tokens(d.cacheCreate)}</TableCell>
        <TableCell className="text-right tabular-nums text-muted-foreground">
          {tokens(d.cacheRead)} <span className="text-[11px] opacity-60">{r.cacheShareLabel}</span>
        </TableCell>
        <TableCell className="text-right tabular-nums text-muted-foreground">{r.tokensPerDollarLabel}</TableCell>
        <TableCell className="text-right font-medium tabular-nums">{usdExact(d.cost)}</TableCell>
      </TableRow>
      {open &&
        expandable &&
        r.parts.map((p) => (
          <TableRow key={p.model} className="bg-muted/30 text-xs hover:bg-muted/30">
            <TableCell className="pl-8">
              <span className="inline-flex items-center gap-1.5 text-muted-foreground">
                <span className="inline-block h-1.5 w-1.5 rounded-full" style={{ background: p.color }} aria-hidden />
                {p.label}
              </span>
            </TableCell>
            <TableCell>
              <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                <div className="h-full rounded-full" style={{ width: `${p.pctOfDay}%`, background: p.color }} />
              </div>
            </TableCell>
            <TableCell className="text-right tabular-nums text-muted-foreground">{num(p.messages)} msgs</TableCell>
            <TableCell colSpan={4} />
            <TableCell className="text-right tabular-nums text-muted-foreground">{p.costLabel}</TableCell>
          </TableRow>
        ))}
    </>
  );
}
