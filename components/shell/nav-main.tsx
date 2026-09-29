"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  CalendarDaysIcon,
  FolderIcon,
  GitCompareIcon,
  GaugeIcon,
  Grid3x3Icon,
  LayoutDashboardIcon,
  MessagesSquareIcon,
  SparklesIcon,
  type LucideIcon,
} from "lucide-react";
import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";
import { isNavActive, type NavCounts } from "@/hooks/use-dashboard";

type NavItem = { href: string; label: string; icon: LucideIcon; count?: keyof NavCounts };

// Static route table, in visual order. `count` names which sidebar badge
// (from NavCounts) the item shows.
const NAV: NavItem[] = [
  { href: "/", label: "Overview", icon: LayoutDashboardIcon },
  { href: "/sessions", label: "Sessions", icon: MessagesSquareIcon, count: "sessions" },
  { href: "/projects", label: "Projects", icon: FolderIcon, count: "projects" },
  { href: "/daily", label: "Daily", icon: CalendarDaysIcon },
  { href: "/compare", label: "Compare days", icon: GitCompareIcon },
  { href: "/efficiency", label: "Efficiency", icon: GaugeIcon },
  { href: "/patterns", label: "Patterns", icon: Grid3x3Icon },
];

// shadcn dashboard-01 "NavMain": a primary action row ("Ask Claude", opens the
// chat sheet) above the view links. Only usePathname() for the active state.
export function NavMain({ counts, onAsk }: { counts: NavCounts; onAsk: () => void }) {
  const pathname = usePathname();

  return (
    <SidebarGroup>
      <SidebarGroupContent className="flex flex-col gap-2">
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              tooltip="Ask Claude"
              onClick={onAsk}
              className="min-w-8 bg-primary text-primary-foreground duration-200 ease-linear hover:bg-primary/90 hover:text-primary-foreground active:bg-primary/90 active:text-primary-foreground"
            >
              <SparklesIcon />
              <span>Ask Claude</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
        <SidebarMenu>
          {NAV.map((item) => {
            const active = isNavActive(pathname, item.href);
            const badge = item.count ? counts[item.count] : null;
            return (
              <SidebarMenuItem key={item.href}>
                <SidebarMenuButton
                  render={<Link href={item.href} />}
                  isActive={active}
                  aria-current={active ? "page" : undefined}
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
  );
}
