"use client";

import { ZapIcon } from "lucide-react";
import { Sidebar, SidebarContent, SidebarFooter, SidebarHeader, SidebarMenu, SidebarMenuButton, SidebarMenuItem, SidebarRail } from "@/components/ui/sidebar";
import { NavMain } from "@/components/shell/nav-main";
import { NavEffort } from "@/components/shell/nav-effort";
import { NavSecondary } from "@/components/shell/nav-secondary";
import { NavSource } from "@/components/shell/nav-source";
import type { EffortItem, NavCounts, ParseStats } from "@/hooks/use-dashboard";
import type { Effort } from "@/lib/effort";

// Composition of shadcn's dashboard-01 sidebar (inset variant), with the
// collapse-to-icons mode kept. Each section is its own presentational file.
export function AppSidebar({
  counts,
  effortItems,
  effortLabel,
  onEffort,
  stats,
  loading,
  onRefresh,
  onAsk,
}: {
  counts: NavCounts;
  effortItems: EffortItem[];
  effortLabel: string;
  onEffort: (effort: Effort | null) => void;
  stats: ParseStats;
  loading: boolean;
  onRefresh: () => void;
  onAsk: () => void;
}) {
  return (
    <Sidebar variant="inset" collapsible="icon">
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton render={<div />} size="lg" tooltip="Claude Usage" className="cursor-default hover:bg-transparent active:bg-transparent">
              <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-sidebar-primary text-sidebar-primary-foreground">
                <ZapIcon className="size-4" />
              </div>
              <span className="truncate text-base font-semibold">Claude Usage</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>
      <SidebarContent>
        <NavMain counts={counts} onAsk={onAsk} />
        <NavEffort items={effortItems} activeLabel={effortLabel} onSelect={onEffort} />
        <NavSecondary loading={loading} onRefresh={onRefresh} className="mt-auto" />
      </SidebarContent>
      <SidebarFooter>
        <NavSource stats={stats} />
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}
