"use client";

import type { DayBucket, ModelBucket, Summary } from "@/lib/usage";
import { cacheShare, num, shortDay, tokens, usdExact } from "@/lib/format";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableRow, TableHeader } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Empty, MiniStat, shortModel, SortHeader } from "@/components/stats";
import { useDailyView, tokensPerDollar } from "@/hooks/use-daily-view";

export function DailyView({ data }: { data: Summary }) {
  const { rows, sortKey, dir, toggleSort, isRowOpen, toggleRow, days, avgCostPerDay, busiest, avgMessages } =
    useDailyView(data);

  if (!days) return <Empty />;

  return (
    <div className="space-y-4">
      <section className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <MiniStat label="Active days" value={num(days)} />
        <MiniStat label="Avg cost / day" value={usdExact(avgCostPerDay)} />
        <MiniStat label="Busiest day" value={busiest ? usdExact(busiest.cost) : "—"} hint={busiest && shortDay(busiest.day)} />
        <MiniStat label="Avg msgs / day" value={num(avgMessages)} />
      </section>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium">Daily breakdown</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="max-h-[640px] overflow-auto rounded-md border">
            <Table>
              <TableHeader className="sticky top-0 z-10 bg-card">
                <TableRow>
                  <SortHeader label="Date" active={sortKey === "day"} dir={dir} onClick={() => toggleSort("day")} />
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
                {rows.map((d) => (
                  <DayRow key={d.day} d={d} open={isRowOpen(d.day)} onToggle={() => toggleRow(d.day)} />
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function DayRow({ d, open, onToggle }: { d: DayBucket; open: boolean; onToggle: () => void }) {
  const models: ModelBucket[] = d.models ?? [];
  const expandable = models.length > 1;
  return (
    <>
      <TableRow
        className={expandable ? "cursor-pointer" : undefined}
        onClick={expandable ? onToggle : undefined}
      >
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
            {shortDay(d.day)}
          </span>
        </TableCell>
        <TableCell className="text-right tabular-nums text-muted-foreground">{num(d.messages)}</TableCell>
        <TableCell className="text-right tabular-nums text-muted-foreground">{tokens(d.input)}</TableCell>
        <TableCell className="text-right tabular-nums text-muted-foreground">{tokens(d.output)}</TableCell>
        <TableCell className="text-right tabular-nums text-muted-foreground">{tokens(d.cacheCreate)}</TableCell>
        <TableCell className="text-right tabular-nums text-muted-foreground">
          {tokens(d.cacheRead)} <span className="text-[11px] opacity-60">{cacheShare(d).toFixed(0)}%</span>
        </TableCell>
        <TableCell className="text-right tabular-nums text-muted-foreground">{num(Math.round(tokensPerDollar(d)))}</TableCell>
        <TableCell className="text-right font-medium tabular-nums">{usdExact(d.cost)}</TableCell>
      </TableRow>
      {open &&
        expandable &&
        models.map((m) => (
          <TableRow key={m.model} className="bg-muted/30 hover:bg-muted/30 text-xs">
            <TableCell className="pl-8">
              <Badge variant="outline" className="font-normal text-muted-foreground">
                {shortModel(m.model)}
              </Badge>
            </TableCell>
            <TableCell className="text-right tabular-nums text-muted-foreground">{num(m.messages)}</TableCell>
            <TableCell className="text-right tabular-nums text-muted-foreground">{tokens(m.input)}</TableCell>
            <TableCell className="text-right tabular-nums text-muted-foreground">{tokens(m.output)}</TableCell>
            <TableCell className="text-right tabular-nums text-muted-foreground">{tokens(m.cacheCreate)}</TableCell>
            <TableCell className="text-right tabular-nums text-muted-foreground">
              {tokens(m.cacheRead)} <span className="text-[11px] opacity-60">{cacheShare(m).toFixed(0)}%</span>
            </TableCell>
            <TableCell className="text-right tabular-nums text-muted-foreground">{num(Math.round(tokensPerDollar(m)))}</TableCell>
            <TableCell className="text-right tabular-nums text-muted-foreground">{usdExact(m.cost)}</TableCell>
          </TableRow>
        ))}
    </>
  );
}
