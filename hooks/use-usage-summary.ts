"use client";

import { useEffect, useEffectEvent, useRef, useState } from "react";
import type { Effort } from "@/lib/effort";
import type { Summary } from "@/lib/usage";
import type { DateRangeValue } from "@/hooks/use-dashboard-filters";

// Owns fetching /api/usage for {start, end, effort}: request lifecycle
// (AbortController cancelling a stale in-flight request when range/effort
// change again before it resolves — including a manual refresh, which is
// itself abortable by a subsequent filter change), loading/error state, and
// refresh().
//
// The effect depends only on the {start, end, effort} query key plus a
// `refreshToken` bump counter — not on the fetch function's identity — via
// `useEffectEvent`, so the fetch body (which closes over setState) can read
// fresh reactive values without being part of the effect's own dependency
// array. `useEffectEvent`-created functions may only be called from an
// Effect (or another Effect Event) in the same component, so `refresh()`
// can't call the fetcher directly; it bumps `refreshToken` instead, which
// the effect is keyed on, and reads a ref for whether *this* run is a
// manual re-scan (sends `refresh=1`) vs. a filter-driven reload. `data` is
// never cleared while a new request is in flight — callers dim the UI on
// `loading` and keep rendering the previous `data` themselves.
export function useUsageSummary(range: DateRangeValue, effort: Effort | null) {
  const [data, setData] = useState<Summary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshToken, setRefreshToken] = useState(0);
  const abortRef = useRef<AbortController | null>(null);
  const isManualRefresh = useRef(false);

  const fetchUsage = useEffectEvent(async (r: DateRangeValue, ef: Effort | null, refresh: boolean) => {
    if (!r.start || !r.end) return;

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ start: r.start, end: r.end });
      if (ef) params.set("effort", ef);
      if (refresh) params.set("refresh", "1");
      const res = await fetch(`/api/usage?${params.toString()}`, { signal: controller.signal });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Request failed");
      setData(json);
    } catch (e) {
      if (e instanceof DOMException && e.name === "AbortError") return;
      setError(e instanceof Error ? e.message : "Failed to load");
    } finally {
      if (!controller.signal.aborted) setLoading(false);
    }
  });

  // Effect depends only on the query key (start/end/effort) plus the manual
  // refresh counter — fetchUsage is a stable useEffectEvent, so it's
  // intentionally omitted from deps.
  useEffect(() => {
    const refresh = isManualRefresh.current;
    isManualRefresh.current = false;
    fetchUsage(range, effort, refresh);
    return () => abortRef.current?.abort();
  }, [range, effort, refreshToken]);

  function refresh() {
    isManualRefresh.current = true;
    setRefreshToken((t) => t + 1);
  }

  return { data, error, loading, refresh };
}
