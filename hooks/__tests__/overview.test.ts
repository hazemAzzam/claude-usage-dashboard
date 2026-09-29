import { describe, expect, it } from "vitest";
import type { Summary } from "../../lib/usage";
import { modelColor } from "../../lib/format";
import {
  deltaTone,
  deriveDailyByModel,
  deriveKpis,
  derivePlanValue,
  deriveSubtitle,
  deriveTurnCost,
  daysElapsedIn,
} from "../use-overview-view";
import { deriveEffortCostPerMsg } from "../../lib/derive";

const B = { cost: 0, input: 0, output: 0, cacheCreate: 0, cacheRead: 0, messages: 0, saved: 0 };
const bucket = (o: Partial<typeof B>) => ({ ...B, ...o });

function summary(o: Partial<Summary>): Summary {
  return {
    totals: { ...B, sessions: 0 },
    cacheNetSaved: 0,
    byDay: [],
    byModel: [],
    byEffort: [],
    byDayModel: [],
    turnBuckets: [],
    previous: null,
    effort: null,
    generatedAt: 0,
    ...o,
  } as unknown as Summary;
}

describe("deltaTone", () => {
  it("cost up is warn, cost down is good", () => {
    expect(deltaTone(0.2, false)).toBe("warn");
    expect(deltaTone(-0.2, false)).toBe("good");
  });
  it("savings up is good, savings down is warn", () => {
    expect(deltaTone(0.2, true)).toBe("good");
    expect(deltaTone(-0.2, true)).toBe("warn");
  });
  it("is neutral without a baseline, a change, or a judgement", () => {
    expect(deltaTone(null, false)).toBe("neutral");
    expect(deltaTone(0, true)).toBe("neutral");
    expect(deltaTone(0.5, null)).toBe("neutral");
  });
});

describe("deriveKpis", () => {
  const s = summary({
    totals: { ...B, cost: 150, messages: 100, sessions: 6 },
    cacheNetSaved: 40,
    byDay: [
      { day: "2026-09-01", ...bucket({ cost: 100, messages: 50, saved: 10 }), sessions: 3 },
      { day: "2026-09-02", ...bucket({ cost: 50, messages: 50, saved: 5 }), sessions: 3 },
    ] as Summary["byDay"],
    previous: {
      from: 0,
      to: 0,
      totals: { ...B, cost: 100, messages: 100, sessions: 4 },
      cacheNetSaved: 50,
      partial: false,
      byDay: [],
    },
  });

  it("returns the four KPIs with deltas vs the previous window", () => {
    const k = deriveKpis(s);
    expect(k.map((x) => x.key)).toEqual(["cost", "sessions", "costPerMsg", "saved"]);
    expect(k[0].delta).toBeCloseTo(0.5);
    expect(k[0].deltaLabel).toBe("▲ 50.0%");
    expect(k[0].tone).toBe("warn");
    expect(k[1].delta).toBeCloseTo(0.5);
    expect(k[1].tone).toBe("neutral");
    expect(k[2].delta).toBeCloseTo(0.5); // 1.5 vs 1.0 per message
    expect(k[3].delta).toBeCloseTo(-0.2);
    expect(k[3].deltaLabel).toBe("▼ 20.0%");
    expect(k[3].tone).toBe("warn"); // savings fell
  });

  it("builds one spark point per active day", () => {
    const k = deriveKpis(s);
    expect(k[0].spark.map((p) => p.v)).toEqual([100, 50]);
    expect(k[1].spark.map((p) => p.v)).toEqual([3, 3]);
    expect(k[2].spark.map((p) => p.v)).toEqual([2, 1]);
    expect(k[3].spark.map((p) => p.v)).toEqual([10, 5]);
  });

  it("fills idle days with zero in the sparklines (bounded range, up to today)", () => {
    const from = new Date(2026, 8, 1).getTime();
    const gap = summary({
      from,
      to: new Date(2026, 8, 30, 23, 59).getTime(),
      generatedAt: new Date(2026, 8, 4, 12).getTime(), // "today" = Sep 4
      byDay: [
        { day: "2026-09-01", ...bucket({ cost: 10, messages: 5 }), sessions: 1 },
        { day: "2026-09-04", ...bucket({ cost: 20, messages: 5 }), sessions: 2 },
      ] as Summary["byDay"],
    });
    expect(deriveKpis(gap)[0].spark.map((p) => p.v)).toEqual([10, 0, 0, 20]);
  });

  it("says so when the previous window was trimmed to the same point", () => {
    const partial = deriveKpis({ ...s, previous: { ...s.previous!, partial: true } });
    expect(partial[0].sub).toContain("vs same point in previous period");
    expect(deriveKpis(s)[0].sub).not.toContain("same point");
  });

  it("shows n/a and a neutral tone when previous is null", () => {
    const k = deriveKpis({ ...s, previous: null });
    for (const x of k) {
      expect(x.delta).toBeNull();
      expect(x.deltaLabel).toBe("n/a");
      expect(x.tone).toBe("neutral");
    }
  });

  it("treats a zero baseline as no delta", () => {
    const k = deriveKpis({ ...s, previous: { ...s.previous!, totals: { ...B, sessions: 0 } } });
    expect(k[0].deltaLabel).toBe("n/a");
  });
});

describe("deriveSubtitle", () => {
  it("names the effort and comparison window", () => {
    const from = new Date(2026, 7, 3).getTime();
    const to = new Date(2026, 7, 31, 23, 59).getTime();
    const sub = deriveSubtitle(summary({ effort: "high", previous: { from, to, totals: { ...B, sessions: 0 }, cacheNetSaved: 0, partial: false, byDay: [] } }));
    expect(sub).toBe("API-equivalent cost · High effort · compared with Aug 3 – Aug 31");
  });
  it("mentions the same-point comparison for a partial window", () => {
    const from = new Date(2026, 7, 3).getTime();
    const sub = deriveSubtitle(summary({ previous: { from, to: from + 1000, totals: { ...B, sessions: 0 }, cacheNetSaved: 0, partial: true, byDay: [] } }));
    expect(sub).toContain("same point in the previous period");
  });
  it("handles unbounded ranges", () => {
    expect(deriveSubtitle(summary({}))).toContain("no earlier period");
  });
});

describe("deriveTurnCost", () => {
  const mk = (label: string, lo: number, cost: number, messages: number) => ({ label, lo, hi: null, ...bucket({ cost, messages }) });
  const s = summary({
    turnBuckets: [mk("1–25", 1, 10, 100), mk("26–50", 26, 10, 50), mk("151–250", 151, 30, 100), mk("251+", 251, 30, 100)] as Summary["turnBuckets"],
  });

  it("computes cost per message and share of spend per bucket", () => {
    const t = deriveTurnCost(s);
    expect(t.rows.map((r) => r.costPerMsg)).toEqual([0.1, 0.2, 0.3, 0.3]);
    expect(t.rows[0].share).toBeCloseTo(10 / 80);
    expect(t.rows.map((r) => r.late)).toEqual([false, false, true, true]);
  });

  it("derives the late-turn multiple and share, and suggests /compact", () => {
    const t = deriveTurnCost(s);
    expect(t.lateMultiple).toBeCloseTo(3); // 60/200 = 0.3 vs 0.1
    expect(t.lateShare).toBeCloseTo(60 / 80);
    expect(t.callout).toContain("3.0×");
    expect(t.callout).toContain("75%");
    expect(t.callout).toContain("before turn 151"); // first bucket over 2x the opening cost/msg
    expect(t.hasData).toBe(true);
  });

  it("falls back to neutral /compact copy when no single bucket is over 2x", () => {
    const t = deriveTurnCost(summary({ turnBuckets: [mk("1–25", 1, 10, 100), mk("151–250", 151, 15, 100)] as Summary["turnBuckets"] }));
    expect(t.lateMultiple).toBeCloseTo(1.5);
    expect(t.callout).toContain("earlier in long sessions");
  });

  it("omits the /compact hint when late turns are not costlier", () => {
    const t = deriveTurnCost(summary({ turnBuckets: [mk("1–25", 1, 50, 100), mk("151–250", 151, 10, 100)] as Summary["turnBuckets"] }));
    expect(t.lateMultiple).toBeCloseTo(0.2);
    expect(t.callout).not.toContain("/compact");
  });

  it("has no callout without a first-bucket baseline or late messages", () => {
    expect(deriveTurnCost(summary({ turnBuckets: [mk("1–25", 1, 10, 100)] as Summary["turnBuckets"] })).callout).toBeNull();
    expect(deriveTurnCost(summary({ turnBuckets: [mk("1–25", 1, 0, 0), mk("151–250", 151, 5, 5)] as Summary["turnBuckets"] })).callout).toBeNull();
    expect(deriveTurnCost(summary({})).callout).toBeNull();
    expect(deriveTurnCost(summary({})).hasData).toBe(false);
    const emptyFirst = deriveTurnCost(summary({ turnBuckets: [mk("1–25", 1, 0, 0), mk("151–250", 151, 5, 5)] as Summary["turnBuckets"] }));
    expect(emptyFirst.lateMultiple).toBeNull(); // no baseline to divide by
    expect(emptyFirst.rows[0].costPerMsg).toBe(0);
  });
});

describe("derivePlanValue", () => {
  // September 2026 (30 days): $10 every day.
  const planMonth = {
    month: "2026-09",
    daysInMonth: 30,
    byDay: Array.from({ length: 30 }, (_, i) => ({ day: `2026-09-${String(i + 1).padStart(2, "0")}`, cost: 10 })),
  };
  const sep15 = new Date(2026, 8, 15, 12).getTime();

  it("counts elapsed days: mid-month, past month, future month", () => {
    expect(daysElapsedIn("2026-09", 30, sep15)).toBe(15);
    expect(daysElapsedIn("2026-09", 30, new Date(2026, 9, 2).getTime())).toBe(30);
    expect(daysElapsedIn("2026-09", 30, new Date(2026, 7, 20).getTime())).toBe(0);
  });

  it("accumulates spend to today, projects to month end, finds the paid-off day", () => {
    const p = derivePlanValue(planMonth, 100, sep15);
    expect(p.daysElapsed).toBe(15);
    expect(p.cumToday).toBe(150);
    expect(p.multiple).toBeCloseTo(1.5);
    expect(p.multipleLabel).toBe("1.5×");
    expect(p.paidOffDay).toBe("2026-09-10");
    expect(p.paidOffLabel).toBe("Plan paid off Sep 10");
    expect(p.projectedTotal).toBeCloseTo(300);
    expect(p.projectLabel).toBe("→ $300.00 by Sep 30");
    expect(p.series[14].cum).toBe(150);
    expect(p.series[15].cum).toBeNull();
    expect(p.series[13].projected).toBeNull();
    expect(p.series[14].projected).toBe(150); // join point
    expect(p.series[29].projected).toBeCloseTo(300);
    expect(p.series.every((pt) => pt.plan === 100)).toBe(true);
    expect(p.subtitle).toContain("September 2026");
    expect(p.showProjection).toBe(true);
    expect(p.subtitle).toContain("this calendar month, all efforts, regardless of the selected range");
  });

  it("hides the projection until 3 days have elapsed", () => {
    const p = derivePlanValue(planMonth, 200, new Date(2026, 8, 2, 12).getTime());
    expect(p.daysElapsed).toBe(2);
    expect(p.showProjection).toBe(false);
    expect(p.projectLabel).toBeNull();
    expect(p.series.every((pt) => pt.projected === null)).toBe(true);
    expect(derivePlanValue(planMonth, 200, new Date(2026, 8, 3, 12).getTime()).showProjection).toBe(true);
  });

  it("does not project or find a crossing when the plan is not yet reached", () => {
    const p = derivePlanValue(planMonth, 200, new Date(2026, 8, 5, 12).getTime());
    expect(p.paidOffDay).toBeNull();
    expect(p.paidOffLabel).toBeNull();
    expect(p.cumToday).toBe(50);
  });

  it("stops projecting once the month is over", () => {
    const p = derivePlanValue(planMonth, 200, new Date(2026, 9, 3).getTime());
    expect(p.daysElapsed).toBe(30);
    expect(p.projectLabel).toBeNull();
    expect(p.series.every((pt) => pt.projected === null)).toBe(true);
    expect(p.projectedTotal).toBe(300);
  });

  it("reports no data for a month with no spend", () => {
    const empty = { ...planMonth, byDay: planMonth.byDay.map((d) => ({ ...d, cost: 0 })) };
    expect(derivePlanValue(empty, 20, sep15).hasData).toBe(false);
  });
});

describe("deriveDailyByModel", () => {
  const s = summary({
    byModel: [
      { model: "claude-opus-4-8", ...bucket({ cost: 9 }) },
      { model: "claude-haiku-4-5", ...bucket({ cost: 1 }) },
      { model: "claude-free", ...bucket({ cost: 0 }) },
    ] as Summary["byModel"],
    byDayModel: [
      { day: "2026-09-01", "claude-opus-4-8": 2, "claude-haiku-4-5": 1, "claude-free": 0 },
      { day: "2026-09-02", "claude-opus-4-8": 4, "claude-haiku-4-5": 2, "claude-free": 0 },
    ],
    byDay: [{ day: "2026-09-01" }, { day: "2026-09-02" }] as Summary["byDay"],
  });

  it("lists paid models by cost with stable colours and short labels", () => {
    const d = deriveDailyByModel(s);
    expect(d.models.map((m) => m.label)).toEqual(["opus-4-8", "haiku-4-5"]);
    expect(d.models[0].color).toBe(modelColor("claude-opus-4-8"));
    expect(d.models[0].color).not.toBe(d.models[1].color);
  });

  it("adds per-day totals and a 7-day moving average (unbounded range: first..last active day)", () => {
    const d = deriveDailyByModel(s);
    expect(d.rows.map((r) => r.total)).toEqual([3, 6]);
    expect(d.rows.map((r) => r.ma7)).toEqual([3, 4.5]);
  });

  it("counts idle days as zero in the moving average", () => {
    const gap = summary({
      byModel: s.byModel,
      byDay: [{ day: "2026-09-01" }, { day: "2026-09-04" }] as Summary["byDay"],
      byDayModel: [
        { day: "2026-09-01", "claude-opus-4-8": 6, "claude-haiku-4-5": 0, "claude-free": 0 },
        { day: "2026-09-04", "claude-opus-4-8": 6, "claude-haiku-4-5": 0, "claude-free": 0 },
      ],
    });
    const d = deriveDailyByModel(gap);
    expect(d.rows.map((r) => r.day)).toEqual(["2026-09-01", "2026-09-02", "2026-09-03", "2026-09-04"]);
    expect(d.rows.map((r) => r.total)).toEqual([6, 0, 0, 6]);
    expect(d.rows[3].ma7).toBeCloseTo(3); // 12 over 4 days, not 6 over 2 active days
  });

  it("stops a bounded range at today", () => {
    const bounded = summary({
      from: new Date(2026, 8, 1).getTime(),
      to: new Date(2026, 8, 30, 23, 59).getTime(),
      generatedAt: new Date(2026, 8, 3, 12).getTime(),
      byModel: s.byModel,
      byDay: s.byDay,
      byDayModel: s.byDayModel,
    });
    expect(deriveDailyByModel(bounded).rows.map((r) => r.day)).toEqual(["2026-09-01", "2026-09-02", "2026-09-03"]);
  });
});

describe("deriveEffortCostPerMsg", () => {
  const e = (effort: string, cost: number, messages: number) => ({ effort, ...bucket({ cost, messages }) });
  it("computes cost per message and the Max vs Low ratio", () => {
    const r = deriveEffortCostPerMsg(summary({ byEffort: [e("low", 1, 100), e("high", 5, 100), e("max", 7.4, 100), e("medium", 0, 0)] as Summary["byEffort"] }));
    expect(r.rows.map((x) => x.effort)).toEqual(["low", "high", "max"]); // empty levels dropped
    expect(r.rows[0].costPerMsg).toBeCloseTo(0.01);
    expect(r.ratio).toBeCloseTo(7.4);
    expect(r.ratioLabel).toBe("7.4×");
    expect(r.note).toBe("Max costs 7.4× Low per message");
  });
  it("has no ratio without both Low and Max", () => {
    const r = deriveEffortCostPerMsg(summary({ byEffort: [e("high", 5, 100)] as Summary["byEffort"] }));
    expect(r.ratio).toBeNull();
    expect(r.note).toBeNull();
  });
});
