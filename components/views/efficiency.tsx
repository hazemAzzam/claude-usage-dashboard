"use client";

import type { Summary } from "@/lib/usage";
import { num } from "@/lib/format";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableRow, TableHeader, TableHead } from "@/components/ui/table";
import { Empty, Kpi } from "@/components/stats";
import { useEfficiencyView, type EfficiencyMetrics, type EfficiencyModelRow } from "@/hooks/use-efficiency-view";

export function EfficiencyView({ data }: { data: Summary }) {
  const { kpis, modelRows, grid, gridNote, isModelOpen, toggleModel } = useEfficiencyView(data);

  if (!data.totals.sessions) return <Empty />;

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">How much useful output each dollar buys, by model and effort level.</p>

      <section className="grid grid-cols-2 gap-4 xl:grid-cols-4">
        {kpis.map((k) => (
          <Kpi key={k.key} label={k.label} value={k.value} sub={k.sub} />
        ))}
      </section>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium">By model</CardTitle>
          <p className="text-xs text-muted-foreground">Click a model to break it down by effort level</p>
        </CardHeader>
        <CardContent>
          <div className="overflow-auto rounded-md border">
            <Table>
              <TableHeader className="bg-card">
                <TableRow>
                  <TableHead>Model</TableHead>
                  <TableHead className="text-right">Msgs</TableHead>
                  <TableHead className="text-right">Output share</TableHead>
                  <TableHead className="text-right">Cache share</TableHead>
                  <TableHead className="text-right">Output / $</TableHead>
                  <TableHead className="text-right">Cost / msg</TableHead>
                  <TableHead className="text-right">Cost</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {modelRows.map((m) => (
                  <ModelRow key={m.model} m={m} open={isModelOpen(m.model)} onToggle={() => toggleModel(m.model)} />
                ))}
              </TableBody>
            </Table>
          </div>
          <p className="mt-2 text-[11px] text-muted-foreground">
            Per-token price is the same at every effort level; cost/msg differs because higher effort produces more output per message.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium">Effort × model</CardTitle>
          <p className="text-xs text-muted-foreground">Cost per message · brighter = pricier</p>
        </CardHeader>
        <CardContent className="space-y-3">
          {grid.efforts.length ? (
            <div className="overflow-auto">
              <table className="w-full border-separate border-spacing-1 text-sm">
                <thead>
                  <tr>
                    <th />
                    {grid.models.map((m) => (
                      <th key={m.model} className="px-2 py-1 text-xs font-medium text-muted-foreground">
                        {m.label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {grid.efforts.map((e, ri) => (
                    <tr key={e.effort}>
                      <th className="pr-3 text-right text-xs font-medium text-muted-foreground">{e.label}</th>
                      {grid.cells[ri].map((c, ci) => (
                        <td
                          key={grid.models[ci].model}
                          title={c.tip}
                          className={`rounded-md px-2 py-2 text-center font-mono tabular-nums${c.strong ? " text-primary-foreground" : ""}`}
                          style={{ background: c.alpha > 0 ? `oklch(var(--primary) / ${c.alpha})` : "oklch(var(--divider))" }}
                        >
                          {c.label}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <Empty />
          )}
          <p className="border-t pt-3 text-sm text-muted-foreground">{gridNote}</p>
        </CardContent>
      </Card>
    </div>
  );
}

function MetricCells({ m, muted }: { m: EfficiencyMetrics; muted?: boolean }) {
  const tone = muted ? "text-muted-foreground" : "";
  return (
    <>
      <TableCell className="text-right font-mono tabular-nums text-muted-foreground">{num(m.messages)}</TableCell>
      <TableCell className="text-right font-mono tabular-nums text-muted-foreground">{m.outShareLabel}</TableCell>
      <TableCell className="text-right font-mono tabular-nums text-muted-foreground">{m.cacheShareLabel}</TableCell>
      <TableCell className={`text-right font-mono tabular-nums ${tone}`}>{m.perDollarLabel}</TableCell>
      <TableCell className={`text-right font-mono tabular-nums ${tone}`}>{m.costPerMsgLabel}</TableCell>
      <TableCell className={`text-right font-mono tabular-nums ${muted ? "text-muted-foreground" : "font-medium"}`}>{m.costLabel}</TableCell>
    </>
  );
}

function ModelRow({ m, open, onToggle }: { m: EfficiencyModelRow; open: boolean; onToggle: () => void }) {
  const expandable = m.efforts.length > 1;
  return (
    <>
      <TableRow className={expandable ? "cursor-pointer" : undefined} onClick={expandable ? onToggle : undefined}>
        <TableCell className="whitespace-nowrap font-medium">
          <span className="inline-flex items-center gap-1.5">
            {expandable ? (
              <button
                type="button"
                aria-expanded={open}
                aria-label={open ? "Collapse efforts" : "Expand efforts"}
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
            <span className="inline-block h-1.5 w-1.5 rounded-full" style={{ background: m.color }} aria-hidden />
            {m.label}
          </span>
        </TableCell>
        <MetricCells m={m} />
      </TableRow>
      {open &&
        expandable &&
        m.efforts.map((e) => (
          <TableRow key={e.effort} className="bg-row-detail text-xs hover:bg-row-detail">
            <TableCell className="pl-10 text-muted-foreground">{e.label}</TableCell>
            <MetricCells m={e} muted />
          </TableRow>
        ))}
    </>
  );
}
