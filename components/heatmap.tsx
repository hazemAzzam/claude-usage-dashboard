"use client";

import { usdExact } from "@/lib/format";

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
// Display Monday-first for a natural work-week reading order.
const ORDER = [1, 2, 3, 4, 5, 6, 0];

// heatmap[weekday 0..6][hour 0..23] -> cost
export function Heatmap({ data }: { data: number[][] }) {
  const max = Math.max(1, ...data.flat());

  return (
    <div className="w-full overflow-x-auto">
      <div className="min-w-[560px]">
        {/* hour axis */}
        <div className="mb-1 flex pl-10">
          {Array.from({ length: 24 }, (_, h) => (
            <div key={h} className="flex-1 text-center text-[10px] text-muted-foreground">
              {h % 3 === 0 ? h : ""}
            </div>
          ))}
        </div>
        {ORDER.map((wd) => (
          <div key={wd} className="mb-1 flex items-center">
            <div className="w-10 shrink-0 pr-2 text-right text-[11px] text-muted-foreground">{WEEKDAYS[wd]}</div>
            <div className="flex flex-1 gap-[2px]">
              {Array.from({ length: 24 }, (_, h) => {
                const cost = data[wd]?.[h] ?? 0;
                const alpha = cost > 0 ? 0.12 + (cost / max) * 0.88 : 0;
                return (
                  <div
                    key={h}
                    title={`${WEEKDAYS[wd]} ${h}:00 — ${usdExact(cost)}`}
                    className="aspect-square flex-1 rounded-[3px] ring-1 ring-inset ring-border/40"
                    style={{ background: cost > 0 ? `hsl(var(--primary) / ${alpha})` : "hsl(var(--muted) / 0.4)" }}
                  />
                );
              })}
            </div>
          </div>
        ))}
        {/* legend */}
        <div className="mt-3 flex items-center justify-end gap-2 pl-10 text-[10px] text-muted-foreground">
          <span>Less</span>
          <div className="flex gap-[2px]">
            {[0.12, 0.35, 0.58, 0.81, 1].map((a) => (
              <div key={a} className="h-3 w-3 rounded-[3px]" style={{ background: `hsl(var(--primary) / ${a})` }} />
            ))}
          </div>
          <span>More</span>
        </div>
      </div>
    </div>
  );
}
