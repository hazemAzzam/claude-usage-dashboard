"use client";

import { useState } from "react";

// Generic "open set" toggle for expandable table rows (sessions/daily/efficiency
// model-breakdown sub-rows), shared instead of each view keeping its own
// `Set<string>` + toggle callback.
export function useExpandable() {
  const [open, setOpen] = useState<Set<string>>(new Set());

  function toggle(id: string) {
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return { open, isOpen: (id: string) => open.has(id), toggle };
}
