"use client"

import { cn } from "@/lib/utils"
import { Input } from "@/components/ui/input"

export type DateRangeValue = { start: string; end: string }

// Format a Date as the local YYYY-MM-DD key the inputs/API use.
function toKey(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, "0")
  const day = String(d.getDate()).padStart(2, "0")
  return `${y}-${m}-${day}`
}

// Quick presets, each computing a fresh { start, end } window ending today.
const PRESETS: { key: string; label: string; range: () => DateRangeValue }[] = [
  {
    key: "7d",
    label: "7d",
    range: () => {
      const to = new Date()
      const from = new Date()
      from.setDate(from.getDate() - 6)
      return { start: toKey(from), end: toKey(to) }
    },
  },
  {
    key: "30d",
    label: "30d",
    range: () => {
      const to = new Date()
      const from = new Date()
      from.setDate(from.getDate() - 29)
      return { start: toKey(from), end: toKey(to) }
    },
  },
  {
    key: "90d",
    label: "90d",
    range: () => {
      const to = new Date()
      const from = new Date()
      from.setDate(from.getDate() - 89)
      return { start: toKey(from), end: toKey(to) }
    },
  },
  {
    key: "month",
    label: "This month",
    range: () => {
      const to = new Date()
      const from = new Date(to.getFullYear(), to.getMonth(), 1)
      return { start: toKey(from), end: toKey(to) }
    },
  },
  {
    key: "year",
    label: "This year",
    range: () => {
      const to = new Date()
      const from = new Date(to.getFullYear(), 0, 1)
      return { start: toKey(from), end: toKey(to) }
    },
  },
]

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
    <div className={cn("flex flex-wrap items-center gap-2", className)}>
      <div className="flex items-center gap-1">
        {PRESETS.map((p) => {
          const r = p.range()
          const active = value.start === r.start && value.end === r.end
          return (
            <button
              key={p.key}
              type="button"
              onClick={() => onChange(r)}
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
