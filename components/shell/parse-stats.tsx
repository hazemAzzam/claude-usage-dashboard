"use client";

import { RefreshCwIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SidebarMenuButton, SidebarMenuItem, SidebarMenu } from "@/components/ui/sidebar";
import type { ParseStats as ParseStatsValue } from "@/hooks/use-dashboard";

// Sidebar-footer parse summary + Refresh. Expanded: a small card with the
// message count, parse time and cache state. Icon mode: the card is hidden
// and only an icon-only Refresh button (with tooltip) remains.
export function ParseStats({
  stats,
  loading,
  onRefresh,
}: {
  stats: ParseStatsValue;
  loading: boolean;
  onRefresh: () => void;
}) {
  return (
    <>
      <div className="flex flex-col gap-2 rounded-lg border border-sidebar-border bg-background/40 p-2.5 group-data-[collapsible=icon]:hidden">
        <div className="flex flex-col leading-tight">
          <span className="font-mono text-[13px]">{stats ? stats.messages : "Loading…"}</span>
          {stats && <span className="text-[11.5px] text-muted-foreground">{stats.detail}</span>}
        </div>
        <Button variant="outline" size="sm" onClick={onRefresh} disabled={loading} title="Re-scan transcripts">
          <RefreshCwIcon className={loading ? "animate-spin" : undefined} />
          Refresh
        </Button>
      </div>
      <SidebarMenu className="hidden group-data-[collapsible=icon]:flex">
        <SidebarMenuItem>
          <SidebarMenuButton tooltip="Refresh" onClick={onRefresh} disabled={loading} aria-label="Refresh">
            <RefreshCwIcon className={loading ? "animate-spin" : undefined} />
          </SidebarMenuButton>
        </SidebarMenuItem>
      </SidebarMenu>
    </>
  );
}
