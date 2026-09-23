"use client"

import { cn } from "@/lib/utils"
import { Input } from "@/components/ui/input"
import type { DatePreset, DateRangeValue } from "@/hooks/use-dashboard-filters"

export function DateRangeInputs({
  value,
  onChange,
  presets,
  selectedPreset,
  onSelectPreset,
  className,
}: {
  value: DateRangeValue
  onChange: (next: DateRangeValue) => void
  presets: DatePreset[]
  selectedPreset: string | null
  onSelectPreset: (preset: DatePreset) => void
  className?: string
}) {
  return (
    <div className={cn("flex flex-wrap items-center gap-2", className)}>
      <div className="flex items-center gap-1">
        {presets.map((p) => {
          const active = selectedPreset === p.key
          return (
            <button
              key={p.key}
              type="button"
              onClick={() => onSelectPreset(p)}
              aria-pressed={active}
              className={cn(
                "h-8 rounded-md border px-2.5 text-sm transition-colors",
                active
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-input bg-transparent text-muted-foreground hover:bg-muted hover:text-foreground",
              )}
            >
              {p.label}
            </button>
          )
        })}
      </div>
      <label className="flex items-center gap-1.5 text-sm text-muted-foreground">
        <span>From</span>
        <Input
          type="date"
          value={value.start}
          max={value.end || undefined}
          onChange={(e) => onChange({ ...value, start: e.target.value })}
          className="h-8 w-[9.5rem]"
          aria-label="Start date"
        />
      </label>
      <label className="flex items-center gap-1.5 text-sm text-muted-foreground">
        <span>To</span>
        <Input
          type="date"
          value={value.end}
          min={value.start || undefined}
          onChange={(e) => onChange({ ...value, end: e.target.value })}
          className="h-8 w-[9.5rem]"
          aria-label="End date"
        />
      </label>
    </div>
  )
}
