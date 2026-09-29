"use client";

import { DailyView } from "@/components/views/daily";
import { useLoadedDashboard } from "@/hooks/use-dashboard";

export default function DailyPage() {
  const { data } = useLoadedDashboard();
  return <DailyView data={data} />;
}
