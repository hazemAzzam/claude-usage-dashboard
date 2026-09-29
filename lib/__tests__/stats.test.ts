import { describe, expect, it } from "vitest";
import { cumulative, linearProjection, median, movingAverage, pctDelta, shareOf } from "../stats";

describe("pctDelta", () => {
  it("computes relative change", () => {
    expect(pctDelta(150, 100)).toBeCloseTo(0.5);
    expect(pctDelta(50, 100)).toBeCloseTo(-0.5);
  });
  it("is null without a baseline", () => {
    expect(pctDelta(5, 0)).toBeNull();
    expect(pctDelta(5, null)).toBeNull();
    expect(pctDelta(5, undefined)).toBeNull();
  });
});

describe("movingAverage", () => {
  it("uses partial windows for the first n-1 points", () => {
    expect(movingAverage([2, 4, 6, 8], 3)).toEqual([2, 3, 4, 6]);
  });
  it("defaults to a 7-point window and keeps length", () => {
    const out = movingAverage(Array(10).fill(7));
    expect(out).toHaveLength(10);
    expect(out.every((v) => v === 7)).toBe(true);
  });
  it("guards n <= 0 and fractions", () => {
    expect(movingAverage([1, 2, 3], 0)).toEqual([1, 2, 3]);
    expect(movingAverage([1, 2, 3], -2)).toEqual([1, 2, 3]);
    expect(movingAverage([2, 4, 6], 2.9)).toEqual([2, 3, 5]);
  });
  it("handles empty input", () => {
    expect(movingAverage([])).toEqual([]);
  });
});

describe("cumulative", () => {
  it("running total", () => expect(cumulative([1, 2, 3])).toEqual([1, 3, 6]));
  it("empty", () => expect(cumulative([])).toEqual([]));
});

describe("median", () => {
  it("odd / even / empty / unsorted", () => {
    expect(median([3, 1, 2])).toBe(2);
    expect(median([4, 1, 3, 2])).toBe(2.5);
    expect(median([])).toBe(0);
  });
  it("does not mutate input", () => {
    const xs = [3, 1, 2];
    median(xs);
    expect(xs).toEqual([3, 1, 2]);
  });
});

describe("shareOf", () => {
  it("ratio, and 0 when total is 0", () => {
    expect(shareOf(1, 4)).toBe(0.25);
    expect(shareOf(3, 0)).toBe(0);
  });
});

describe("linearProjection", () => {
  it("extrapolates the daily average to month end", () => {
    expect(linearProjection([10, 20, 30], 3, 30)).toBe(300);
  });
  it("uses the value at daysElapsed, ignoring later entries", () => {
    expect(linearProjection([10, 20, 30, 999], 3, 30)).toBe(300);
  });
  it("counts trailing empty days as elapsed when the series is short", () => {
    expect(linearProjection([10, 20], 4, 30)).toBeCloseTo(150); // 20 over 4 days
  });
  it("0 for no data or no elapsed days", () => {
    expect(linearProjection([], 3, 30)).toBe(0);
    expect(linearProjection([5], 0, 30)).toBe(0);
  });
});
