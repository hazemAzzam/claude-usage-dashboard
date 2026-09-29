"use client";

import Link from "next/link";
import type { Summary } from "@/lib/usage";
import { DailyStackedCost, EffortCostBars, ModelLegend, PlanValueChart, Sparkline, TurnCostBars } from "@/components/charts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Empty, Kpi } from "@/components/stats";
import { useOverviewView } from "@/hooks/use-overview-view";
import { PLAN_PRICES, parsePlanPrice, usePlanPrice } from "@/hooks/use-plan-price";

export function OverviewView({ data }: { data: Summary }) {
  const [planPrice, setPlanPrice] = usePlanPrice();
  const { kpis, subtitle, turn, plan, daily, effort } = useOverviewView(data, planPrice);

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">{subtitle}</p>

      <section className="grid grid-cols-2 gap-4 xl:grid-cols-4">
        {kpis.map((k) => (
          <Kpi
            key={k.key}
            label={k.label}
            value={k.value}
            sub={k.sub}
            delta={{ label: k.deltaLabel, tone: k.tone }}
            spark={<Sparkline data={k.spark} label={`${k.label} by day`} />}
          />
        ))}
      </section>

      <section className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium">Long sessions cost more per turn</CardTitle>
            <p className="text-xs text-muted-foreground">Average cost per message by its position in the session</p>
          </CardHeader>
          <CardContent className="space-y-3">
            {turn.hasData ? <TurnCostBars rows={turn.rows} /> : <Empty />}
            {turn.callout && <p className="rounded-md bg-muted px-3 py-2 text-xs text-soft-foreground">{turn.callout}</p>}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex-row items-start justify-between gap-3 space-y-0">
            <div className="space-y-1.5">
              <CardTitle className="text-sm font-medium">Value vs. your plan</CardTitle>
              <p className="text-xs text-muted-foreground">{plan.subtitle}</p>
            </div>
            <div className="flex flex-col items-end gap-1.5">
              <ToggleGroup
                value={[String(planPrice)]}
                onValueChange={(v) => v[0] && setPlanPrice(parsePlanPrice(v[0]))}
                variant="outline"
                size="sm"
                aria-label="Your plan price"
              >
                {PLAN_PRICES.map((p) => (
                  <ToggleGroupItem key={p} value={String(p)} aria-label={`$${p} plan`}>
                    ${p}
                  </ToggleGroupItem>
                ))}
              </ToggleGroup>
              <span className="text-xs text-muted-foreground">
                <span className="font-mono text-sm font-semibold tabular-nums text-foreground">{plan.multipleLabel}</span> of a ${plan.price} plan
              </span>
            </div>
          </CardHeader>
          <CardContent className="space-y-2">
            {plan.hasData ? <PlanValueChart plan={plan} /> : <Empty label="No spend recorded this month" />}
            {plan.showProjection && plan.projectLabel && <p className="text-right text-xs text-muted-foreground">{plan.projectLabel}</p>}
          </CardContent>
        </Card>
      </section>

      <section className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <Card>
          <CardHeader className="gap-2">
            <CardTitle className="text-sm font-medium">Daily cost by model</CardTitle>
            <p className="text-xs text-muted-foreground">Stacked bars, with a 7-day average to show the trend</p>
            <ModelLegend items={daily.models} avg="7-day avg" />
          </CardHeader>
          <CardContent>
            {daily.rows.length ? (
              <DailyStackedCost rows={daily.rows} models={daily.models} showAverage label="Daily cost stacked by model with a 7-day average" />
            ) : (
              <Empty />
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium">Cost per message by effort</CardTitle>
            <p className="text-xs text-muted-foreground">Per message, so volume doesn&apos;t skew it</p>
          </CardHeader>
          <CardContent className="space-y-2">
            {effort.rows.length ? <EffortCostBars rows={effort.rows} /> : <Empty />}
            {effort.note && (
              <Link href="/efficiency" className="block text-xs text-muted-foreground hover:text-foreground">
                {effort.note} · details
              </Link>
            )}
          </CardContent>
        </Card>
      </section>
    </div>
  );
}

