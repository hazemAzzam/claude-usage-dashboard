"use client";

import { useMemo, useState } from "react";
import type { DayBucket, ModelBucket, Summary } from "@/lib/usage";
import { num, shortDay, tokens, usdExact } from "@/lib/format";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableRow, TableHeader } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Empty, MiniStat, shortModel, SortHeader } from "@/components/stats";

type Key = "day" | "cost" | "messages" | "input" | "output" | "cacheCreate" | "cacheRead" | "perDollar";

function cacheShare(d: { input: number; cacheCreate: number; cacheRead: number }): number {
  const inTot = d.input + d.cacheCreate + d.cacheRead;
  return inTot > 0 ? (d.cacheRead / inTot) * 100 : 0;
}

function tokensPerDollar(d: { output: number; cost: number }): number {
  return d.cost > 0 ? d.output / d.cost : 0;
}

export function DailyView({ data }: { data: Summary }) {
  const [sortKey, setSortKey] = useState<Key>("day");
  const [dir, setDir] = useState<"asc" | "desc">("desc");
  const [open, setOpen] = useState<Set<string>>(new Set());

  function toggleRow(day: string) {
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(day)) next.delete(day);
      else next.add(day);
      return next;
    });
  }

  const rows = useMemo(() => {
    const sorted = [...data.byDay].sort((a, b) => {
      if (sortKey === "day") return a.day.localeCompare(b.day);
      if (sortKey === "perDollar") return tokensPerDollar(a) - tokensPerDollar(b);
      return (a[sortKey] as number) - (b[sortKey] as number);
    });
    if (dir === "desc") sorted.reverse();
    return sorted;
  }, [data.byDay, sortKey, dir]);

  function toggle(key: Key) {
    if (sortKey === key) setDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSortKey(key);
      setDir("desc"); // numeric high-first, and dates most-recent-first
    }
  }

  const days = data.byDay.length;
  const totalCost = data.byDay.reduce((a, d) => a + d.cost, 0);
  const busiest = [...data.byDay].sort((a, b) => b.cost - a.cost)[0];

  if (!days) return <Empty />;

  return (
    <div className="space-y-4">
      <section className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <MiniStat label="Active days" value={num(days)} />
        <MiniStat label="Avg cost / day" value={usdExact(days ? totalCost / days : 0)} />
        <MiniStat label="Busiest day" value={busiest ? usdExact(busiest.cost) : "—"} hint={busiest && shortDay(busiest.day)} />
        <MiniStat
          label="Avg msgs / day"
          value={num(Math.round(days ? data.byDay.reduce((a, d) => a + d.messages, 0) / days : 0))}
        />
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
                  <SortHeader label="Date" active={sortKey === "day"} dir={dir} onClick={() => toggle("day")} />
                  <SortHeader label="Msgs" active={sortKey === "messages"} dir={dir} onClick={() => toggle("messages")} alignRight />
                  <SortHeader label="Input" active={sortKey === "input"} dir={dir} onClick={() => toggle("input")} alignRight />
                  <SortHeader label="Output" active={sortKey === "output"} dir={dir} onClick={() => toggle("output")} alignRight />
                  <SortHeader label="Cache wr" active={sortKey === "cacheCreate"} dir={dir} onClick={() => toggle("cacheCreate")} alignRight />
                  <SortHeader label="Cache rd" active={sortKey === "cacheRead"} dir={dir} onClick={() => toggle("cacheRead")} alignRight />
                  <SortHeader label="Tokens / $" active={sortKey === "perDollar"} dir={dir} onClick={() => toggle("perDollar")} alignRight />
                  <SortHeader label="Cost" active={sortKey === "cost"} dir={dir} onClick={() => toggle("cost")} alignRight />
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((d) => (
                  <DayRow key={d.day} d={d} open={open.has(d.day)} onToggle={() => toggleRow(d.day)} />
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
