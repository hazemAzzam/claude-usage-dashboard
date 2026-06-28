"use client"

import { cn } from "@/lib/utils"
import { Input } from "@/components/ui/input"

export type DateRangeValue = { start: string; end: string }

export function DateRangeInputs({
  value,
  onChange,
  className,
}: {
  value: DateRangeValue
  onChange: (next: DateRangeValue) => void
  className?: string
}) {
  return (
    <div className={cn("flex items-center gap-2", className)}>
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
