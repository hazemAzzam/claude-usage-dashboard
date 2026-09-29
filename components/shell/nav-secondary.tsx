"use client";

import { RefreshCwIcon } from "lucide-react";
import { SidebarGroup, SidebarGroupContent, SidebarMenu, SidebarMenuButton, SidebarMenuItem } from "@/components/ui/sidebar";

// shadcn dashboard-01 "NavSecondary": utility actions pinned to the bottom of
// the sidebar content (`mt-auto`). Here: Refresh (re-scan transcripts,
// refresh=1), spinning and disabled while a request is in flight.
export function NavSecondary({ loading, onRefresh, className }: { loading: boolean; onRefresh: () => void; className?: string }) {
  return (
    <SidebarGroup className={className}>
      <SidebarGroupContent>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton tooltip="Refresh" onClick={onRefresh} disabled={loading} aria-label="Refresh">
              <RefreshCwIcon className={loading ? "animate-spin" : undefined} />
              <span>Refresh</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarGroupContent>
    </SidebarGroup>
  );
}
