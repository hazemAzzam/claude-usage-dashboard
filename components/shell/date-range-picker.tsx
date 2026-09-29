"use client";

import { CalendarIcon, ChevronDownIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { useDateRangeDraft, type DatePreset, type DateRangeValue } from "@/hooks/use-dashboard-filters";

// Top-bar date range control: a button showing the applied range that opens a
// popover with the preset list (with day counts), a two-month range calendar
// and Cancel/Apply. All draft state lives in useDateRangeDraft; nothing is
// applied to the dashboard until Apply.
export function DateRangePicker({
  value,
  label,
  presets,
  selectedPreset,
  onApply,
}: {
  value: DateRangeValue;
  label: string;
  presets: DatePreset[];
  selectedPreset: string | null;
  onApply: (next: DateRangeValue, presetKey: string | null) => void;
}) {
  const d = useDateRangeDraft(value, presets, selectedPreset, onApply);

  return (
    <Popover open={d.open} onOpenChange={d.setOpen}>
      <PopoverTrigger
        render={
          <Button variant="outline" className="h-[34px] gap-2 px-3">
            <CalendarIcon className="text-muted-foreground" />
            <span className="font-mono text-[13px]">{label}</span>
            <ChevronDownIcon className="text-muted-foreground" />
          </Button>
        }
      />
      <PopoverContent align="end" className="w-auto gap-0 overflow-hidden p-0">
        <div className="flex">
          <div className="flex w-[168px] shrink-0 flex-col gap-0.5 border-r p-2">
            <span className="px-2 py-1.5 text-[11.5px] font-medium text-muted-foreground">Presets</span>
            {d.rows.map((row) => (
              <button
                key={row.key}
                type="button"
                aria-pressed={row.active}
                onClick={() => d.pickPreset(row.key)}
                className={cn(
                  "flex h-8 items-center justify-between rounded-md px-2.5 text-left text-[13px] transition-colors hover:bg-muted",
                  row.active && "bg-muted font-medium",
                )}
              >
                <span>{row.label}</span>
                <span className="font-mono text-[11px] text-muted-foreground">{row.hint}</span>
              </button>
            ))}
          </div>
          <div className="flex flex-col gap-3 px-4 pb-3 pt-3.5">
            <Calendar
              mode="range"
              numberOfMonths={2}
              month={d.month}
              onMonthChange={d.setMonth}
              selected={d.draft}
              onSelect={d.pickRange}
              className="p-0"
            />
            <div className="flex items-center gap-2 border-t pt-3">
              <span className="font-mono text-[12.5px]">{d.label}</span>
              <span className="text-xs text-muted-foreground">{d.hint}</span>
              <div className="grow" />
              <Button variant="outline" onClick={d.cancel}>
                Cancel
              </Button>
              <Button onClick={d.apply} disabled={!d.canApply}>
                Apply
              </Button>
            </div>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
