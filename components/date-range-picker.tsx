"use client"

import * as React from "react"
import type { DateRange } from "react-day-picker"
import { Calendar as CalendarIcon } from "lucide-react"

import { cn } from "@/lib/utils"
import { buttonVariants } from "@/components/ui/button"
import { Calendar } from "@/components/ui/calendar"
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover"

function fmt(d: Date): string {
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })
}

export function rangeLabel(range: DateRange | undefined): string {
  if (!range?.from) return "Pick a date range"
  return range.to ? `${fmt(range.from)} – ${fmt(range.to)}` : fmt(range.from)
}

export function DateRangePicker({
  value,
  onChange,
  className,
}: {
  value: DateRange | undefined
  onChange: (range: DateRange | undefined) => void
  className?: string
}) {
  const [open, setOpen] = React.useState(false)
  // In-progress selection, separate from the committed `value`. We reset it to
  // `undefined` each time the popover opens so the first click always sets the
  // start: react-day-picker's range logic otherwise treats a click against an
  // already-complete range as moving an endpoint, instantly completing it.
  const [draft, setDraft] = React.useState<DateRange | undefined>(undefined)

  function handleOpenChange(next: boolean) {
    if (next) setDraft(undefined)
    setOpen(next)
  }

  function handleSelect(range: DateRange | undefined) {
    setDraft(range)
    if (range?.from && range?.to) {
      onChange(range)
      setOpen(false)
    }
  }

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger
        className={cn(
          buttonVariants({ variant: "outline", size: "sm" }),
          "justify-start gap-1.5 font-normal",
          !value?.from && "text-muted-foreground",
          className
        )}
      >
        <CalendarIcon className="size-3.5" />
        {rangeLabel(value)}
      </PopoverTrigger>
      <PopoverContent align="end" className="p-3">
        <Calendar
          mode="range"
          defaultMonth={value?.to ?? value?.from}
          selected={draft}
          onSelect={handleSelect}
          numberOfMonths={2}
        />
      </PopoverContent>
    </Popover>
  )
}
