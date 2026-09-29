"use client";

import { ProjectsView } from "@/components/views/projects";
import { useLoadedDashboard } from "@/hooks/use-dashboard";

export default function ProjectsPage() {
  const { data, filters } = useLoadedDashboard();
  return <ProjectsView key={filters.rangeKey} data={data} />;
}
