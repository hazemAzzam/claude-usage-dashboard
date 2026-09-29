"use client";

import Link from "next/link";
import { SparklesIcon } from "lucide-react";
import { Breadcrumb, BreadcrumbItem, BreadcrumbLink, BreadcrumbList, BreadcrumbPage, BreadcrumbSeparator } from "@/components/ui/breadcrumb";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { DateRangePicker } from "@/components/shell/date-range-picker";
import type { DatePreset, DateRangeValue } from "@/hooks/use-dashboard-filters";

// Sticky header of every dashboard page: sidebar trigger, breadcrumb,
// preset segmented control, date-range popover and the "Ask Claude" button.
export function TopBar({
  title,
  range,
  rangeLabel,
  segments,
  presets,
  selectedPreset,
  onSelectPreset,
  onApplyRange,
  onAsk,
}: {
  title: string;
  range: DateRangeValue;
  rangeLabel: string;
  segments: DatePreset[];
  presets: DatePreset[];
  selectedPreset: string | null;
  onSelectPreset: (key: string) => void;
  onApplyRange: (next: DateRangeValue, presetKey: string | null) => void;
  onAsk: () => void;
}) {
  return (
    <header className="flex h-12 shrink-0 items-center gap-2 border-b border-sidebar-border px-4 transition-[width,height] ease-linear lg:px-6">
      <SidebarTrigger />
      <Separator orientation="vertical" className="mx-2 data-[orientation=vertical]:h-4 data-[orientation=vertical]:self-center" />
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink render={<Link href="/" />}>Dashboard</BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>{title}</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>
      <div className="grow" />
      <ToggleGroup
        aria-label="Date presets"
        spacing={0}
        value={selectedPreset ? [selectedPreset] : []}
        className="rounded-md border border-sidebar-border bg-panel p-[3px]"
      >
        {segments.map((p) => (
          <ToggleGroupItem
            key={p.key}
            value={p.key}
            // Per-item click (not the group's onValueChange) so re-clicking the
            // active preset still re-runs it and recomputes the range.
            onClick={() => onSelectPreset(p.key)}
            size="sm"
            className="h-[26px] rounded-[5px] px-2.5 text-[12.5px] aria-pressed:bg-sidebar-accent aria-pressed:text-foreground"
          >
            {p.label}
          </ToggleGroupItem>
        ))}
      </ToggleGroup>
      <DateRangePicker
        value={range}
        label={rangeLabel}
        presets={presets}
        selectedPreset={selectedPreset}
        onApply={onApplyRange}
      />
      <Button className="h-[34px] gap-2 px-3.5 font-semibold" onClick={onAsk}>
        <SparklesIcon />
        Ask Claude
      </Button>
    </header>
  );
}
