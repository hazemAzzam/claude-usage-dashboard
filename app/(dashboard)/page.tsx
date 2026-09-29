"use client";

import { OverviewView } from "@/components/views/overview";
import { useLoadedDashboard } from "@/hooks/use-dashboard";

export default function OverviewPage() {
  const { data } = useLoadedDashboard();
  return <OverviewView data={data} />;
}
