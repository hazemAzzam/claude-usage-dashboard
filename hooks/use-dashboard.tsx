"use client";

import { createContext, useContext, useMemo, useState, type ReactNode } from "react";
import { EFFORT_LABEL, type Effort } from "@/lib/effort";
import { fmtCount, num, tokens, usd } from "@/lib/format";
import type { Summary } from "@/lib/usage";
import { effortOptions, useDashboardFilters } from "@/hooks/use-dashboard-filters";
import { useChat, type ChatState } from "@/hooks/use-chat";
import { useMounted } from "@/hooks/use-mounted";
import { useUsageSummary } from "@/hooks/use-usage-summary";

// Everything the dashboard shell and every route page share: the filters, the
// fetched Summary, and the chat sheet's open state. Lives in one provider
// mounted by app/(dashboard)/layout.tsx so that switching routes (which
// unmounts/mounts pages) never refetches /api/usage — the fetch is owned here,
// above the pages.
type DashboardContextValue = {
  filters: ReturnType<typeof useDashboardFilters>;
  data: Summary | null;
  error: string | null;
  loading: boolean;
  refresh: () => void;
  effortOpts: Effort[];
  rangeLabel: string;
  chat: ChatState;
  chatOpen: boolean;
  setChatOpen: (open: boolean) => void;
};

const DashboardContext = createContext<DashboardContextValue | null>(null);

export function DashboardProvider({ children }: { children: ReactNode }) {
  const filters = useDashboardFilters();
  const { data, error, loading, refresh } = useUsageSummary(filters.range, filters.effort);
  const effortOpts = useMemo(() => effortOptions(data, filters.effort), [data, filters.effort]);
  const [chatOpen, setChatOpen] = useState(false);
  const chat = useChat();
  // The default range and its label come from the client's clock/locale, so
  // show a placeholder until mounted to keep SSR and hydration markup equal.
  const mounted = useMounted();
  const rangeLabel = mounted ? filters.rangeLabel : "…";

  const value: DashboardContextValue = {
    filters,
    data,
    error,
    loading,
    refresh,
    effortOpts,
    rangeLabel,
    chat,
    chatOpen,
    setChatOpen,
  };
  return <DashboardContext.Provider value={value}>{children}</DashboardContext.Provider>;
}

export function useDashboard(): DashboardContextValue {
  const ctx = useContext(DashboardContext);
  if (!ctx) throw new Error("useDashboard must be used within a DashboardProvider.");
  return ctx;
}

// For route pages: the layout only renders its children once a Summary has
// loaded, so a page can rely on `data` being present. Throws if that contract
// is ever broken rather than forcing every page to null-check.
export function useLoadedDashboard(): DashboardContextValue & { data: Summary } {
  const ctx = useDashboard();
  if (!ctx.data) throw new Error("useLoadedDashboard called before the usage summary loaded.");
  return { ...ctx, data: ctx.data };
}

// ---- pure derivations for the shell (exported so components stay dumb) ----

// Formatted sidebar count badges; null while the first response is loading.
export type NavCounts = { sessions: string | null; projects: string | null };

export function navCounts(data: Summary | null): NavCounts {
  return data
    ? { sessions: num(data.allSessions.length), projects: num(data.byProject.length) }
    : { sessions: null, projects: null };
}

export type EffortItem = { key: Effort | null; label: string; costLabel: string; active: boolean };

// "All efforts" + one item per available level, each with that level's cost.
// The effort filter is applied inside summarize(), so while a level is
// selected the response only contains that level: other levels (and "All")
// have no cost to show and get an empty label rather than a wrong one.
export function effortItems(data: Summary | null, options: Effort[], selected: Effort | null): EffortItem[] {
  const costOf = (e: Effort) => {
    const b = data?.byEffort.find((x) => x.effort === e);
    return b ? usd(b.cost) : "";
  };
  return [
    {
      key: null,
      label: "All efforts",
      costLabel: data && data.effort === null ? usd(data.totals.cost) : "",
      active: selected === null,
    },
    ...options.map((e) => ({ key: e, label: EFFORT_LABEL[e], costLabel: costOf(e), active: selected === e })),
  ];
}

export type ParseStats = { source: string; footer: string } | null;

// Ready-made strings for the sidebar data-source row ("38,214 messages ·
// parsed in 412 ms · cache warm") and the page footer.
export function parseStats(data: Summary | null): ParseStats {
  if (!data) return null;
  return {
    source: `${fmtCount(data.totals.messages, "message")} · parsed in ${data.parseMs} ms · cache ${data.cache}`,
    footer: `Parsed ${tokens(data.totals.messages)} messages in ${data.parseMs} ms · data cached, click Refresh to re-scan · costs are list-price equivalents, not your subscription billing.`,
  };
}

// Sidebar item is active on its own route ("/" only on exactly "/").
export function isNavActive(pathname: string, href: string): boolean {
  return href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`);
}

export function effortLabel(effort: Effort | null): string {
  return effort ? EFFORT_LABEL[effort] : "All efforts";
}

const VIEW_TITLES: Record<string, string> = {
  "": "Overview",
  sessions: "Sessions",
  projects: "Projects",
  daily: "Daily",
  compare: "Compare days",
  efficiency: "Efficiency",
  patterns: "Patterns",
};

// Breadcrumb title for the current route ("/sessions" -> "Sessions").
export function viewTitle(pathname: string): string {
  return VIEW_TITLES[pathname.split("/")[1] ?? ""] ?? "Overview";
}
