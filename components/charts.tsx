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
import { fmtUSDShort, num, shortDay, usdExact } from "@/lib/format";
import type { DailyByModelRow, DailyModelLegend, EffortCostRow } from "@/lib/derive";
import type { PlanValue, TurnRow } from "@/hooks/use-overview-view";
import type { Pareto, ScatterPoint, SessionScatter as ScatterModel } from "@/hooks/use-sessions-view";
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart";

// All chart components are presentational: they receive rows already derived
// by a hook (hooks/use-*-view.ts) and only map them onto Recharts primitives.

const ACCENT = "hsl(var(--primary))";
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
            <Cell key={r.label} fill={r.late ? ACCENT : "hsl(var(--muted-foreground) / 0.45)"} />
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
    plan: { label: "Plan price", color: "hsl(var(--muted-foreground))" },
  } satisfies ChartConfig;
  return (
    <ChartContainer config={config} className="aspect-auto h-[220px] w-full" role="img" aria-label={`Cumulative API-equivalent spend this month against a $${plan.price} plan`}>
      <ComposedChart data={plan.series} margin={{ top: 16, right: 12, left: -4, bottom: 0 }}>
        <XAxis dataKey="day" tickFormatter={shortDay} tickLine={false} axisLine={false} tickMargin={8} minTickGap={32} className={GRID_TEXT} />
        <YAxis tickFormatter={fmtUSDShort} tickLine={false} axisLine={false} width={52} className={GRID_TEXT} domain={[0, "auto"]} />
        <ChartTooltip content={<ChartTooltipContent labelFormatter={(l) => shortDay(String(l))} formatter={(v) => usdExact(Number(v))} />} />
        <Area type="monotone" dataKey="cum" stroke={ACCENT} strokeWidth={2} fill={ACCENT} fillOpacity={0.14} isAnimationActive={false} connectNulls={false} />
        <Line type="linear" dataKey="projected" stroke={ACCENT} strokeWidth={2} strokeDasharray="4 4" dot={false} isAnimationActive={false} connectNulls={false} />
        <Line type="linear" dataKey="plan" stroke="hsl(var(--muted-foreground))" strokeWidth={1.5} strokeDasharray="2 3" dot={false} isAnimationActive={false} />
        {plan.paidOffDay && plan.paidOffLabel && (
          <ReferenceLine x={plan.paidOffDay} stroke="hsl(var(--muted-foreground))" label={{ value: plan.paidOffLabel, position: "insideTopLeft", className: "fill-muted-foreground text-[10px]" }} />
        )}
      </ComposedChart>
    </ChartContainer>
  );
}

// ---- daily cost stacked by model (+ optional 7-day average) ----
export function DailyStackedCost({ rows, models, showAverage = false, label }: { rows: DailyByModelRow[]; models: DailyModelLegend[]; showAverage?: boolean; label: string }) {
  const config: ChartConfig = Object.fromEntries(models.map((m) => [m.model, { label: m.label, color: m.color }]));
  config.ma7 = { label: "7-day avg", color: "hsl(var(--foreground))" };
  return (
    <ChartContainer config={config} className="aspect-auto h-[240px] w-full" role="img" aria-label={label}>
      <ComposedChart data={rows} margin={{ top: 8, right: 8, left: -4, bottom: 0 }}>
        <XAxis dataKey="day" tickFormatter={shortDay} tickLine={false} axisLine={false} tickMargin={8} minTickGap={24} className={GRID_TEXT} />
        <YAxis tickFormatter={fmtUSDShort} tickLine={false} axisLine={false} width={52} className={GRID_TEXT} />
        <ChartTooltip content={<ChartTooltipContent labelFormatter={(l) => shortDay(String(l))} formatter={(v) => usdExact(Number(v))} />} />
        {models.map((m) => (
          <Bar key={m.model} dataKey={m.model} stackId="cost" fill={m.color} isAnimationActive={false} />
        ))}
        {showAverage && <Line type="monotone" dataKey="ma7" stroke="hsl(var(--foreground))" strokeWidth={2} dot={false} isAnimationActive={false} />}
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
        <ReferenceLine segment={[{ x: 0, y: 0 }, { x: 100, y: 100 }]} stroke="hsl(var(--muted-foreground))" strokeDasharray="3 3" />
        <ReferenceLine x={pareto.markerX} stroke="hsl(var(--muted-foreground))" strokeDasharray="2 3" label={{ value: "top 10%", position: "insideTopRight", className: "fill-muted-foreground text-[10px]" }} />
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
