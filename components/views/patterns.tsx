"use client";

import type { Summary } from "@/lib/usage";
import { Heatmap } from "@/components/heatmap";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Empty, MiniStat } from "@/components/stats";
import { usePatternsView } from "@/hooks/use-patterns-view";

export function PatternsView({ data }: { data: Summary }) {
  const { stats, model, hasData } = usePatternsView(data);
  if (!hasData) return <Empty />;

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">When you spend: cost by weekday and hour of day, local time.</p>

      <section className="grid grid-cols-2 gap-4 md:grid-cols-4">
        {stats.map((s) => (
          <MiniStat key={s.label} label={s.label} value={s.value} hint={s.sub} />
        ))}
      </section>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium">Weekday × hour</CardTitle>
          <p className="text-xs text-muted-foreground">Cost per cell, brighter = more · weekday totals on the right, hourly totals below</p>
        </CardHeader>
        <CardContent>
          <Heatmap model={model} />
        </CardContent>
      </Card>
    </div>
  );
}
