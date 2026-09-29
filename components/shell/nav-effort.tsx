"use client";

import { ListFilterIcon } from "lucide-react";
import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar";
import type { EffortItem } from "@/hooks/use-dashboard";
import type { Effort } from "@/lib/effort";

// "Effort" filter group. Expanded: one row per level with its cost. Icon mode
// hides the list and shows a single filter button that re-expands the sidebar
// (its tooltip names the active filter).
export function NavEffort({
  items,
  activeLabel,
  onSelect,
}: {
  items: EffortItem[];
  activeLabel: string;
  onSelect: (effort: Effort | null) => void;
}) {
  const { setOpen } = useSidebar();

  return (
    <>
      <SidebarGroup className="group-data-[collapsible=icon]:hidden">
        <SidebarGroupLabel>Effort</SidebarGroupLabel>
        <SidebarGroupContent>
          <SidebarMenu aria-label="Effort filter">
            {items.map((item) => (
              <SidebarMenuItem key={item.key ?? "all"}>
                <SidebarMenuButton isActive={item.active} aria-pressed={item.active} onClick={() => onSelect(item.key)}>
                  <span>{item.label}</span>
                  <span className="ml-auto font-mono text-[11px] text-muted-foreground">{item.costLabel}</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
            ))}
          </SidebarMenu>
        </SidebarGroupContent>
      </SidebarGroup>

      <SidebarGroup className="hidden group-data-[collapsible=icon]:flex">
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              tooltip={`Effort: ${activeLabel} (click to expand)`}
              aria-label={`Effort filter: ${activeLabel}`}
              onClick={() => setOpen(true)}
            >
              <ListFilterIcon />
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarGroup>
    </>
  );
}
