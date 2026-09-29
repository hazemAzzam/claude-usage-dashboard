"use client";

import { DatabaseIcon } from "lucide-react";
import { SidebarMenu, SidebarMenuButton, SidebarMenuItem } from "@/components/ui/sidebar";
import type { ParseStats } from "@/hooks/use-dashboard";

// Sidebar footer in the shape of dashboard-01's "NavUser" row, repurposed as
// the data source: icon, the transcripts directory, and the parse summary
// ("38,214 messages · parsed in 412 ms · cache warm"). Not interactive.
export function NavSource({ stats }: { stats: ParseStats }) {
  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <SidebarMenuButton render={<div />} size="lg" tooltip={stats?.source ?? "~/.claude/projects"} className="cursor-default hover:bg-transparent active:bg-transparent">
          <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-sidebar-accent text-sidebar-accent-foreground">
            <DatabaseIcon className="size-4" />
          </div>
          <div className="grid flex-1 text-left text-sm leading-tight">
            <span className="truncate font-mono text-xs font-medium">~/.claude/projects</span>
            <span className="truncate text-xs text-muted-foreground">{stats ? stats.source : "Loading…"}</span>
          </div>
        </SidebarMenuButton>
      </SidebarMenuItem>
    </SidebarMenu>
  );
}
