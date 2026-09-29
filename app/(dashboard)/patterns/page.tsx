"use client";

import { PatternsView } from "@/components/views/patterns";
import { useLoadedDashboard } from "@/hooks/use-dashboard";

export default function PatternsPage() {
  const { data } = useLoadedDashboard();
  return <PatternsView data={data} />;
}
