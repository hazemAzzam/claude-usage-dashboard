"use client";

import { useDeferredValue, useMemo, useState } from "react";
import type { SessionRow, Summary } from "@/lib/usage";
import { useSortable } from "@/hooks/use-sortable";
import { useExpandable } from "@/hooks/use-expandable";

export type SessionSortKey = "project" | "day" | "model" | "cost" | "messages" | "input" | "output" | "cacheRead";

const NUMERIC: Set<SessionSortKey> = new Set(["cost", "messages", "input", "output", "cacheRead"]);

function compareSessions(a: SessionRow, b: SessionRow, key: SessionSortKey): number {
  if (key === "project") return a.project.localeCompare(b.project);
  if (key === "day") return a.day.localeCompare(b.day);
  if (key === "model") return a.model.localeCompare(b.model);
  return (a[key] as number) - (b[key] as number);
}

// Search/filter/sort + row-expand view model for the Sessions table. The
// search text is deferred so typing stays responsive while a large
// `allSessions` list re-filters.
export function useSessionsView(data: Summary) {
  const rows = data.allSessions;
  const [query, setQuery] = useState("");
  const deferredQuery = useDeferredValue(query);
  const [model, setModel] = useState<string>("all");

  const models = useMemo(() => {
    const set = new Set<string>();
    for (const r of rows) for (const m of r.models) set.add(m);
    return [...set].sort();
  }, [rows]);

  const filtered = useMemo(() => {
    const needle = deferredQuery.trim().toLowerCase();
    let out = rows;
    if (needle) out = out.filter((r) => r.project.toLowerCase().includes(needle));
    if (model !== "all") out = out.filter((r) => r.models.includes(model));
    return out;
  }, [rows, deferredQuery, model]);

  const { sortKey, dir, sorted, toggle } = useSortable<SessionRow, SessionSortKey>(
    filtered,
    compareSessions,
    "cost",
    (key) => NUMERIC.has(key),
  );

  const { isOpen, toggle: toggleRow } = useExpandable();

  const shownCost = filtered.reduce((a, r) => a + r.cost, 0);
  const avgCost = rows.length ? rows.reduce((a, r) => a + r.cost, 0) / rows.length : 0;

  return {
    rows,
    models,
    query,
    setQuery,
    model,
    setModel,
    filtered: sorted,
    sortKey,
    dir,
    toggleSort: toggle,
    isRowOpen: isOpen,
    toggleRow,
    shownCost,
    avgCost,
  };
}
