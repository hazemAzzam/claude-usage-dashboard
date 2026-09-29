"use client";

import { useMemo, useState } from "react";
import type { ProjectRow, SessionRow, Summary } from "@/lib/usage";
import { fmtShare, modelColor, num, shortModel, usdExact, usdFine } from "@/lib/format";
import { fillDays, safeDiv, shareOf } from "@/lib/stats";
import { daySpan, shortSessionId, type DailyByModelRow, type DailyModelLegend } from "@/lib/derive";

// ---- master list ----
export interface ProjectListItem {
  project: string;
  costLabel: string;
  widthPct: number; // cost relative to the priciest project (0..100)
  sessionsLabel: string;
}

export function filterProjects(projects: ProjectRow[], query: string): ProjectRow[] {
  const needle = query.trim().toLowerCase();
  return needle ? projects.filter((p) => p.project.toLowerCase().includes(needle)) : projects;
}

/** Keep the selection only if it is still in the (filtered) list; otherwise the first visible project, or "" when none. */
export function resolveSelected(selected: string, visible: ProjectRow[]): string {
  return visible.some((p) => p.project === selected) ? selected : (visible[0]?.project ?? "");
}

export function deriveProjectList(projects: ProjectRow[], maxCost: number): ProjectListItem[] {
  return projects.map((p) => ({
    project: p.project,
    costLabel: usdExact(p.cost),
    widthPct: shareOf(p.cost, maxCost) * 100,
    sessionsLabel: `${num(p.sessions)} sessions`,
  }));
}

// ---- detail ----
export interface ProjectDetail {
  project: string;
  shareLabel: string; // "12% of total cost"
  stats: Array<{ label: string; value: string }>;
  legend: DailyModelLegend[];
  days: DailyByModelRow[]; // one row per active day, one numeric key per model
  byModel: Array<{ model: string; label: string; color: string; messages: number; costLabel: string; widthPct: number }>;
  sessionsTitle: string;
  sessions: Array<{ session: string; id: string; day: string; label: string; color: string; messages: number; costLabel: string }>;
}

function modelRow(day: string, legend: DailyModelLegend[], models: Array<{ model: string; cost: number }>): DailyByModelRow {
  const row: DailyByModelRow = { day };
  for (const m of legend) row[m.model] = models.find((x) => x.model === m.model)?.cost ?? 0;
  return row;
}

export function deriveProjectDetail(
  p: ProjectRow,
  totalCost: number,
  allSessions: SessionRow[],
  span: { from: string; to: string } | null,
): ProjectDetail {
  const models = p.models.filter((m) => m.cost > 0);
  const legend = models.map((m) => ({ model: m.model, label: shortModel(m.model), color: modelColor(m.model) }));
  const top = models[0]?.cost ?? 0;
  const recent = allSessions
    .filter((s) => s.project === p.project)
    .sort((a, b) => b.lastTs - a.lastTs)
    .slice(0, 15);
  return {
    project: p.project,
    shareLabel: `${fmtShare(shareOf(p.cost, totalCost), 1)} of total cost`,
    stats: [
      { label: "Cost", value: usdExact(p.cost) },
      { label: "Sessions", value: num(p.sessions) },
      { label: "Messages", value: num(p.messages) },
      { label: "Avg / session", value: usdFine(safeDiv(p.cost, p.sessions)) },
    ],
    legend,
    days: (() => {
      const rows = p.byDay.map((d) => modelRow(d.day, legend, d.models));
      // Idle days as $0 so the chart's time axis is continuous.
      return span ? fillDays(rows, span.from, span.to, (day) => modelRow(day, legend, [])) : rows;
    })(),
    byModel: models.map((m) => ({
      model: m.model,
      label: shortModel(m.model),
      color: modelColor(m.model),
      messages: m.messages,
      costLabel: usdExact(m.cost),
      widthPct: shareOf(m.cost, top) * 100,
    })),
    sessionsTitle: p.sessions > recent.length ? `Latest sessions (${recent.length} of ${num(p.sessions)})` : `Latest sessions (${num(p.sessions)})`,
    sessions: recent.map((s) => ({
      session: s.session,
      id: shortSessionId(s.session),
      day: s.day,
      label: shortModel(s.model),
      color: modelColor(s.model),
      messages: s.messages,
      costLabel: usdExact(s.cost),
    })),
  };
}

// Selected-project + filter state and derived master/detail models for the
// Projects view.
export function useProjectsView(data: Summary) {
  const [query, setQuery] = useState("");
  const [picked, setSelected] = useState<string>(data.byProject[0]?.project ?? "");

  const projects = data.byProject;
  const visible = useMemo(() => filterProjects(projects, query), [projects, query]);
  const list = useMemo(() => deriveProjectList(visible, projects[0]?.cost ?? 0), [visible, projects]);
  // The list and the detail always agree: a filter that hides the picked project moves the selection to the first visible one.
  const selected = resolveSelected(picked, visible);
  const active = projects.find((p) => p.project === selected);
  const span = useMemo(() => daySpan(data), [data]);
  const detail = useMemo(
    () => (active ? deriveProjectDetail(active, data.totals.cost, data.allSessions, span) : null),
    [active, data.totals.cost, data.allSessions, span],
  );
  const countLabel = visible.length === projects.length ? `${num(projects.length)} projects` : `${num(visible.length)} of ${num(projects.length)} projects`;

  return { list, detail, activeProject: active?.project, setSelected, query, setQuery, countLabel, total: projects.length };
}
