"use client";

import type { DayBucket, Summary } from "@/lib/usage";
import { useSortable } from "@/hooks/use-sortable";
import { useExpandable } from "@/hooks/use-expandable";

export type DailySortKey = "day" | "cost" | "messages" | "input" | "output" | "cacheCreate" | "cacheRead" | "perDollar";

export function tokensPerDollar(d: { output: number; cost: number }): number {
  return d.cost > 0 ? d.output / d.cost : 0;
}

function compareDaily(a: DayBucket, b: DayBucket, key: DailySortKey): number {
  if (key === "day") return a.day.localeCompare(b.day);
  if (key === "perDollar") return tokensPerDollar(a) - tokensPerDollar(b);
  return (a[key] as number) - (b[key] as number);
}

// Sort + row-expand view model for the Daily table.
export function useDailyView(data: Summary) {
  const { sortKey, dir, sorted, toggle } = useSortable<DayBucket, DailySortKey>(
    data.byDay,
    compareDaily,
    "day",
    () => true, // numeric high-first, and dates most-recent-first
  );
  const { isOpen, toggle: toggleRow } = useExpandable();

  const days = data.byDay.length;
  const totalCost = data.byDay.reduce((a, d) => a + d.cost, 0);
  const busiest = days ? [...data.byDay].sort((a, b) => b.cost - a.cost)[0] : undefined;
  const avgMessages = days ? Math.round(data.byDay.reduce((a, d) => a + d.messages, 0) / days) : 0;

  return {
    rows: sorted,
    sortKey,
    dir,
    toggleSort: toggle,
    isRowOpen: isOpen,
    toggleRow,
    days,
    avgCostPerDay: days ? totalCost / days : 0,
    busiest,
    avgMessages,
  };
}
