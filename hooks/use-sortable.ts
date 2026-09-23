"use client";

import { useMemo, useState } from "react";

// Generic sort key/dir/toggle + sorted rows, shared by the table-heavy views
// (sessions, daily, efficiency) that previously each hand-rolled the same
// sortKey/dir state and toggle() logic.
//
// `compare` returns the same sign convention as Array.prototype.sort for
// ascending order; `useSortable` reverses it for "desc" and negates the
// initial direction per key via `descByDefault`.
export function useSortable<Row, Key extends string>(
  rows: Row[],
  compare: (a: Row, b: Row, key: Key) => number,
  initialKey: Key,
  descByDefault: (key: Key) => boolean = () => true,
) {
  const [sortKey, setSortKey] = useState<Key>(initialKey);
  const [dir, setDir] = useState<"asc" | "desc">(descByDefault(initialKey) ? "desc" : "asc");

  const sorted = useMemo(() => {
    const out = [...rows].sort((a, b) => compare(a, b, sortKey));
    if (dir === "desc") out.reverse();
    return out;
  }, [rows, compare, sortKey, dir]);

  function toggle(key: Key) {
    if (key === sortKey) {
      setDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setDir(descByDefault(key) ? "desc" : "asc");
    }
  }

  return { sortKey, dir, sorted, toggle };
}
