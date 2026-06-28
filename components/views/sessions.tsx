"use client";

import { useMemo, useState } from "react";
import type { SessionRow, Summary } from "@/lib/usage";
import { num, tokens, usdExact } from "@/lib/format";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableRow, TableHeader } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Empty, MiniStat, shortModel, SortHeader } from "@/components/stats";

type Key = "project" | "day" | "model" | "cost" | "messages" | "input" | "output" | "cacheRead";

const NUMERIC: Set<Key> = new Set(["cost", "messages", "input", "output", "cacheRead"]);

export function SessionsView({ data }: { data: Summary }) {
  const rows = data.allSessions;
  const [q, setQ] = useState("");
  const [model, setModel] = useState<string>("all");
  const [sortKey, setSortKey] = useState<Key>("cost");
  const [dir, setDir] = useState<"asc" | "desc">("desc");

  const models = useMemo(() => {
    const set = new Set<string>();
    for (const r of rows) for (const m of r.models) set.add(m);
    return [...set].sort();
  }, [rows]);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    let out = rows;
    if (needle) out = out.filter((r) => r.project.toLowerCase().includes(needle));
    if (model !== "all") out = out.filter((r) => r.models.includes(model));
    const sorted = [...out].sort((a, b) => {
      if (sortKey === "project") return a.project.localeCompare(b.project);
      if (sortKey === "day") return a.day.localeCompare(b.day);
      if (sortKey === "model") return a.model.localeCompare(b.model);
      return (a[sortKey] as number) - (b[sortKey] as number);
    });
    if (dir === "desc") sorted.reverse();
    return sorted;
  }, [rows, q, model, sortKey, dir]);

  function toggle(key: Key) {
    if (sortKey === key) {
      setDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setDir(NUMERIC.has(key) ? "desc" : "asc");
    }
  }

  const shown = filtered.reduce((a, r) => a + r.cost, 0);

  return (
    <div className="space-y-4">
      <section className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <MiniStat label="Sessions" value={num(rows.length)} hint="in selected range" />
        <MiniStat label="Shown" value={num(filtered.length)} hint={`${usdExact(shown)} of cost`} />
        <MiniStat
          label="Avg / session"
          value={usdExact(rows.length ? rows.reduce((a, r) => a + r.cost, 0) / rows.length : 0)}
        />
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
              value={q}
              onChange={(e) => setQ(e.target.value)}
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
                    <SortHeader label="Project" active={sortKey === "project"} dir={dir} onClick={() => toggle("project")} />
                    <SortHeader label="Date" active={sortKey === "day"} dir={dir} onClick={() => toggle("day")} />
                    <SortHeader label="Model" active={sortKey === "model"} dir={dir} onClick={() => toggle("model")} />
                    <SortHeader label="Msgs" active={sortKey === "messages"} dir={dir} onClick={() => toggle("messages")} alignRight />
                    <SortHeader label="Input" active={sortKey === "input"} dir={dir} onClick={() => toggle("input")} alignRight />
                    <SortHeader label="Output" active={sortKey === "output"} dir={dir} onClick={() => toggle("output")} alignRight />
                    <SortHeader label="Cache rd" active={sortKey === "cacheRead"} dir={dir} onClick={() => toggle("cacheRead")} alignRight />
                    <SortHeader label="Cost" active={sortKey === "cost"} dir={dir} onClick={() => toggle("cost")} alignRight />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((s) => (
                    <Row key={s.session} s={s} />
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

function Row({ s }: { s: SessionRow }) {
  return (
    <TableRow>
      <TableCell className="max-w-[200px] truncate font-medium">{s.project}</TableCell>
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
