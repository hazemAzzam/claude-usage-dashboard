"use client";

import { CompareView } from "@/components/views/compare";
import { useLoadedDashboard } from "@/hooks/use-dashboard";

export default function ComparePage() {
  const { data, filters } = useLoadedDashboard();
  return <CompareView key={filters.rangeKey} data={data} />;
}
