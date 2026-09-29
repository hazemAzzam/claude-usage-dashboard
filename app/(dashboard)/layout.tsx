import type { ReactNode } from "react";
import { cookies } from "next/headers";
import { DashboardFrame } from "@/components/shell/dashboard-frame";

// Server layout: reads the sidebar's persisted open/closed cookie (written by
// components/ui/sidebar.tsx) so the first paint matches the saved state, then
// hands everything else to the client DashboardFrame. Reading cookies() makes
// these routes dynamically rendered.
export default async function DashboardLayout({ children }: { children: ReactNode }) {
  const store = await cookies();
  const defaultOpen = store.get("sidebar_state")?.value !== "false";
  return <DashboardFrame defaultOpen={defaultOpen}>{children}</DashboardFrame>;
}
