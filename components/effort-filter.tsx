"use client";

import { cn } from "@/lib/utils";
import { EFFORT_LABEL, type Effort } from "@/lib/effort";

// Single-select chip row for the effort-level filter, styled like the
// DateRangeInputs presets / sessions view's FilterChip.
export function EffortFilter({
  value,
  options,
  onChange,
  className,
}: {
  value: Effort | null;
  options: Effort[];
  onChange: (next: Effort | null) => void;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-wrap items-center gap-1", className)}>
      <Chip label="All efforts" active={value === null} onClick={() => onChange(null)} />
      {options.map((e) => (
        <Chip key={e} label={EFFORT_LABEL[e]} active={value === e} onClick={() => onChange(e)} />
      ))}
    </div>
  );
}

function Chip({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "h-8 rounded-md border px-2.5 text-sm transition-colors",
        active
          ? "border-primary bg-primary text-primary-foreground"
          : "border-input bg-transparent text-muted-foreground hover:bg-muted hover:text-foreground",
      )}
    >
      {label}
    </button>
  );
}
