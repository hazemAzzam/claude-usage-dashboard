import { describe, expect, it } from "vitest";
import type { ModelBucket, Summary } from "../../lib/usage";
import { deriveEfficiencyKpis, deriveModelRows, effortGridNote, effortModelGrid, outputPerDollar, outputShare } from "../use-efficiency-view";

const B = { cost: 0, input: 0, output: 0, cacheCreate: 0, cacheRead: 0, messages: 0, saved: 0 };
const eff = (effort: string, cost: number, messages: number, output = 0) => ({ effort, ...B, cost, messages, output });
const model = (id: string, cost: number, messages: number, output: number, efforts: ReturnType<typeof eff>[]): ModelBucket =>
  ({ model: id, ...B, cost, messages, output, efforts }) as unknown as ModelBucket;

const OPUS = model("claude-opus-4-8", 100, 100, 1000, [eff("low", 10, 50), eff("high", 60, 40), eff("max", 30, 10)]);
const HAIKU = model("claude-haiku-4-5", 10, 100, 500, [eff("low", 2, 50), eff("high", 8, 50)]);

describe("helpers", () => {
  it("outputShare / outputPerDollar", () => {
    expect(outputShare({ input: 75, output: 25, cacheCreate: 0, cacheRead: 0 })).toBe(25);
    expect(outputShare({ input: 0, output: 0, cacheCreate: 0, cacheRead: 0 })).toBe(0);
    expect(outputPerDollar(4, 100)).toBe(25);
    expect(outputPerDollar(0, 100)).toBe(0);
  });
});

describe("deriveEfficiencyKpis", () => {
  const s = {
    totals: { ...B, cost: 110, messages: 200, input: 100, cacheRead: 900, sessions: 3 },
    cacheNetSaved: 6340,
    byModel: [OPUS, HAIKU],
    byEffort: [eff("low", 12, 100), eff("max", 30, 10)],
    previous: null,
  } as unknown as Summary;

  it("builds the four action KPIs", () => {
    const k = deriveEfficiencyKpis(s);
    expect(k.map((x) => x.key)).toEqual(["costPerMsg", "saved", "bestOutput", "effortRatio"]);
    expect(k[0].value).toBe("$0.55");
    expect(k[0].sub).toContain("no earlier period");
    expect(k[1].value).toBe("$6,340.00");
    expect(k[1].sub).toBe("90.0% of input-side tokens were cache reads");
    expect(k[2].value).toBe("haiku-4-5"); // 500/10 = 50 tok/$ vs opus 10
    expect(k[2].sub).toContain("opus-4-8: 10");
    expect(k[3].value).toBe("25.0×"); // 3.00 / 0.12
  });

  it("includes the delta vs the previous window in the first KPI", () => {
    const from = new Date(2026, 7, 3).getTime();
    const to = new Date(2026, 7, 31).getTime();
    const withPrev = { ...s, previous: { from, to, partial: false, totals: { ...B, cost: 100, messages: 200, sessions: 1 }, cacheNetSaved: 0, byDay: [] } } as unknown as Summary;
    expect(deriveEfficiencyKpis(withPrev)[0].sub).toBe("▲ 10.0% vs Aug 3 – Aug 31");
  });

  it("says same point in previous period for a trimmed window", () => {
    const from = new Date(2026, 7, 3).getTime();
    const withPrev = { ...s, previous: { from, to: from + 1000, partial: true, totals: { ...B, cost: 100, messages: 200, sessions: 1 }, cacheNetSaved: 0, byDay: [] } } as unknown as Summary;
    expect(deriveEfficiencyKpis(withPrev)[0].sub).toBe("▲ 10.0% vs same point in previous period");
  });

  it("falls back gracefully with no output or no effort spread", () => {
    const k = deriveEfficiencyKpis({ ...s, byModel: [], byEffort: [] } as unknown as Summary);
    expect(k[2].value).toBe("—");
    expect(k[3].value).toBe("—");
  });
});

describe("deriveModelRows", () => {
  it("orders by cost and computes per-model and per-effort metrics", () => {
    const rows = deriveModelRows([HAIKU, OPUS, model("claude-free", 0, 5, 0, [])]);
    expect(rows.map((r) => r.label)).toEqual(["opus-4-8", "haiku-4-5"]);
    expect(rows[0].costPerMsg).toBe(1);
    expect(rows[0].perDollar).toBe(10);
    expect(rows[0].efforts.map((e) => e.label)).toEqual(["Low", "High", "Max"]);
    expect(rows[0].efforts[1].costPerMsg).toBeCloseTo(1.5);
  });
});

describe("effortModelGrid", () => {
  const grid = effortModelGrid([HAIKU, OPUS]);

  it("uses models as columns (cost desc) and efforts as rows (low to max)", () => {
    expect(grid.models.map((m) => m.label)).toEqual(["opus-4-8", "haiku-4-5"]);
    expect(grid.efforts.map((e) => e.label)).toEqual(["Low", "High", "Max"]);
  });

  it("fills cost per message, null where a model never ran at that effort", () => {
    expect(grid.cells[0][0].value).toBeCloseTo(0.2); // opus low
    expect(grid.cells[1][1].value).toBeCloseTo(0.16); // haiku high
    expect(grid.cells[2][1].value).toBeNull(); // haiku max
    expect(grid.cells[2][1].label).toBe("—");
    expect(grid.cells[2][1].alpha).toBe(0);
    expect(grid.cells[2][1].strong).toBe(false);
    expect(grid.cells.flat().find((c) => c.intensity === 1)?.strong).toBe(true);
  });

  it("normalises intensity across filled cells", () => {
    const flat = grid.cells.flat().filter((c) => c.value !== null);
    expect(Math.min(...flat.map((c) => c.intensity))).toBe(0);
    expect(Math.max(...flat.map((c) => c.intensity))).toBe(1);
    expect(grid.cells[2][0].intensity).toBe(1); // opus max = 3.00 is the priciest
  });

  it("is empty with no models", () => {
    const g = effortModelGrid([]);
    expect(g.efforts).toEqual([]);
    expect(g.cells).toEqual([]);
  });
});

describe("effortGridNote", () => {
  it("compares models at High effort and appends the Max vs Low multiple", () => {
    const g = effortModelGrid([HAIKU, OPUS]);
    expect(effortGridNote(g, "7.4×")).toBe("For High-effort work, haiku-4-5 costs $0.16 per message vs $1.50 on opus-4-8. Max effort costs 7.4× Low.");
  });

  it("falls back to the row with the most models when High is not comparable", () => {
    const g = effortModelGrid([model("claude-opus-4-8", 10, 10, 0, [eff("low", 1, 5)]), model("claude-haiku-4-5", 5, 10, 0, [eff("low", 1, 10)])]);
    expect(effortGridNote(g, null)).toBe("For Low-effort work, haiku-4-5 costs $0.10 per message vs $0.20 on opus-4-8.");
  });

  it("says so when no two models overlap", () => {
    const g = effortModelGrid([model("claude-opus-4-8", 10, 10, 0, [eff("high", 1, 5)]), model("claude-haiku-4-5", 5, 10, 0, [eff("low", 1, 10)])]);
    expect(effortGridNote(g, null)).toContain("Not enough models");
  });
});
