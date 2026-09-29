import { describe, expect, it } from "vitest";
import { derivePatternStats, deriveHeatmapModel, hasHeatmapData, heatmapMarginals } from "../use-patterns-view";

// heatmap[weekday 0..6][hour 0..23]
function grid(cells: Array<[number, number, number]>): number[][] {
  const g = Array.from({ length: 7 }, () => Array<number>(24).fill(0));
  for (const [wd, h, c] of cells) g[wd][h] = c;
  return g;
}
const G = grid([
  [1, 10, 30], // Mon 10:00
  [1, 14, 50], // Mon 14:00
  [3, 14, 20], // Wed 14:00
  [0, 9, 0.5], // Sun 09:00 (sub-1% of cost)
]);

describe("heatmapMarginals", () => {
  it("sums weekday rows and hour columns", () => {
    const m = heatmapMarginals(G);
    expect(m.rowTotals).toEqual([0.5, 80, 0, 20, 0, 0, 0]);
    expect(m.colTotals[14]).toBe(70);
    expect(m.colTotals[10]).toBe(30);
    expect(m.total).toBeCloseTo(100.5);
    expect(m.maxCell).toBe(50);
  });
  it("finds the peak weekday and hour", () => {
    const m = heatmapMarginals(G);
    expect(m.peakWeekday).toBe(1);
    expect(m.peakHour).toBe(14);
  });
  it("is all zeros for an empty grid", () => {
    const m = heatmapMarginals(grid([]));
    expect(m.total).toBe(0);
    expect(m.maxCell).toBe(0);
  });
});

describe("derivePatternStats", () => {
  it("returns the four stats", () => {
    const s = derivePatternStats(G);
    expect(s.map((x) => x.label)).toEqual(["Peak hour", "Peak day", "Busiest hour share", "Active hours"]);
    expect(s[0].value).toBe("14:00–15:00");
    expect(s[0].sub).toBe("$70.00 in range");
    expect(s[1].value).toBe("Monday");
    expect(s[2].value).toBe("69.7%"); // 70 / 100.5
    expect(s[3].value).toBe("2 / 24"); // the 09:00 cell is under 1% of cost
  });
});

describe("deriveHeatmapModel", () => {
  const m = deriveHeatmapModel(G);
  it("orders rows Monday-first with 24 cells each", () => {
    expect(m.rows.map((r) => r.label)).toEqual(["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]);
    expect(m.rows.every((r) => r.cells.length === 24)).toBe(true);
  });
  it("scales cell alpha to the busiest cell and leaves empty cells at 0", () => {
    expect(m.rows[0].cells[14].alpha).toBeCloseTo(1);
    expect(m.rows[0].cells[10].alpha).toBeCloseTo(0.12 + 0.6 * 0.88);
    expect(m.rows[0].cells[0].alpha).toBe(0);
  });
  it("adds weekday totals (right) and hourly totals (below)", () => {
    expect(m.rows[0].totalLabel).toBe("$80.00");
    expect(m.rows[0].totalPct).toBe(100);
    expect(m.rows[2].totalPct).toBe(25);
    expect(m.cols[14].heightPct).toBe(100);
    expect(m.cols[10].heightPct).toBeCloseTo((30 / 70) * 100);
    expect(m.maxLabel).toBe("$50.00");
  });
  it("labels every third hour", () => {
    expect(m.hourLabels.filter((h) => h.label).map((h) => h.hour)).toEqual([0, 3, 6, 9, 12, 15, 18, 21]);
  });
});

describe("heatmap accessibility table and empty state", () => {
  const m = deriveHeatmapModel(G);
  it("mirrors the grid as a table with totals", () => {
    expect(m.table.head).toHaveLength(26); // Day + 24 hours + Total
    expect(m.table.rows.map((r) => r.label)[0]).toBe("Monday");
    expect(m.table.rows[0].values[14]).toBe("$50.00");
    expect(m.table.rows[0].total).toBe("$80.00");
    expect(m.table.footer.values[14]).toBe("$70.00");
    expect(m.table.footer.total).toBe("$100.50");
  });
  it("an all-zero grid has no data", () => {
    expect(hasHeatmapData(grid([]))).toBe(false);
    expect(hasHeatmapData(G)).toBe(true);
  });
});
