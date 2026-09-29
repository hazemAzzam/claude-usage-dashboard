import { describe, expect, it } from "vitest";
import type { DayBucket, Summary } from "../../lib/usage";
import {
  compareCards, compareDays, compareHint, dayStrip, hoursSummary, defaultPair, modelDiff, pairHours, pickDay, quickPicks, quickTarget,
  resolveSelection, slotView, swapSlots, tokenTypeRows, topSessionRows, weekdayName, whatChanged,
} from "../use-compare-view";
import { addDays } from "../../lib/format";
import { viewTitle } from "../use-dashboard";

const B0 = { cost: 0, input: 0, output: 0, cacheCreate: 0, cacheRead: 0, messages: 0, saved: 0 };
const mk = (d: string, cost: number, extra: Partial<DayBucket> = {}): DayBucket => ({ day: d, ...B0, cost, messages: cost > 0 ? 100 : 0, sessions: cost > 0 ? 4 : 0, ...extra }) as DayBucket;
const hours = (h: number, v: number) => Array.from({ length: 24 }, (_, i) => (i === h ? v : 0));
const noNaN = (x: unknown) => expect(JSON.stringify(x)).not.toMatch(/NaN|Infinity/);

// Range Sep 1 .. Sep 29 2026 (Sep 29 = Tuesday); Sep 2 idle.
const summary = (byDay: DayBucket[], from = new Date(2026, 8, 1).getTime(), to = new Date(2026, 8, 29, 23, 59).getTime()): Summary =>
  ({ from, to, generatedAt: to, byDay }) as unknown as Summary;
const days = (rows: DayBucket[]) => compareDays(summary(rows));

describe("compare helpers", () => {
  it("addDays (lib) and weekdayName", () => {
    expect(addDays("2026-09-01", -1)).toBe("2026-08-31");
    expect(addDays("2026-09-29", -7)).toBe("2026-09-22");
    expect(weekdayName("2026-09-29")).toBe("Tuesday");
    expect(weekdayName(null)).toBe("");
  });
  it("compareDays fills idle days; empty when nothing to span", () => {
    const d = days([mk("2026-09-01", 5), mk("2026-09-03", 7)]);
    expect(d).toHaveLength(29);
    expect(d[1].cost).toBe(0);
    expect(compareDays(summary([], 0, 5))).toEqual([]);
  });
  it("viewTitle knows /compare", () => expect(viewTitle("/compare")).toBe("Compare days"));
});

describe("selection", () => {
  const d = days([mk("2026-09-15", 10), mk("2026-09-22", 20), mk("2026-09-29", 30)]);
  it("defaults A latest active, B same weekday last week", () => {
    expect(defaultPair(d)).toEqual({ a: "2026-09-29", b: "2026-09-22" });
  });
  it("falls back to previous active day when a week earlier is out of range", () => {
    const d2 = compareDays(summary([mk("2026-09-03", 10), mk("2026-09-05", 20)]));
    expect(defaultPair(d2)).toEqual({ a: "2026-09-05", b: "2026-09-03" });
  });
  it("skips an idle week-earlier day for B (matches the week quick pick)", () => {
    const d3 = compareDays(summary([mk("2026-09-15", 10), mk("2026-09-29", 30)]));
    expect(defaultPair(d3)).toEqual({ a: "2026-09-29", b: "2026-09-15" });
    expect(quickTarget(d3, "2026-09-29", "week")).toBeNull();
  });
  it("hint explains a missing B", () => {
    expect(compareHint(d, "2026-09-22")).toMatch(/Choose a slot/);
    expect(compareHint(compareDays(summary([mk("2026-09-01", 5)])), null)).toBe("Only one active day in this range.");
    expect(compareHint(d, null)).toMatch(/No earlier active day/);
  });
  it("slot views carry accessible labels", () => {
    expect(slotView("A", "2026-09-29", "A")).toMatchObject({ active: true, aria: "Slot A: Sep 29, Tuesday" });
    expect(slotView("B", null, "A")).toMatchObject({ active: false, aria: "Slot B: no day selected", label: "No day" });
  });
  it("handles zero, one and no-activity ranges", () => {
    expect(defaultPair([])).toEqual({ a: null, b: null });
    const one = compareDays(summary([mk("2026-09-01", 5)], new Date(2026, 8, 1).getTime(), new Date(2026, 8, 1, 23).getTime()));
    expect(one).toHaveLength(1);
    expect(defaultPair(one)).toEqual({ a: "2026-09-01", b: null });
    const idle = compareDays(summary([], new Date(2026, 8, 1).getTime(), new Date(2026, 8, 3).getTime()));
    expect(defaultPair(idle).a).toBe("2026-09-03");
  });
  it("pick assigns the active slot then flips; swap exchanges", () => {
    const s = { a: "x", b: "y", slot: "A" as const };
    expect(pickDay(s, "z")).toEqual({ a: "z", b: "y", slot: "B" });
    expect(pickDay({ ...s, slot: "B" }, "z")).toEqual({ a: "x", b: "z", slot: "A" });
    expect(swapSlots(s)).toEqual({ a: "y", b: "x", slot: "A" });
    const half = { a: "x", b: null, slot: "A" as const };
    expect(swapSlots(half)).toBe(half); // never makes A == B
    expect(swapSlots({ a: null, b: "y", slot: "B" }).a).toBeNull();
  });
  it("resolveSelection keeps valid picks and re-defaults out-of-range ones", () => {
    expect(resolveSelection(d, { a: "2026-09-15", b: "2026-09-22", slot: "B" })).toEqual({ a: "2026-09-15", b: "2026-09-22", slot: "B" });
    expect(resolveSelection(d, { a: "2026-01-01", b: "2026-01-02", slot: "A" })).toEqual({ a: "2026-09-29", b: "2026-09-22", slot: "A" });
    expect(resolveSelection(d, { a: null, b: null, slot: "A" }).a).toBe("2026-09-29");
    expect(resolveSelection([], { a: "x", b: "y", slot: "A" })).toEqual({ a: null, b: null, slot: "A" });
  });
});

describe("quick picks", () => {
  // Mon Sep 21 ($5), Tue Sep 22 ($20), Sat Sep 26 ($90), Tue Sep 29 ($30), Sep 28 idle
  const d = days([mk("2026-09-21", 5), mk("2026-09-22", 20), mk("2026-09-26", 90), mk("2026-09-29", 30)]);
  it("prev disabled when previous day has no data; week enabled", () => {
    const p = quickPicks(d, "2026-09-29", null);
    expect(p.map((q) => q.kind)).toEqual(["prev", "week", "extremes"]);
    expect(p[0].disabled).toBe(true);
    expect(p[1].disabled).toBe(false);
    expect(quickTarget(d, "2026-09-29", "week")).toEqual({ a: "2026-09-29", b: "2026-09-22" });
  });
  it("disabled at range start / with no A", () => {
    expect(quickTarget(d, "2026-09-01", "prev")).toBeNull();
    expect(quickTarget(d, "2026-09-05", "week")).toBeNull();
    expect(quickPicks(d, null, null).filter((q) => q.kind !== "extremes").every((q) => q.disabled)).toBe(true);
  });
  it("extremes uses weekdays only (ignores the busy Saturday)", () => {
    expect(quickTarget(d, null, "extremes")).toEqual({ a: "2026-09-29", b: "2026-09-21" });
    expect(quickTarget(days([mk("2026-09-29", 30)]), null, "extremes")).toBeNull();
  });
  it("derives the active kind from the selection", () => {
    expect(quickPicks(d, "2026-09-29", "2026-09-21").find((q) => q.active)?.kind).toBe("extremes");
    expect(quickPicks(d, "2026-09-29", "2026-09-15").some((q) => q.active)).toBe(false);
  });
  it("marks the active kind", () => {
    expect(quickPicks(d, "2026-09-29", "2026-09-22").find((q) => q.active)?.kind).toBe("week");
  });
});

describe("dayStrip", () => {
  it("covers every day with heights and selection flags", () => {
    const s = dayStrip(days([mk("2026-09-01", 10), mk("2026-09-29", 40)]), "2026-09-29", "2026-09-01");
    expect(s).toHaveLength(29);
    expect(s[28]).toMatchObject({ n: 29, heightPct: 100, isA: true, isB: false });
    expect(s[0]).toMatchObject({ heightPct: 25, isB: true });
    expect(s[1].heightPct).toBe(0);
    expect(s[28].aria).toBe("Sep 29, Tuesday · $40.00, selected as A");
  });
  it("all-zero range has no NaN", () => noNaN(dayStrip(days([]), null, null)));
});

describe("cards", () => {
  it("computes values, deltas and tones", () => {
    const A = mk("2026-09-29", 30, { messages: 300, sessions: 3 });
    const Bd = mk("2026-09-22", 20, { messages: 100, sessions: 4 });
    const c = compareCards(A, Bd);
    expect(c.map((x) => x.label)).toEqual(["Cost", "Messages", "Avg turns / session", "Cost / message"]);
    expect(c[0]).toMatchObject({ a: "$30.00", b: "$20.00", delta: "▲ 50.0%", tone: "warn" });
    expect(c[1].tone).toBe("neutral");
    expect(c[2]).toMatchObject({ a: "100", b: "25" });
    expect(c[3].tone).toBe("good"); // 0.10 vs 0.20
    expect(compareCards(Bd, A)[0].tone).toBe("good");
  });
  it("averages over a zero denominator are unknown, not a 100% drop", () => {
    const c = compareCards(mk("a", 0), mk("b", 20, { messages: 100, sessions: 4 }));
    expect(c[2]).toMatchObject({ a: "—", delta: "n/a", tone: "neutral" });
    expect(c[3]).toMatchObject({ a: "—", delta: "n/a", tone: "neutral" });
    expect(c[0].delta).toBe("▼ 100.0%"); // real cost drop stays real
  });
  it("zero / empty days give n/a and no NaN", () => {
    const c = compareCards(mk("a", 0), mk("b", 0));
    expect(c[0].delta).toBe("n/a");
    noNaN(c);
    noNaN(compareCards(mk("a", 5), mk("", 0)));
  });
});

describe("pairHours", () => {
  it("uses a shared scale and labels every third hour", () => {
    const r = pairHours(mk("a", 10, { hours: hours(9, 10) }), mk("b", 5, { hours: hours(14, 5) }));
    expect(r).toHaveLength(24);
    expect(r[9].aPct).toBe(100);
    expect(r[14].bPct).toBe(50);
    expect(r[9].label).toBe("09");
    expect(r[10].label).toBe("");
    expect(r[9].tip).toContain("09:00");
  });
  it("missing/zero hours are all zero", () => {
    const r = pairHours(mk("a", 0), mk("b", 0));
    expect(r.every((h) => h.aPct === 0 && h.bPct === 0)).toBe(true);
    noNaN(r);
  });
});

describe("modelDiff", () => {
  const mb = (model: string, cost: number) => ({ model, ...B0, cost });
  it("diffs per model over the union, sorted by |diff|, diverging widths", () => {
    const r = modelDiff(
      mk("a", 0, { models: [mb("claude-opus-4-8", 10), mb("claude-haiku-4-5", 1)] }),
      mk("b", 0, { models: [mb("claude-opus-4-8", 4), mb("claude-sonnet-4-6", 8)] }),
    );
    expect(r.map((x) => x.model)).toEqual(["claude-sonnet-4-6", "claude-opus-4-8", "claude-haiku-4-5"]);
    expect(r[0]).toMatchObject({ diff: -8, negPct: 100, posPct: 0, diffLabel: "−$8.00" });
    expect(r[1]).toMatchObject({ diff: 6, posPct: 75, diffLabel: "+$6.00", label: "opus-4-8" });
  });
  it("drops sub-half-cent diffs before scaling", () => {
    const mb2 = (model: string, cost: number) => ({ model, ...B0, cost });
    const r = modelDiff(mk("a", 0, { models: [mb2("claude-opus-4-8", 10.001), mb2("claude-haiku-4-5", 2)] }), mk("b", 0, { models: [mb2("claude-opus-4-8", 10), mb2("claude-haiku-4-5", 1)] }));
    expect(r.map((x) => x.label)).toEqual(["haiku-4-5"]);
    expect(r[0].posPct).toBe(100);
  });
  it("empty days give no rows", () => expect(modelDiff(mk("a", 0), mk("b", 0))).toEqual([]));
});

describe("tokenTypeRows / topSessionRows", () => {
  it("shares sum to 100 and label by slot", () => {
    const [a, b] = tokenTypeRows(mk("2026-09-29", 10, { tokenCost: { input: 1, output: 2, cacheWrite: 3, cacheRead: 4 } }), mk("", 0));
    expect(a.slot).toBe("A");
    expect(a.parts.map((p) => p.sharePct)).toEqual([10, 20, 30, 40]);
    expect(a.dayLabel).toBe("Sep 29");
    expect(b.dayLabel).toBe("B");
    expect(b.parts.every((p) => p.sharePct === 0)).toBe(true);
    noNaN(b);
  });
  it("top sessions keep three rows with short ids", () => {
    const s = (i: number) => ({ session: `abcdef012345${i}`, project: "p", cost: i, messages: 10 * i });
    const [a, b] = topSessionRows(mk("2026-09-29", 5, { topSessions: [1, 2, 3, 4].map(s) }), mk("b", 0));
    expect(a.rows).toHaveLength(3);
    expect(a.rows[0]).toMatchObject({ id: "abcdef01", turnsLabel: "10 turns", costLabel: "$1.00" });
    expect(b.rows).toEqual([]);
  });
});

describe("screen-reader summaries", () => {
  it("hoursSummary lists hours with spend", () => {
    expect(hoursSummary(mk("a", 3, { hours: hours(9, 3) }), mk("b", 0))).toBe("Cost per hour, local time. 09:00 A $3.00, B $0.00.");
    expect(hoursSummary(mk("a", 0), mk("b", 0))).toBe("No hourly spend on either day.");
  });
  it("token rows carry a text summary", () => {
    const [a] = tokenTypeRows(mk("2026-09-29", 10, { tokenCost: { input: 1, output: 2, cacheWrite: 3, cacheRead: 4 } }), mk("", 0));
    expect(a.summary).toContain("A, Sep 29, total $10.00");
    expect(a.summary).toContain("Cache read · $4.00 (40%)");
  });
});

describe("whatChanged", () => {
  it("near-equal cost reads as about the same", () => {
    expect(whatChanged(mk("2026-09-29", 10.001), mk("2026-09-22", 10))[0]).toMatchObject({ tone: "neutral", text: "Sep 29 cost about the same as Sep 22 (1.00×)." });
  });
  const A = mk("2026-09-29", 30, { messages: 300, sessions: 3, hours: hours(11, 30), models: [{ model: "claude-opus-4-8", ...B0, cost: 30 }] as DayBucket["models"] });
  const Bd = mk("2026-09-22", 20, { messages: 100, sessions: 4, hours: hours(15, 20), models: [{ model: "claude-opus-4-8", ...B0, cost: 20 }] as DayBucket["models"] });
  it("reports cost, driver, long sessions and peak shift", () => {
    const f = whatChanged(A, Bd);
    expect(f[0]).toEqual({ tone: "up", text: "Sep 29 cost $10.00 more than Sep 22 (1.50×)." });
    expect(f[1].text).toBe("Biggest driver: opus-4-8, +$10.00.");
    expect(f[2]).toMatchObject({ tone: "up" });
    expect(f[2].text).toContain("re-read more context");
    expect(f[3].text).toBe("Peak hour 11:00 on A vs 15:00 on B.");
  });
  it("down / same-peak / no long-session flag", () => {
    const f = whatChanged(Bd, A);
    expect(f[0]).toMatchObject({ tone: "down" });
    expect(f[2].text).not.toContain("re-read");
    expect(whatChanged(A, A).find((x) => x.text.startsWith("Both"))?.text).toBe("Both days peaked at 11:00.");
  });
  it("robust to zero-cost and empty days", () => {
    expect(whatChanged(mk("2026-09-01", 0), mk("2026-09-02", 0))).toHaveLength(1);
    const f = whatChanged(A, mk("", 0));
    expect(f[0].text).toBe("Sep 29 cost $30.00; B had no spend to compare against.");
    expect(whatChanged(mk("", 0), A)[0]).toMatchObject({ tone: "down" });
    noNaN(f);
    noNaN(whatChanged(mk("", 0), mk("", 0)));
  });
});
