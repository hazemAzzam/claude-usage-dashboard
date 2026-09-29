"use client";

import type { HeatmapModel } from "@/hooks/use-patterns-view";

const LEGEND = [0.12, 0.35, 0.58, 0.81, 1];

// Weekday x hour grid with weekday totals on the right and hourly totals
// underneath. Presentational: every alpha/percent comes from deriveHeatmapModel.
export function Heatmap({ model }: { model: HeatmapModel }) {
  return (
    <div className="w-full overflow-x-auto">
      <table className="sr-only">
        <caption>Cost by weekday and hour of day (local time), with weekday and hourly totals</caption>
        <thead>
          <tr>
            {model.table.head.map((h) => (
              <th key={h} scope="col">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {model.table.rows.map((r) => (
            <tr key={r.label}>
              <th scope="row">{r.label}</th>
              {r.values.map((v, i) => (
                <td key={i}>{v}</td>
              ))}
              <td>{r.total}</td>
            </tr>
          ))}
          <tr>
            <th scope="row">{model.table.footer.label}</th>
            {model.table.footer.values.map((v, i) => (
              <td key={i}>{v}</td>
            ))}
            <td>{model.table.footer.total}</td>
          </tr>
        </tbody>
      </table>
      <div className="min-w-[640px]" aria-hidden="true">
        <div className="mb-1 flex pl-10 pr-24">
          {model.hourLabels.map((h) => (
            <div key={h.hour} className="flex-1 text-center text-[10px] text-muted-foreground">
              {h.label}
            </div>
          ))}
        </div>
        {model.rows.map((row) => (
          <div key={row.weekday} className="mb-1 flex items-center">
            <div className="w-10 shrink-0 pr-2 text-right text-[11px] text-muted-foreground">{row.label}</div>
            <div className="flex flex-1 gap-[2px]">
              {row.cells.map((c) => (
                <div
                  key={c.hour}
                  title={c.tip}
                  className="aspect-square flex-1 rounded-[3px] ring-1 ring-inset ring-border/40"
                  style={{ background: c.alpha > 0 ? `hsl(var(--primary) / ${c.alpha})` : "hsl(var(--muted) / 0.4)" }}
                />
              ))}
            </div>
            <div className="flex w-24 shrink-0 items-center gap-2 pl-3">
              <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
                <div className="h-full rounded-full bg-primary/70" style={{ width: `${row.totalPct}%` }} />
              </div>
              <span className="w-12 text-right text-[11px] tabular-nums text-muted-foreground">{row.totalLabel}</span>
            </div>
          </div>
        ))}
        {/* hourly totals */}
        <div className="mt-2 flex items-end pl-10 pr-24">
          <div className="flex h-12 flex-1 items-end gap-[2px]">
            {model.cols.map((c) => (
              <div key={c.hour} title={c.tip} className="flex-1 rounded-t-[3px] bg-primary/60" style={{ height: `${c.heightPct}%`, minHeight: 1 }} />
            ))}
          </div>
        </div>
        <div className="mt-3 flex items-center justify-end gap-2 pr-24 text-[10px] text-muted-foreground">
          <span>$0</span>
          <div className="flex gap-[2px]">
            {LEGEND.map((a) => (
              <div key={a} className="h-3 w-3 rounded-[3px]" style={{ background: `hsl(var(--primary) / ${a})` }} />
            ))}
          </div>
          <span>{model.maxLabel}</span>
        </div>
      </div>
    </div>
  );
}
