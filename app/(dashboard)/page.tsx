"use client";

import { OverviewView } from "@/components/views/overview";
import { useLoadedDashboard } from "@/hooks/use-dashboard";

export default function OverviewPage() {
  const { data, filters } = useLoadedDashboard();
  return <OverviewView data={data} rangeLabel={filters.rangeLabel} />;
}
