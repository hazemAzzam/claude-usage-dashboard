"use client";

import { useMemo, useState } from "react";
import type { ProjectRow, Summary } from "@/lib/usage";

// Selected-project state + derived detail (latest 15 sessions for that
// project, sorted most-recent-first) for the Projects view's master/detail
// layout.
export function useProjectsView(data: Summary) {
  const projects = data.byProject;
  const [selected, setSelected] = useState<string>(projects[0]?.project ?? "");
  const active: ProjectRow | undefined = projects.find((p) => p.project === selected) ?? projects[0];
  const maxCost = projects[0]?.cost || 1;

  const recentSessions = useMemo(
    () =>
      active
        ? [...data.allSessions].filter((s) => s.project === active.project).sort((a, b) => b.lastTs - a.lastTs).slice(0, 15)
        : [],
    [data.allSessions, active],
  );

  return { projects, selected, setSelected, active, maxCost, recentSessions };
}
