"use client";

import { EfficiencyView } from "@/components/views/efficiency";
import { useLoadedDashboard } from "@/hooks/use-dashboard";

export default function EfficiencyPage() {
  const { data } = useLoadedDashboard();
  return <EfficiencyView data={data} />;
}
