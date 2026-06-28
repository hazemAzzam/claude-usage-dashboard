import * as React from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

// "claude-opus-4-8-20250101" -> "opus-4-8"
export function shortModel(m: string): string {
  return m.replace(/^claude-/, "").replace(/-\d{8}$/, "");
}

export function Kpi({
  label,
  value,
  sub,
  hint,
}: {
  label: string;
  value: string;
  sub?: string;
  hint?: number;
}) {
  const tone = hint === undefined ? "" : hint >= 60 ? "text-emerald-400" : hint >= 30 ? "text-amber-400" : "";
  return (
    <Card>
      <CardContent className="pt-5">
        <div className="text-xs uppercase tracking-wide text-muted-foreground">{label}</div>
        <div className={`mt-1.5 text-2xl font-semibold ${tone}`}>{value}</div>
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
