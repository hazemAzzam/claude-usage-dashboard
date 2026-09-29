"use client";

import type { ReactNode } from "react";
import { usePathname } from "next/navigation";
import { ChatPanel } from "@/components/chat-panel";
import { AppSidebar } from "@/components/shell/app-sidebar";
import { TopBar } from "@/components/shell/top-bar";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { Skeleton } from "@/components/ui/skeleton";
import { TooltipProvider } from "@/components/ui/tooltip";
import { segmentPresets } from "@/hooks/use-dashboard-filters";
import {
  DashboardProvider,
  effortItems,
  effortLabel,
  navCounts,
  parseStats,
  useDashboard,
  viewTitle,
} from "@/hooks/use-dashboard";

// Client shell of every dashboard route: providers, sidebar + top bar, error
// banner, first-load skeleton / refetch dimming, footer and the chat sheet.
// `defaultOpen` is the sidebar's persisted state, read from its cookie by the
// server layout. State lives in DashboardProvider so route changes never refetch.
export function DashboardFrame({ children, defaultOpen }: { children: ReactNode; defaultOpen: boolean }) {
  return (
    <TooltipProvider>
      <DashboardProvider>
        <SidebarProvider defaultOpen={defaultOpen}>
          <Frame>{children}</Frame>
        </SidebarProvider>
      </DashboardProvider>
    </TooltipProvider>
  );
}

function Frame({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const { filters, data, error, loading, refresh, effortOpts, rangeLabel, chat, chatOpen, setChatOpen } = useDashboard();

  const stats = parseStats(data);

  return (
    <>
      <AppSidebar
        counts={navCounts(data)}
        effortItems={effortItems(data, effortOpts, filters.effort)}
        onEffort={filters.setEffort}
        effortLabel={effortLabel(filters.effort)}
        stats={stats}
        loading={loading}
        onRefresh={refresh}
        onAsk={() => setChatOpen(true)}
      />
      <SidebarInset className="min-w-0">
        <TopBar
          title={viewTitle(pathname)}
          range={filters.range}
          rangeLabel={rangeLabel}
          segments={segmentPresets(filters.presets)}
          presets={filters.presets}
          selectedPreset={filters.selectedPreset}
          onSelectPreset={filters.selectPresetKey}
          onApplyRange={filters.applyRange}
          onAsk={() => setChatOpen(true)}
        />
        <div className="mx-auto w-full max-w-6xl px-5 py-6">
          {error && (
            <div className="mb-6 rounded-lg border border-destructive/50 bg-destructive/10 px-4 py-3 text-sm text-destructive">
              {error}
            </div>
          )}

          {!data && !error && (
            <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
              {["a", "b", "c", "d"].map((k) => (
                <Skeleton key={k} className="h-24 rounded-xl" />
              ))}
            </div>
          )}

          {data && (
            <div className={loading ? "opacity-60 transition-opacity" : "transition-opacity"}>
              {children}
              <footer className="mt-10 border-t pt-4 text-xs text-muted-foreground">
                {stats?.footer}
              </footer>
            </div>
          )}
        </div>
      </SidebarInset>

      <Sheet open={chatOpen} onOpenChange={setChatOpen}>
        <SheetContent side="right" className="data-[side=right]:w-full data-[side=right]:sm:max-w-lg overflow-y-auto">
          <SheetHeader>
            <SheetTitle>Ask about your usage</SheetTitle>
            <SheetDescription>Questions are answered from your local usage data.</SheetDescription>
          </SheetHeader>
          <div className="px-4 pb-4">
            <ChatPanel chat={chat} />
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
