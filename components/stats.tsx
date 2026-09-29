import * as React from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export { shortModel } from "@/lib/format";

const DELTA_TONE = {
  good: "bg-muted text-foreground",
  warn: "bg-destructive/15 text-destructive",
  neutral: "bg-muted text-muted-foreground",
} as const;

// KPI card. `delta` is the change vs the previous period, already formatted
// (the arrow is part of the text so direction survives without colour);
// `spark` is a slot for a Sparkline so this file stays chart-free.
export function Kpi({
  label,
  value,
  sub,
  delta,
  spark,
}: {
  label: string;
  value: string;
  sub?: string;
  delta?: { label: string; tone: keyof typeof DELTA_TONE };
  spark?: React.ReactNode;
}) {
  return (
    <Card>
      <CardContent className="pt-5">
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs uppercase tracking-wide text-muted-foreground">{label}</span>
          {delta && (
            <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium tabular-nums ${DELTA_TONE[delta.tone]}`}>
              <span className="sr-only">Change vs previous period: </span>
              {delta.label}
            </span>
          )}
        </div>
        <div className="mt-1.5 flex items-end justify-between gap-2">
          <span className="text-2xl font-semibold tabular-nums">{value}</span>
          {spark}
        </div>
        {sub && <div className="mt-0.5 text-xs text-muted-foreground">{sub}</div>}
      </CardContent>
    </Card>
  );
}

export function MiniStat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <Card>
      <CardContent className="pt-5">
        <div className="text-xs uppercase tracking-wide text-muted-foreground">{label}</div>
        <div className="mt-1 text-xl font-semibold">{value}</div>
        {hint && <div className="mt-0.5 text-[11px] text-muted-foreground">{hint}</div>}
      </CardContent>
    </Card>
  );
}

export function Empty({ label = "No data in this range" }: { label?: string }) {
  return <div className="grid h-32 place-items-center text-sm text-muted-foreground">{label}</div>;
}

export function DataTable({
  head,
  rows,
  alignRight = [],
}: {
  head: string[];
  rows: React.ReactNode[][];
  alignRight?: number[];
}) {
  if (!rows.length) return <Empty />;
  return (
    <Table>
      <TableHeader>
        <TableRow>
          {head.map((h, i) => (
            <TableHead key={h} className={alignRight.includes(i) ? "text-right" : ""}>
              {h}
            </TableHead>
          ))}
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((r, ri) => (
          <TableRow key={ri}>
            {r.map((c, ci) => (
              <TableCell
                key={ci}
                className={`${alignRight.includes(ci) ? "text-right tabular-nums text-muted-foreground" : ""} ${
                  ci === 0 ? "max-w-[160px] truncate" : ""
                }`}
              >
                {c}
              </TableCell>
            ))}
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

// A clickable, sortable column header for custom tables.
export function SortHeader({
  label,
  active,
  dir,
  onClick,
  alignRight,
}: {
  label: string;
  active: boolean;
  dir: "asc" | "desc";
  onClick: () => void;
  alignRight?: boolean;
}) {
  return (
    <TableHead className={alignRight ? "text-right" : ""}>
      <button
        type="button"
        onClick={onClick}
        className={`inline-flex items-center gap-1 transition-colors hover:text-foreground ${
          active ? "text-foreground" : ""
        } ${alignRight ? "flex-row-reverse" : ""}`}
      >
        {label}
        <span className="text-[10px] opacity-70">{active ? (dir === "asc" ? "▲" : "▼") : "↕"}</span>
      </button>
    </TableHead>
  );
}
