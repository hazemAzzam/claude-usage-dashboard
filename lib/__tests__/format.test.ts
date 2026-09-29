import { describe, expect, it } from "vitest";
import { dayKeyOf, fmtDelta, fmtMultiple, fmtShare, fmtUSDShort, modelColor, shortModel } from "../format";

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
    expect(new Set(["opus", "sonnet", "haiku", "fable"].map((f) => modelColor(`claude-${f}-4`))).size).toBe(4);
  });
  it("gives unknown models a stable colour", () => {
    expect(modelColor("mystery-model")).toBe(modelColor("mystery-model"));
    expect(modelColor("mystery-model")).toMatch(/^#/);
  });
  it("shortModel strips the prefix and date", () => {
    expect(shortModel("claude-opus-4-8-20250101")).toBe("opus-4-8");
  });
});

describe("modelColor within a family", () => {
  it("gives different versions of one family different colours, deterministically", () => {
    const ids = ["claude-opus-4-1", "claude-opus-4-5", "claude-opus-4-8"];
    expect(new Set(ids.map(modelColor)).size).toBe(3);
    expect(modelColor("claude-opus-4-8-20250101")).toBe(modelColor("claude-opus-4-8"));
    expect(modelColor("claude-opus-4-8")).toBe(modelColor("claude-opus-4-8"));
  });
  it("keeps families apart", () => {
    expect(modelColor("claude-opus-4-8")).not.toBe(modelColor("claude-sonnet-4-8"));
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
