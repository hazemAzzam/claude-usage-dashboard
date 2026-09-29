"use client";

import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  Cell,
  ComposedChart,
  LabelList,
  Line,
  LineChart,
  ReferenceLine,
  Scatter,
  ScatterChart,
  XAxis,
  YAxis,
} from "recharts";
import { effortColor, fmtUSDShort, num, shortDay, usdExact } from "@/lib/format";
import type { DailyByModelRow, DailyModelLegend, EffortCostRow } from "@/lib/derive";
import type { PlanValue, TurnRow } from "@/hooks/use-overview-view";
import type { HourPair, ModelDiffRow, TokenTypeRow } from "@/hooks/use-compare-view";
import type { Pareto, ScatterPoint, SessionScatter as ScatterModel } from "@/hooks/use-sessions-view";
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart";

// All chart components are presentational: they receive rows already derived
// by a hook (hooks/use-*-view.ts) and only map them onto Recharts primitives.

const ACCENT = "oklch(var(--primary))";
const GRID_TEXT = "text-[11px]";

// ---- shared legend ----
export function ModelLegend({ items, avg }: { items: DailyModelLegend[]; avg?: string }) {
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
      {items.map((m) => (
        <span key={m.model} className="inline-flex items-center gap-1.5">
          <span className="inline-block h-2 w-2 rounded-[2px]" style={{ background: m.color }} aria-hidden />
          {m.label}
        </span>
      ))}
      {avg && (
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-block h-[2px] w-3 bg-foreground" aria-hidden />
          {avg}
        </span>
      )}
    </div>
  );
}

// ---- KPI sparkline ----
export function Sparkline({ data, label }: { data: Array<{ i: number; v: number }>; label: string }) {
  if (data.length < 2) return null;
  return (
    <ChartContainer config={{}} className="aspect-auto h-8 w-24" role="img" aria-label={label}>
      <LineChart data={data} margin={{ top: 2, right: 2, bottom: 2, left: 2 }}>
        <YAxis hide domain={["dataMin", "dataMax"]} />
        <Line type="monotone" dataKey="v" stroke={ACCENT} strokeWidth={1.5} dot={false} isAnimationActive={false} />
      </LineChart>
    </ChartContainer>
  );
}

// ---- cost per message by position in the session ----
function TurnTick({ x, y, payload, rows }: { x?: number; y?: number; payload?: { index: number; value: string }; rows: TurnRow[] }) {
  const row = payload ? rows[payload.index] : undefined;
  return (
    <g transform={`translate(${x},${y})`}>
      <text textAnchor="middle" dy={12} className="fill-foreground text-[11px]">
        {payload?.value}
      </text>
      <text textAnchor="middle" dy={26} className="fill-muted-foreground text-[10px]">
        {row?.shareLabel} of $
      </text>
    </g>
  );
}

const TURN_TONE = { early: "oklch(var(--effort-1))", mid: "oklch(var(--effort-2))", late: ACCENT } as const;

export function TurnCostBars({ rows }: { rows: TurnRow[] }) {
  const config = { costPerMsg: { label: "Cost per message", color: ACCENT } } satisfies ChartConfig;
  return (
    <ChartContainer config={config} className="aspect-auto h-[220px] w-full" role="img" aria-label="Average cost per message by position in the session">
      <BarChart data={rows} margin={{ top: 20, right: 8, left: 8, bottom: 8 }}>
        <XAxis dataKey="label" tickLine={false} axisLine={false} interval={0} height={40} tick={<TurnTick rows={rows} />} />
        <YAxis hide />
        <ChartTooltip
          content={<ChartTooltipContent hideLabel formatter={(v, _n, item) => `${usdExact(Number(v))} per message (${item.payload.shareLabel} of spend)`} />}
        />
        <Bar dataKey="costPerMsg" radius={[4, 4, 0, 0]} isAnimationActive={false}>
          {rows.map((r) => (
            <Cell key={r.label} fill={TURN_TONE[r.tone]} />
          ))}
          <LabelList dataKey="costLabel" position="top" className="fill-foreground text-[11px]" />
        </Bar>
      </BarChart>
    </ChartContainer>
  );
}

// ---- cumulative spend vs plan price ----
export function PlanValueChart({ plan }: { plan: PlanValue }) {
  const config = {
    cum: { label: "Spend so far", color: ACCENT },
    projected: { label: "Projected", color: ACCENT },
    plan: { label: "Plan price", color: "oklch(var(--muted-foreground))" },
  } satisfies ChartConfig;
  return (
    <ChartContainer config={config} className="aspect-auto h-[220px] w-full" role="img" aria-label={`Cumulative API-equivalent spend this month against a $${plan.price} plan`}>
      <ComposedChart data={plan.series} margin={{ top: 16, right: 12, left: -4, bottom: 0 }}>
        <XAxis dataKey="day" tickFormatter={shortDay} tickLine={false} axisLine={false} tickMargin={8} minTickGap={32} className={GRID_TEXT} />
        <YAxis tickFormatter={fmtUSDShort} tickLine={false} axisLine={false} width={52} className={GRID_TEXT} domain={[0, "auto"]} />
        <ChartTooltip content={<ChartTooltipContent labelFormatter={(l) => shortDay(String(l))} formatter={(v) => usdExact(Number(v))} />} />
        <Area type="monotone" dataKey="cum" stroke={ACCENT} strokeWidth={2} fill={ACCENT} fillOpacity={0.14} isAnimationActive={false} connectNulls={false} />
        <Line type="linear" dataKey="projected" stroke={ACCENT} strokeWidth={2} strokeDasharray="4 4" dot={false} isAnimationActive={false} connectNulls={false} />
        <Line type="linear" dataKey="plan" stroke="oklch(var(--muted-foreground))" strokeWidth={1.5} strokeDasharray="2 3" dot={false} isAnimationActive={false} />
        {plan.paidOffDay && plan.paidOffLabel && (
          <ReferenceLine x={plan.paidOffDay} stroke="oklch(var(--muted-foreground))" label={{ value: plan.paidOffLabel, position: "insideTopLeft", className: "fill-muted-foreground text-[10px]" }} />
        )}
      </ComposedChart>
    </ChartContainer>
  );
}

// ---- daily cost stacked by model (+ optional 7-day average) ----
export function DailyStackedCost({ rows, models, showAverage = false, label }: { rows: DailyByModelRow[]; models: DailyModelLegend[]; showAverage?: boolean; label: string }) {
  const config: ChartConfig = Object.fromEntries(models.map((m) => [m.model, { label: m.label, color: m.color }]));
  config.ma7 = { label: "7-day avg", color: "oklch(var(--foreground))" };
  return (
    <ChartContainer config={config} className="aspect-auto h-[240px] w-full" role="img" aria-label={label}>
      <ComposedChart data={rows} margin={{ top: 8, right: 8, left: -4, bottom: 0 }}>
        <XAxis dataKey="day" tickFormatter={shortDay} tickLine={false} axisLine={false} tickMargin={8} minTickGap={24} className={GRID_TEXT} />
        <YAxis tickFormatter={fmtUSDShort} tickLine={false} axisLine={false} width={52} className={GRID_TEXT} />
        <ChartTooltip content={<ChartTooltipContent labelFormatter={(l) => shortDay(String(l))} formatter={(v) => usdExact(Number(v))} />} />
        {models.map((m) => (
          <Bar key={m.model} dataKey={m.model} stackId="cost" fill={m.color} isAnimationActive={false} />
        ))}
        {showAverage && <Line type="monotone" dataKey="ma7" stroke="oklch(var(--foreground))" strokeWidth={2} dot={false} isAnimationActive={false} />}
      </ComposedChart>
    </ChartContainer>
  );
}

// ---- cost per message by effort ----
export function EffortCostBars({ rows }: { rows: EffortCostRow[] }) {
  const config = { costPerMsg: { label: "Cost per message", color: ACCENT } } satisfies ChartConfig;
  return (
    <ChartContainer config={config} className="aspect-auto h-[220px] w-full" role="img" aria-label="Cost per message by effort level">
      <BarChart data={rows} layout="vertical" margin={{ top: 0, right: 56, left: 0, bottom: 0 }}>
        <XAxis type="number" hide />
        <YAxis type="category" dataKey="label" tickLine={false} axisLine={false} width={64} className="text-[12px]" />
        <ChartTooltip content={<ChartTooltipContent hideLabel formatter={(v) => `${usdExact(Number(v))} per message`} />} />
        <Bar dataKey="costPerMsg" fill={ACCENT} radius={[0, 4, 4, 0]} isAnimationActive={false}>
          {rows.map((r) => (
            <Cell key={r.effort} fill={effortColor(r.effort)} />
          ))}
          <LabelList dataKey="costLabel" position="right" className="fill-foreground text-[11px]" />
        </Bar>
      </BarChart>
    </ChartContainer>
  );
}

// ---- Pareto: cumulative share of cost vs share of sessions ----
export function ParetoCurve({ pareto }: { pareto: Pareto }) {
  const config = { y: { label: "Share of cost", color: ACCENT } } satisfies ChartConfig;
  const pct = (v: number) => `${v}%`;
  return (
    <ChartContainer config={config} className="aspect-auto h-[200px] w-full" role="img" aria-label={pareto.top10Label ? `The top 10% of sessions account for ${pareto.top10Label} of cost` : "Cumulative share of cost across sessions, costliest first"}>
      <AreaChart data={pareto.points} margin={{ top: 8, right: 12, left: -4, bottom: 0 }}>
        <XAxis type="number" dataKey="x" domain={[0, 100]} ticks={[0, 50, 100]} tickFormatter={pct} tickLine={false} axisLine={false} className={GRID_TEXT} />
        <YAxis type="number" domain={[0, 100]} ticks={[0, 50, 100]} tickFormatter={pct} tickLine={false} axisLine={false} width={40} className={GRID_TEXT} />
        <ChartTooltip content={<ChartTooltipContent hideLabel formatter={(v) => `${Number(v).toFixed(0)}% of cost`} />} />
        <ReferenceLine segment={[{ x: 0, y: 0 }, { x: 100, y: 100 }]} stroke="oklch(var(--muted-foreground))" strokeDasharray="3 3" />
        <ReferenceLine x={pareto.markerX} stroke="oklch(var(--muted-foreground))" strokeDasharray="2 3" label={{ value: "top 10%", position: "insideTopRight", className: "fill-muted-foreground text-[10px]" }} />
        <Area type="monotone" dataKey="y" stroke={ACCENT} strokeWidth={2} fill={ACCENT} fillOpacity={0.14} isAnimationActive={false} />
      </AreaChart>
    </ChartContainer>
  );
}

// ---- Scatter: session length vs cost (log-log), ringed outliers ----
function ScatterDot({ cx, cy, payload, fill }: { cx?: number; cy?: number; payload?: ScatterPoint; fill?: string }) {
  if (cx === undefined || cy === undefined) return <g />;
  return (
    <g>
      <circle cx={cx} cy={cy} r={3.5} fill={fill} fillOpacity={0.75} />
      {payload?.outlier && <circle cx={cx} cy={cy} r={7} fill="none" stroke={fill} strokeWidth={1.5} />}
    </g>
  );
}

export function SessionScatter({ scatter }: { scatter: ScatterModel }) {
  const config: ChartConfig = Object.fromEntries(scatter.series.map((s) => [s.model, { label: s.label, color: s.color }]));
  return (
    <ChartContainer config={config} className="aspect-auto h-[260px] w-full" role="img" aria-label="Session length in messages against session cost, both on log scales">
      <ScatterChart margin={{ top: 8, right: 12, left: -4, bottom: 0 }}>
        <XAxis type="number" dataKey="messages" name="Messages" scale="log" domain={scatter.x.domain} ticks={scatter.x.ticks} allowDataOverflow tickFormatter={(v) => num(Number(v))} tickLine={false} axisLine={false} className={GRID_TEXT} />
        <YAxis type="number" dataKey="cost" name="Cost" scale="log" domain={scatter.y.domain} ticks={scatter.y.ticks} allowDataOverflow tickFormatter={(v) => fmtUSDShort(Number(v))} tickLine={false} axisLine={false} width={56} className={GRID_TEXT} />
        <ChartTooltip
          cursor={false}
          content={({ active, payload }) =>
            active && payload?.length ? (
              <div className="rounded-md border bg-popover px-2.5 py-1.5 text-xs text-popover-foreground shadow-md">{(payload[0].payload as ScatterPoint).tip}</div>
            ) : null
          }
        />
        {scatter.series.map((s) => (
          <Scatter key={s.model} name={s.label} data={s.points} fill={s.color} shape={<ScatterDot />} isAnimationActive={false} />
        ))}
      </ScatterChart>
    </ChartContainer>
  );
}

// ---- Compare days ----
// Slot colours (mockups): A = the accent (--primary), B = --slot-b (blue).
// Every use is also labelled with the text "A"/"B". Badge text is the dark
// --primary-foreground on both (8.3:1 on slot-b, 5.9:1 on the accent).
export const SLOT_COLOR = { A: "oklch(var(--primary))", B: "oklch(var(--slot-b))" } as const;
const SLOT_TEXT = "text-primary-foreground";

export function SlotBadge({ slot }: { slot: "A" | "B" }) {
  return (
    <span
      className={`inline-flex h-4 w-4 items-center justify-center rounded-[4px] font-mono text-[10px] font-semibold ${SLOT_TEXT}`}
      style={{ background: SLOT_COLOR[slot] }}
      aria-hidden
    >
      {slot}
    </span>
  );
}

export function PairedHourBars({ rows, summary }: { rows: HourPair[]; summary: string }) {
  return (
    <div role="img" aria-label={summary}>
      <div className="flex h-36 items-end gap-[3px]">
        {rows.map((h) => (
          <div key={h.hour} title={h.tip} className="flex h-full flex-1 items-end gap-px">
            <span className="w-1/2 rounded-t-[2px]" style={{ height: `${h.aPct}%`, minHeight: h.aPct > 0 ? 2 : 0, background: SLOT_COLOR.A }} />
            <span className="w-1/2 rounded-t-[2px]" style={{ height: `${h.bPct}%`, minHeight: h.bPct > 0 ? 2 : 0, background: SLOT_COLOR.B }} />
          </div>
        ))}
      </div>
      <div className="mt-1 flex gap-[3px] font-mono text-[10px] text-muted-foreground">
        {rows.map((h) => (
          <span key={h.hour} className="flex-1 overflow-visible whitespace-nowrap">
            {h.label}
          </span>
        ))}
      </div>
    </div>
  );
}

export function DivergingBars({ rows }: { rows: ModelDiffRow[] }) {
  return (
    <ul className="space-y-2">
      {rows.map((m) => (
        <li key={m.model} className="grid grid-cols-[88px_1fr_1fr_72px] items-center gap-2 text-xs">
          <span className="flex items-center gap-1.5 truncate font-mono">
            <span className="inline-block h-2 w-2 shrink-0 rounded-[2px]" style={{ background: m.color }} aria-hidden />
            {m.label}
          </span>
          <span className="flex h-3 justify-end">
            <span className="h-full rounded-l-[3px]" style={{ width: `${m.negPct}%`, background: SLOT_COLOR.B }} />
          </span>
          <span className="flex h-3">
            <span className="h-full rounded-r-[3px]" style={{ width: `${m.posPct}%`, background: SLOT_COLOR.A }} />
          </span>
          <span className="text-right font-mono tabular-nums">{m.diffLabel}</span>
        </li>
      ))}
    </ul>
  );
}

export function TokenMixBars({ rows, types }: { rows: TokenTypeRow[]; types: ReadonlyArray<{ key: string; label: string; color: string }> }) {
  return (
    <div className="space-y-3">
      {rows.map((r) => (
        <div key={r.slot} className="space-y-1">
          <span className="sr-only">{r.summary}</span>
          <div className="flex items-center justify-between font-mono text-xs" aria-hidden>
            <span className="inline-flex items-center gap-1.5">
              <SlotBadge slot={r.slot} />
              {r.slot} · {r.dayLabel}
            </span>
            <span className="font-mono tabular-nums">{r.totalLabel}</span>
          </div>
          <div className="flex h-3 overflow-hidden rounded-[3px] bg-muted" aria-hidden>
            {r.parts.map((p) => (
              <span key={p.key} title={p.tip} style={{ width: `${p.sharePct}%`, background: p.color }} />
            ))}
          </div>
        </div>
      ))}
      <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
        {types.map((t) => (
          <span key={t.key} className="inline-flex items-center gap-1.5">
            <span className="inline-block h-2 w-2 rounded-[2px]" style={{ background: t.color }} aria-hidden />
            {t.label}
          </span>
        ))}
      </div>
    </div>
  );
}
