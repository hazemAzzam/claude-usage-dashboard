"use client";

import { useState } from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  Cell,
  Line,
  LineChart,
  Pie,
  PieChart,
  XAxis,
  YAxis,
} from "recharts";
import type { Summary } from "@/lib/usage";
import { shortDay, tokens, usd, usdExact } from "@/lib/format";
import { shortModel } from "@/components/stats";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";

// shadcn exposes --chart-1..5 as theme tokens (light + dark).
export const PALETTE = [
  "hsl(var(--chart-1))",
  "hsl(var(--chart-2))",
  "hsl(var(--chart-3))",
  "hsl(var(--chart-4))",
  "hsl(var(--chart-5))",
];

export function CostOverTime({ data }: { data: Summary["byDay"] }) {
  const config = { cost: { label: "Cost", color: "hsl(var(--chart-1))" } } satisfies ChartConfig;
  return (
    <ChartContainer config={config} className="aspect-auto h-[260px] w-full">
      <AreaChart data={data} margin={{ top: 8, right: 8, left: -8, bottom: 0 }}>
        <defs>
          <linearGradient id="costFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--color-cost)" stopOpacity={0.45} />
            <stop offset="100%" stopColor="var(--color-cost)" stopOpacity={0} />
          </linearGradient>
        </defs>
        <XAxis
          dataKey="day"
          tickFormatter={shortDay}
          tickLine={false}
          axisLine={false}
          tickMargin={8}
          minTickGap={24}
          className="text-[11px]"
        />
        <YAxis
          tickFormatter={(v) => `$${v}`}
          tickLine={false}
          axisLine={false}
          width={48}
          className="text-[11px]"
        />
        <ChartTooltip
          content={
            <ChartTooltipContent
              labelFormatter={(l) => shortDay(String(l))}
              formatter={(v) => usdExact(Number(v))}
            />
          }
        />
        <Area type="monotone" dataKey="cost" stroke="var(--color-cost)" strokeWidth={2} fill="url(#costFill)" isAnimationActive={false} />
      </AreaChart>
    </ChartContainer>
  );
}

// Cost over time as one line per model, with checkbox toggles to show/hide each.
export function CostByModel({ series, models }: { series: Summary["byDayModel"]; models: Summary["byModel"] }) {
  const active = models.filter((m) => m.cost > 0);
  const colorOf = (model: string) => PALETTE[active.findIndex((m) => m.model === model) % PALETTE.length];
  const [hidden, setHidden] = useState<Set<string>>(new Set());

  const config = Object.fromEntries(
    active.map((m) => [m.model, { label: shortModel(m.model), color: colorOf(m.model) }]),
  ) satisfies ChartConfig;

  function toggle(model: string) {
    setHidden((prev) => {
      const next = new Set(prev);
      if (next.has(model)) next.delete(model);
      else next.add(model);
      return next;
    });
  }

  const visible = active.filter((m) => !hidden.has(m.model));

  return (
    <div>
      <ChartContainer config={config} className="aspect-auto h-[260px] w-full">
        <LineChart data={series} margin={{ top: 8, right: 8, left: -8, bottom: 0 }}>
          <XAxis
            dataKey="day"
            tickFormatter={shortDay}
            tickLine={false}
            axisLine={false}
            tickMargin={8}
            minTickGap={24}
            className="text-[11px]"
          />
          <YAxis tickFormatter={(v) => `$${v}`} tickLine={false} axisLine={false} width={48} className="text-[11px]" />
          <ChartTooltip
            content={<ChartTooltipContent labelFormatter={(l) => shortDay(String(l))} formatter={(v) => usdExact(Number(v))} />}
          />
          {visible.map((m) => (
            <Line
              key={m.model}
              type="monotone"
              dataKey={m.model}
              stroke={colorOf(m.model)}
              strokeWidth={2}
              dot={false}
              isAnimationActive={false}
            />
          ))}
        </LineChart>
      </ChartContainer>

      <div className="mt-3 flex flex-wrap gap-2">
        {active.map((m) => {
          const on = !hidden.has(m.model);
          const color = colorOf(m.model);
          return (
            <button
              key={m.model}
              type="button"
              onClick={() => toggle(m.model)}
              aria-pressed={on}
              className={`flex items-center gap-2 rounded-md border px-2.5 py-1.5 text-xs transition-colors hover:bg-accent ${
                on ? "" : "opacity-45"
              }`}
            >
              <span
                className="grid h-3.5 w-3.5 place-items-center rounded-[4px] border text-[9px] font-bold leading-none text-background"
                style={{ borderColor: color, background: on ? color : "transparent" }}
              >
                {on ? "✓" : ""}
              </span>
              <span className="inline-block h-[3px] w-3.5 rounded-full" style={{ background: color }} />
              <span>{shortModel(m.model)}</span>
              <span className="tabular-nums text-muted-foreground">{usd(m.cost)}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function ModelSplit({ data }: { data: Summary["byModel"] }) {
  const rows = data.filter((d) => d.cost > 0);
  return (
    <ChartContainer config={{}} className="mx-auto aspect-auto h-[240px] w-full">
      <PieChart>
        <Pie data={rows} dataKey="cost" nameKey="model" innerRadius={55} outerRadius={90} paddingAngle={2} strokeWidth={0} isAnimationActive={false}>
          {rows.map((_, i) => (
            <Cell key={i} fill={PALETTE[i % PALETTE.length]} />
          ))}
        </Pie>
        <ChartTooltip content={<ChartTooltipContent nameKey="model" formatter={(v) => usdExact(Number(v))} />} />
      </PieChart>
    </ChartContainer>
  );
}

export function ProjectBars({ data }: { data: Summary["byProject"] }) {
  const rows = data.slice(0, 10);
  const config = { cost: { label: "Cost", color: "hsl(var(--chart-1))" } } satisfies ChartConfig;
  return (
    <ChartContainer config={config} style={{ height: Math.max(200, rows.length * 34) }} className="aspect-auto w-full">
      <BarChart data={rows} layout="vertical" margin={{ top: 0, right: 16, left: 8, bottom: 0 }}>
        <XAxis type="number" tickFormatter={(v) => `$${v}`} tickLine={false} axisLine={false} className="text-[11px]" />
        <YAxis
          type="category"
          dataKey="project"
          width={150}
          interval={0}
          tickFormatter={(v: string) => (v.length > 20 ? v.slice(0, 19) + "…" : v)}
          tickLine={false}
          axisLine={false}
          className="text-[12px]"
        />
        <ChartTooltip content={<ChartTooltipContent formatter={(v) => usdExact(Number(v))} hideLabel />} />
        <Bar dataKey="cost" radius={[0, 4, 4, 0]} isAnimationActive={false}>
          {rows.map((_, i) => (
            <Cell key={i} fill={PALETTE[i % PALETTE.length]} />
          ))}
        </Bar>
      </BarChart>
    </ChartContainer>
  );
}

// Output tokens produced per $ of API-equivalent cost, by project — higher = more
// "bang per token". Sorted best-first so the most efficient projects sit on top.
export function EfficiencyBars({ data }: { data: Summary["byProject"] }) {
  const rows = data
    .filter((p) => p.cost > 0)
    .map((p) => ({ project: p.project, value: Math.round(p.output / p.cost) }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 12);
  const config = { value: { label: "Output / $", color: "hsl(var(--chart-2))" } } satisfies ChartConfig;
  return (
    <ChartContainer config={config} style={{ height: Math.max(200, rows.length * 34) }} className="aspect-auto w-full">
      <BarChart data={rows} layout="vertical" margin={{ top: 0, right: 16, left: 8, bottom: 0 }}>
        <XAxis type="number" tickFormatter={(v) => tokens(v)} tickLine={false} axisLine={false} className="text-[11px]" />
        <YAxis
          type="category"
          dataKey="project"
          width={150}
          interval={0}
          tickFormatter={(v: string) => (v.length > 20 ? v.slice(0, 19) + "…" : v)}
          tickLine={false}
          axisLine={false}
          className="text-[12px]"
        />
        <ChartTooltip
          content={<ChartTooltipContent formatter={(v) => `${tokens(Number(v))} tok / $`} hideLabel />}
        />
        <Bar dataKey="value" fill="var(--color-value)" radius={[0, 4, 4, 0]} isAnimationActive={false} />
      </BarChart>
    </ChartContainer>
  );
}

export function HourBars({ data }: { data: Summary["byHour"] }) {
  const config = { cost: { label: "Cost", color: "hsl(var(--chart-1))" } } satisfies ChartConfig;
  return (
    <ChartContainer config={config} className="aspect-auto h-[200px] w-full">
      <BarChart data={data} margin={{ top: 8, right: 8, left: -8, bottom: 0 }}>
        <XAxis
          dataKey="hour"
          tickFormatter={(h: number) => (h % 6 === 0 ? `${h}:00` : "")}
          tickLine={false}
          axisLine={false}
          interval={0}
          className="text-[11px]"
        />
        <YAxis tickFormatter={(v) => `$${v}`} tickLine={false} axisLine={false} width={44} className="text-[11px]" />
        <ChartTooltip
          content={
            <ChartTooltipContent
              labelFormatter={(l) => `${l}:00–${Number(l) + 1}:00`}
              formatter={(v) => usdExact(Number(v))}
            />
          }
        />
        <Bar dataKey="cost" fill="var(--color-cost)" radius={[3, 3, 0, 0]} isAnimationActive={false} />
      </BarChart>
    </ChartContainer>
  );
}

export function TokenBars({ totals }: { totals: Summary["totals"] }) {
  const data = [
    { name: "Input", value: totals.input },
    { name: "Output", value: totals.output },
    { name: "Cache write", value: totals.cacheCreate },
    { name: "Cache read", value: totals.cacheRead },
  ];
  return (
    <ChartContainer config={{ value: { label: "Tokens" } }} className="aspect-auto h-[240px] w-full">
      <BarChart data={data} margin={{ top: 8, right: 8, left: -8, bottom: 0 }}>
        <XAxis dataKey="name" tickLine={false} axisLine={false} className="text-[11px]" />
        <YAxis tickFormatter={(v) => tokens(v)} tickLine={false} axisLine={false} width={44} className="text-[11px]" />
        <ChartTooltip content={<ChartTooltipContent formatter={(v) => `${tokens(Number(v))} tokens`} hideLabel />} />
        <Bar dataKey="value" radius={[4, 4, 0, 0]} isAnimationActive={false}>
          {data.map((_, i) => (
            <Cell key={i} fill={PALETTE[i % PALETTE.length]} />
          ))}
        </Bar>
      </BarChart>
    </ChartContainer>
  );
}
