import { describe, expect, it } from "vitest";
import { dayKeyOf, fmtDelta, fmtMultiple, fmtShare, fmtUSDShort, modelColor,
  effortColor, modelPalette, shortModel } from "../format";

describe("fmtDelta", () => {
  it("carries the direction as an arrow, not just colour", () => {
    expect(fmtDelta(0.123)).toBe("▲ 12.3%");
    expect(fmtDelta(-0.04)).toBe("▼ 4.0%");
  });
  it("is n/a without a baseline and flat for ~0", () => {
    expect(fmtDelta(null)).toBe("n/a");
    expect(fmtDelta(0)).toBe("0.0%");
    expect(fmtDelta(0.00001)).toBe("0.0%");
  });
});

describe("fmtShare / fmtMultiple", () => {
  it("formats", () => {
    expect(fmtShare(0.625)).toBe("63%");
    expect(fmtShare(0.625, 1)).toBe("62.5%");
    expect(fmtMultiple(7.44)).toBe("7.4×");
  });
});

describe("modelColor / shortModel", () => {
  it("colours by family regardless of version or date suffix", () => {
    expect(modelColor("claude-opus-4-8-20250101")).toBe("oklch(var(--chart-1))");
    expect(modelColor("claude-opus-4-8-20250101")).toBe(modelColor("claude-opus-4-1"));
    expect(modelColor("claude-sonnet-4-5")).toBe("oklch(var(--chart-2))");
    expect(modelColor("claude-fable-1")).toBe("oklch(var(--chart-3))");
    expect(modelColor("claude-haiku-4-5")).toBe("oklch(var(--chart-4))");
  });
  it("gives unknown models the 'other' colour", () => {
    expect(modelColor("mystery-model")).toBe("oklch(var(--chart-5))");
  });
  it("shortModel strips the prefix and date", () => {
    expect(shortModel("claude-opus-4-8-20250101")).toBe("opus-4-8");
  });
});

describe("modelPalette", () => {
  const all = ["claude-opus-4-8", "claude-sonnet-4-5", "claude-haiku-4-5", "claude-opus-4-5"];
  it("fixes the colour by family and steps alpha for extra versions in input order", () => {
    const p = modelPalette(all);
    expect(all.map(p)).toEqual([
      "oklch(var(--chart-1))",
      "oklch(var(--chart-2))",
      "oklch(var(--chart-4))",
      "oklch(var(--chart-1) / 0.72)",
    ]);
    expect(p("claude-opus-4-8-20250101")).toBe(p("claude-opus-4-8"));
  });
  it("is independent of any per-view filtering (same input, same colours)", () => {
    expect(modelPalette(all)("claude-haiku-4-5")).toBe(modelPalette([...all])("claude-haiku-4-5"));
  });
  it("clamps the alpha step beyond four versions of a family", () => {
    const many = Array.from({ length: 6 }, (_, i) => `claude-opus-${i}`);
    const p = modelPalette(many);
    expect(p("claude-opus-3")).toBe("oklch(var(--chart-1) / 0.36)");
    expect(p("claude-opus-5")).toBe(p("claude-opus-3"));
  });
  it("falls back to the family colour for models outside the set", () => {
    expect(modelPalette([])("claude-opus-4-8")).toBe(modelColor("claude-opus-4-8"));
    expect(modelColor("mystery")).toBe("oklch(var(--chart-5))");
  });
});

describe("effortColor", () => {
  it("maps each level and 'all' onto its token", () => {
    expect(effortColor("low")).toBe("oklch(var(--effort-1))");
    expect(effortColor("max")).toBe("oklch(var(--effort-5))");
    expect(effortColor("weird")).toBe("oklch(var(--effort-unknown))");
    expect(effortColor(null)).toBe("oklch(var(--effort-all))");
  });
});

describe("fmtUSDShort", () => {
  it("compacts axis ticks", () => {
    expect(fmtUSDShort(0.5)).toBe("$0.50");
    expect(fmtUSDShort(0.001)).toBe("$0.001");
    expect(fmtUSDShort(12.4)).toBe("$12");
    expect(fmtUSDShort(1500)).toBe("$1.5K");
    expect(fmtUSDShort(2000)).toBe("$2K");
    expect(fmtUSDShort(0)).toBe("$0.00");
  });
});

describe("dayKeyOf", () => {
  it("is the local calendar day", () => {
    expect(dayKeyOf(new Date(2026, 8, 5, 23, 59).getTime())).toBe("2026-09-05");
  });
});
