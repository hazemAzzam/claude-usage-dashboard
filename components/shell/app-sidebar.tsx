"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  CalendarDaysIcon,
  FolderIcon,
  GaugeIcon,
  ListFilterIcon,
  Grid3x3Icon,
  LayoutDashboardIcon,
  MessagesSquareIcon,
  SparklesIcon,
  ZapIcon,
  type LucideIcon,
} from "lucide-react";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
  useSidebar,
} from "@/components/ui/sidebar";
import { ParseStats } from "@/components/shell/parse-stats";
import { isNavActive, type EffortItem, NavCounts, ParseStats as ParseStatsValue } from "@/hooks/use-dashboard";
import type { Effort } from "@/lib/effort";

type NavItem = { href: string; label: string; icon: LucideIcon; count?: keyof NavCounts };

// Static route table. `count` names which sidebar badge (from NavCounts) the
// item shows. Order is the visual order.
const NAV: NavItem[] = [
  { href: "/", label: "Overview", icon: LayoutDashboardIcon },
  { href: "/sessions", label: "Sessions", icon: MessagesSquareIcon, count: "sessions" },
  { href: "/projects", label: "Projects", icon: FolderIcon, count: "projects" },
  { href: "/daily", label: "Daily", icon: CalendarDaysIcon },
  { href: "/efficiency", label: "Efficiency", icon: GaugeIcon },
  { href: "/patterns", label: "Patterns", icon: Grid3x3Icon },
];

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
  stats: ParseStatsValue;
  loading: boolean;
  onRefresh: () => void;
  onAsk: () => void;
}) {
  const pathname = usePathname();
  const { setOpen } = useSidebar();

  return (
    <Sidebar variant="inset" collapsible="icon">
      <SidebarHeader>
        <div className="flex h-12 items-center gap-2.5 px-0">
          <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-sidebar-primary text-sidebar-primary-foreground">
            <ZapIcon className="size-[18px]" />
          </div>
          <div className="flex min-w-0 flex-col leading-tight group-data-[collapsible=icon]:hidden">
            <span className="whitespace-nowrap text-sm font-semibold">Claude Usage</span>
            <span className="whitespace-nowrap font-mono text-[11.5px] text-muted-foreground">~/.claude/projects</span>
          </div>
        </div>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Views</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {NAV.map((item) => {
                const badge = item.count ? counts[item.count] : null;
                return (
                  <SidebarMenuItem key={item.href}>
                    <SidebarMenuButton
                      render={<Link href={item.href} />}
                      isActive={isNavActive(pathname, item.href)}
                      aria-current={isNavActive(pathname, item.href) ? "page" : undefined}
                      tooltip={item.label}
                    >
                      <item.icon />
                      <span>{item.label}</span>
                    </SidebarMenuButton>
                    {badge && <SidebarMenuBadge className="font-mono">{badge}</SidebarMenuBadge>}
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarGroup className="group-data-[collapsible=icon]:hidden">
          <SidebarGroupLabel>Effort</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu aria-label="Effort filter">
              {effortItems.map((item) => (
                <SidebarMenuItem key={item.key ?? "all"}>
                  <SidebarMenuButton isActive={item.active} aria-pressed={item.active} onClick={() => onEffort(item.key)}>
                    <span>{item.label}</span>
                    <span className="ml-auto font-mono text-[11px] text-muted-foreground">{item.costLabel}</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        {/* Icon mode hides the effort list; keep the active filter visible. */}
        <SidebarGroup className="hidden group-data-[collapsible=icon]:flex">
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton
                tooltip={`Effort: ${effortLabel} (click to expand)`}
                aria-label={`Effort filter: ${effortLabel}`}
                onClick={() => setOpen(true)}
              >
                <ListFilterIcon />
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton tooltip="Ask about your usage" onClick={onAsk}>
              <SparklesIcon />
              <span>Ask about your usage</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
        <ParseStats stats={stats} loading={loading} onRefresh={onRefresh} />
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}
