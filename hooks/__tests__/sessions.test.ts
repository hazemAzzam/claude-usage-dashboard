import { describe, expect, it } from "vitest";
import { modelColor } from "../../lib/format";
import type { SessionRow } from "../../lib/usage";
import { shortSessionId } from "../../lib/derive";
import { derivePareto, deriveScatter, extraModelsLabel, lengthBin, logAxis, sessionCountLabel } from "../use-sessions-view";

const sess = (id: string, cost: number, messages: number, model = "claude-opus-4-8"): SessionRow =>
  ({ session: id, project: "p", day: "2026-09-01", firstTs: 0, lastTs: 0, model, models: [model], modelBreakdown: [], cost, messages, input: 0, output: 0, cacheCreate: 0, cacheRead: 0 }) as SessionRow;

describe("derivePareto", () => {
  it("computes top-10% / top-20% shares, costliest first", () => {
    // 10 sessions: one costs 90, nine cost 10/9 each -> total 100.
    const sessions = [sess("big", 90, 10), ...Array.from({ length: 9 }, (_, i) => sess(`s${i}`, 10 / 9, 5))];
    const p = derivePareto(sessions);
    expect(p.top10Share).toBeCloseTo(0.9);
    expect(p.top10Label).toBe("90%");
    expect(p.top20Share).toBeCloseTo(0.9 + 1 / 90);
    expect(p.markerX).toBe(10);
  });

  it("starts at the origin and ends at 100/100 with monotonic points", () => {
    const p = derivePareto(Array.from({ length: 10 }, (_, i) => sess(`s${i}`, 10 - i, 1)));
    expect(p.points[0]).toEqual({ x: 0, y: 0 });
    expect(p.points[p.points.length - 1].x).toBeCloseTo(100);
    expect(p.points[p.points.length - 1].y).toBeCloseTo(100);
    for (let i = 1; i < p.points.length; i++) expect(p.points[i].y).toBeGreaterThanOrEqual(p.points[i - 1].y);
  });

  it("thins very long lists but keeps the endpoint", () => {
    const p = derivePareto(Array.from({ length: 1001 }, (_, i) => sess(`s${i}`, 1 + (i % 7), 3)));
    expect(p.points.length).toBeLessThanOrEqual(260);
    expect(p.points[p.points.length - 1].x).toBeCloseTo(100);
  });

  it("has no top-10/20 shares below 10 sessions and marks a whole session", () => {
    const p = derivePareto([sess("a", 5, 1), sess("b", 3, 1), sess("c", 2, 1)]);
    expect(p.top10Share).toBeNull();
    expect(p.top20Label).toBeNull();
    expect(p.markerX).toBeCloseTo(100 / 3); // 1 of 3 sessions
    expect(p.points[p.points.length - 1].y).toBeCloseTo(100);
  });

  it("handles empty input", () => {
    const p = derivePareto([]);
    expect(p.points).toEqual([{ x: 0, y: 0 }]);
    expect(p.top10Share).toBeNull();
  });
});

describe("lengthBin", () => {
  it("is floor(log2(messages))", () => {
    expect([1, 2, 3, 4, 7, 8, 100].map(lengthBin)).toEqual([0, 1, 1, 2, 2, 3, 6]);
  });
});

describe("deriveScatter", () => {
  it("rings sessions costing over 2x the median of their model and length bin", () => {
    // all in bin 3 (8..15 msgs): costs 1,1,1,10 -> median 1 -> only 10 is an outlier
    const s = deriveScatter([sess("a", 1, 8), sess("b", 1, 9), sess("c", 1, 10), sess("d", 10, 12)]);
    const pts = s.series.flatMap((x) => x.points);
    expect(pts.filter((p) => p.outlier).map((p) => p.session)).toEqual(["d"]);
    expect(s.outliers).toBe(1);
  });

  it("needs at least 3 sessions in a bin to call anything an outlier", () => {
    const s = deriveScatter([sess("a", 1, 8), sess("b", 1, 9), sess("c", 50, 10)]);
    expect(s.outliers).toBe(1); // 3 samples: median 1, 50 > 2x
  });

  it("does not flag with fewer than 3 samples", () => {
    expect(deriveScatter([sess("a", 1, 8), sess("b", 50, 10)]).outliers).toBe(0);
  });

  it("compares within a model, not across models", () => {
    // Cheap haiku sessions must not make an opus session an outlier.
    const s = deriveScatter([
      sess("h1", 0.1, 8, "claude-haiku-4-5"),
      sess("h2", 0.1, 9, "claude-haiku-4-5"),
      sess("h3", 0.1, 10, "claude-haiku-4-5"),
      sess("o1", 5, 12, "claude-opus-4-8"),
    ]);
    expect(s.outliers).toBe(0);
  });

  it("does not flag cost exactly 2x the median", () => {
    const s = deriveScatter([sess("a", 1, 4), sess("b", 1, 5), sess("c", 2, 6)]);
    expect(s.outliers).toBe(0);
  });

  it("groups by model with the shared colour, drops zero-cost sessions and names the model in the tooltip", () => {
    const s = deriveScatter([sess("a", 1, 3, "claude-opus-4-8"), sess("b", 2, 3, "claude-haiku-4-5"), sess("free", 0, 3), sess("empty", 1, 0)]);
    expect(s.total).toBe(2);
    expect(s.series.map((x) => x.label).sort()).toEqual(["haiku-4-5", "opus-4-8"]);
    const opus = s.series.find((x) => x.label === "opus-4-8")!;
    expect(opus.color).toBe(modelColor("claude-opus-4-8"));
    expect(opus.points[0].tip).toContain("opus-4-8");
  });

  it("exposes power-of-10 log axes", () => {
    const s = deriveScatter([sess("a", 0.5, 3), sess("b", 42, 1200)]);
    expect(s.x.domain).toEqual([1, 10000]);
    expect(s.x.ticks).toEqual([1, 10, 100, 1000, 10000]);
    expect(s.y.domain).toEqual([0.1, 100]);
  });
});

describe("logAxis", () => {
  it("keeps exact powers and widens a single-decade range", () => {
    expect(logAxis([10, 100]).domain).toEqual([10, 100]);
    expect(logAxis([100]).domain).toEqual([100, 1000]);
    expect(logAxis([]).domain).toEqual([1, 10]);
  });
});

describe("small labels", () => {
  it("extraModelsLabel", () => {
    expect(extraModelsLabel({ models: ["a"] })).toBe("");
    expect(extraModelsLabel({ models: ["a", "b", "c"] })).toBe("+2");
  });
  it("shortSessionId keeps 8 chars", () => expect(shortSessionId("abcdef0123456789")).toBe("abcdef01"));
  it("sessionCountLabel", () => {
    expect(sessionCountLabel(412, 412)).toBe("412 sessions");
    expect(sessionCountLabel(37, 412)).toBe("37 of 412 sessions");
  });
});
