"use client";

import type { Summary } from "@/lib/usage";
import { usd, usdExact } from "@/lib/format";
import { HourBars, PALETTE } from "@/components/charts";
import { Heatmap } from "@/components/heatmap";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Empty, MiniStat } from "@/components/stats";

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const WEEKDAYS_LONG = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const ORDER = [1, 2, 3, 4, 5, 6, 0];

export function PatternsView({ data }: { data: Summary }) {
  const totalCost = data.totals.cost;
  if (totalCost <= 0) return <Empty />;

  const peakHour = [...data.byHour].sort((a, b) => b.cost - a.cost)[0];
  const peakDay = [...data.byWeekday].sort((a, b) => b.cost - a.cost)[0];
  const maxDay = Math.max(1, ...data.byWeekday.map((d) => d.cost));

  return (
    <div className="space-y-4">
      <section className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <MiniStat label="Peak hour" value={peakHour ? `${peakHour.hour}:00` : "—"} hint={peakHour && `${usd(peakHour.cost)} total`} />
        <MiniStat label="Peak day" value={peakDay ? WEEKDAYS[peakDay.weekday] : "—"} hint={peakDay && `${usd(peakDay.cost)} total`} />
        <MiniStat
          label="Busiest hour share"
          value={`${peakHour ? ((peakHour.cost / totalCost) * 100).toFixed(0) : 0}%`}
          hint="of total cost"
        />
        <MiniStat label="Active hours" value={`${data.byHour.filter((h) => h.cost > 0).length}/24`} />
      </section>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium">When you use Claude Code</CardTitle>
          <p className="text-xs text-muted-foreground">Cost by weekday × hour of day (local time)</p>
        </CardHeader>
        <CardContent>
          <Heatmap data={data.heatmap} />
        </CardContent>
      </Card>

      <section className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-sm font-medium">Cost by hour of day</CardTitle>
          </CardHeader>
          <CardContent>
            <HourBars data={data.byHour} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium">Cost by weekday</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2.5 pt-1">
              {ORDER.map((wd, i) => {
                const d = data.byWeekday[wd];
                const pct = (d.cost / maxDay) * 100;
                return (
                  <li key={wd} className="space-y-1">
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-muted-foreground">{WEEKDAYS_LONG[wd]}</span>
                      <span className="tabular-nums">{usdExact(d.cost)}</span>
                    </div>
                    <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                      <div
                        className="h-full rounded-full"
                        style={{ width: `${pct}%`, background: PALETTE[i % PALETTE.length] }}
                      />
                    </div>
                  </li>
                );
              })}
            </ul>
          </CardContent>
        </Card>
      </section>
    </div>
  );
}
