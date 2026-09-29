import { describe, expect, it } from "vitest";
import type { Summary } from "../usage";
import { daySpan, deriveEffortCostPerMsg, shortSessionId, zeroDay } from "../derive";

const at = (m: number, d: number, h = 12) => new Date(2026, m - 1, d, h).getTime();

describe("daySpan", () => {
  it("bounded range: range start to the earlier of range end and today", () => {
    expect(daySpan({ from: at(9, 1, 0), to: at(9, 30, 23), generatedAt: at(9, 10), byDay: [] })).toEqual({ from: "2026-09-01", to: "2026-09-10" });
    expect(daySpan({ from: at(9, 1, 0), to: at(9, 5, 23), generatedAt: at(9, 10), byDay: [] })).toEqual({ from: "2026-09-01", to: "2026-09-05" });
  });
  it("never ends before it starts (range wholly in the future)", () => {
    expect(daySpan({ from: at(10, 1, 0), to: at(10, 5), generatedAt: at(9, 10), byDay: [] })).toEqual({ from: "2026-10-01", to: "2026-10-01" });
  });
  it("unbounded range: first to last active day, null when empty", () => {
    const byDay = [{ day: "2026-01-03" }, { day: "2026-02-09" }] as Summary["byDay"];
    expect(daySpan({ from: 0, to: at(9, 1), generatedAt: at(9, 1), byDay })).toEqual({ from: "2026-01-03", to: "2026-02-09" });
    expect(daySpan({ from: 0, to: at(9, 1), generatedAt: at(9, 1), byDay: [] })).toBeNull();
  });
});

describe("small helpers", () => {
  it("zeroDay is all zeros", () => expect(zeroDay("2026-09-01")).toMatchObject({ day: "2026-09-01", cost: 0, messages: 0, sessions: 0, saved: 0 }));
  it("shortSessionId keeps 8 chars", () => expect(shortSessionId("abcdef0123456789")).toBe("abcdef01"));
  it("deriveEffortCostPerMsg is empty without data", () => {
    const r = deriveEffortCostPerMsg({ byEffort: [] } as unknown as Summary);
    expect(r.rows).toEqual([]);
    expect(r.ratio).toBeNull();
  });
});
