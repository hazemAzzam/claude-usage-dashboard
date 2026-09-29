"use client";

import { SessionsView } from "@/components/views/sessions";
import { useLoadedDashboard } from "@/hooks/use-dashboard";

export default function SessionsPage() {
  const { data, filters } = useLoadedDashboard();
  return <SessionsView key={filters.rangeKey} data={data} />;
}
