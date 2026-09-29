import { describe, expect, it } from "vitest";
import { costOf, ratesFor } from "../pricing";
import { summarize, type UsageRecord } from "../usage";
import type { Effort } from "../effort";

const META = { builtAt: 0, parseMs: 0, cache: "warm" as const };
const MODEL = "claude-sonnet-4-6"; // $3 in / $15 out / $0.30 cache read / $3.75 cache write
const R = ratesFor(MODEL);

// Local-time timestamps, matching the server's local-day/hour convention.
const at = (y: number, m: number, d: number, h = 12, min = 0) => new Date(y, m - 1, d, h, min).getTime();
const dayStr = (y: number, m: number, d: number) => `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;

function rec(
  y: number,
  m: number,
  d: number,
  session: string,
  o: Partial<UsageRecord> & { h?: number; min?: number } = {},
): UsageRecord {
  const { h = 12, min = 0, ...rest } = o;
  const base = { input: 100, output: 50, cacheCreate: 200, cacheRead: 1000 };
  const u = { ...base, ...rest };
  return {
    ts: at(y, m, d, h, min),
    day: dayStr(y, m, d),
    project: "proj",
    model: MODEL,
    session,
    effort: "high" as Effort,
    ...u,
    cost:
      rest.cost ??
      costOf(MODEL, {
        input_tokens: u.input,
        output_tokens: u.output,
        cache_creation_input_tokens: u.cacheCreate,
        cache_read_input_tokens: u.cacheRead,
      }),
  };
}

const many = (n: number, f: (i: number) => UsageRecord) => Array.from({ length: n }, (_, i) => f(i));
const sortTs = (rs: UsageRecord[]) => rs.sort((a, b) => a.ts - b.ts);
const win = (d1: number, d2: number) => ({ from: at(2026, 1, d1, 0), to: new Date(2026, 0, d2, 23, 59, 59, 999).getTime() });
const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);

describe("summarize: turn position", () => {
  it("counts positions before the range filter", () => {
    // S1: 30 msgs on Jan 5 (before range), 30 more on Jan 10 (in range) -> positions 31..60.
    const records = sortTs([
      ...many(30, (i) => rec(2026, 1, 5, "S1", { min: i })),
      ...many(30, (i) => rec(2026, 1, 10, "S1", { min: i })),
    ]);
    const s = summarize(records, win(10, 12), META);
    const counts = s.turnBuckets.map((b) => b.messages);
    expect(counts).toEqual([0, 20, 10, 0, 0, 0]); // 31-50 -> 20, 51-60 -> 10
    expect(s.totals.messages).toBe(30);
  });

  it("uses the documented bucket boundaries", () => {
    const records = many(251, (i) => rec(2026, 1, 11, "B", { h: 0, min: 0, ts: at(2026, 1, 11, 0) + i * 1000 }));
    const s = summarize(records, win(10, 12), META);
    expect(s.turnBuckets.map((b) => b.label)).toEqual(["1–25", "26–50", "51–100", "101–150", "151–250", "251+"]);
    expect(s.turnBuckets.map((b) => b.messages)).toEqual([25, 25, 50, 50, 100, 1]);
  });

  it("counts effort-filtered-out records toward position", () => {
    const records = sortTs([
      ...many(30, (i) => rec(2026, 1, 10, "E", { effort: "low", min: i })),
      ...many(5, (i) => rec(2026, 1, 10, "E", { effort: "high", h: 13, min: i })),
    ]);
    const s = summarize(records, win(10, 10), META, { effort: "high" });
    expect(s.turnBuckets.map((b) => b.messages)).toEqual([0, 5, 0, 0, 0, 0]); // positions 31..35
  });
});

describe("summarize: previous window", () => {
  const records = sortTs([
    rec(2026, 1, 6, "P0"), // before prev window
    rec(2026, 1, 7, "P1", { h: 0, min: 0 }), // first ms of prev window (3-day window Jan 10-12 -> Jan 7-9)
    rec(2026, 1, 8, "P1"),
    rec(2026, 1, 9, "P2", { h: 23, min: 59 }),
    rec(2026, 1, 10, "C1"),
    rec(2026, 1, 12, "C2"),
  ]);

  it("folds the prior equal-length window into totals + byDay", () => {
    const s = summarize(records, win(10, 12), META);
    const prev = s.previous!;
    expect(prev.totals.messages).toBe(3);
    expect(prev.totals.sessions).toBe(2);
    expect(prev.totals.cost).toBeCloseTo(sum(records.slice(1, 4).map((r) => r.cost)));
    expect(prev.byDay.map((d) => d.day)).toEqual(["2026-01-07", "2026-01-08", "2026-01-09"]);
    expect(prev.to).toBe(s.from - 1);
    expect(s.totals.messages).toBe(2);
  });

  it("honours the effort filter", () => {
    const rs = sortTs([...records, rec(2026, 1, 8, "P1", { effort: "low", min: 5 })]);
    expect(summarize(rs, win(10, 12), META, { effort: "high" }).previous!.totals.messages).toBe(3);
    expect(summarize(rs, win(10, 12), META).previous!.totals.messages).toBe(4);
  });

  it("is null for an unbounded range", () => {
    expect(summarize(records, "all", META).previous).toBeNull();
  });
});

describe("summarize: planMonth", () => {
  const records = sortTs([
    rec(2025, 12, 31, "X"), // other month
    rec(2026, 1, 2, "A", { effort: "low" }),
    rec(2026, 1, 5, "A", { effort: "high" }),
    rec(2026, 1, 20, "B", { effort: "high" }),
    rec(2026, 2, 1, "C"), // other month
  ]);

  it("covers the calendar month of `to`, ignoring the selected range", () => {
    const s = summarize(records, win(10, 12), META); // range has no records at all
    expect(s.planMonth.month).toBe("2026-01");
    expect(s.planMonth.daysInMonth).toBe(31);
    expect(s.planMonth.byDay).toHaveLength(31);
    expect(sum(s.planMonth.byDay.map((d) => d.cost))).toBeCloseTo(sum(records.slice(1, 4).map((r) => r.cost)));
    expect(s.planMonth.byDay[4].day).toBe("2026-01-05");
    expect(s.totals.cost).toBe(0);
  });

  it("honours the effort filter", () => {
    const s = summarize(records, win(10, 12), META, { effort: "high" });
    expect(sum(s.planMonth.byDay.map((d) => d.cost))).toBeCloseTo(records[2].cost + records[3].cost);
    expect(s.planMonth.byDay[1].cost).toBe(0); // the "low" Jan 2 record
  });
});

describe("summarize: cost breakdowns", () => {
  const records = sortTs([
    rec(2026, 1, 10, "A", { h: 9 }),
    rec(2026, 1, 10, "A", { h: 9, min: 30, cacheRead: 5000 }),
    rec(2026, 1, 10, "B", { h: 17 }),
    rec(2026, 1, 11, "A", { h: 3 }),
  ]);
  const s = summarize(records, win(10, 11), META);

  it("tokenCost residual (cache write) makes the parts sum to total cost", () => {
    const t = s.tokenCost;
    expect(t.input + t.output + t.cacheRead + t.cacheWrite).toBeCloseTo(s.totals.cost, 10);
    expect(t.input).toBeCloseTo((300 * R.input) / 1e6);
    expect(t.cacheWrite).toBeCloseTo((600 * R.cacheWrite5m) / 1e6);
    for (const d of s.byDay) {
      const x = d.tokenCost!;
      expect(x.input + x.output + x.cacheRead + x.cacheWrite).toBeCloseTo(d.cost, 10);
    }
  });

  it("saved uses real rates", () => {
    const cacheRead = sum(records.map((r) => r.cacheRead));
    expect(s.totals.saved).toBeCloseTo((cacheRead * (R.input - R.cacheRead)) / 1e6);
    expect(s.byModel[0].saved).toBeCloseTo(s.totals.saved);
  });

  it("day hours (local) sum to day cost", () => {
    for (const d of s.byDay) {
      expect(d.hours).toHaveLength(24);
      expect(sum(d.hours!)).toBeCloseTo(d.cost, 10);
    }
    const d10 = s.byDay[0];
    expect(d10.hours![9]).toBeCloseTo(records[0].cost + records[1].cost);
    expect(d10.hours![17]).toBeCloseTo(records[2].cost);
    expect(d10.sessions).toBe(2);
    expect(s.byHour[9].cost).toBeCloseTo(d10.hours![9]);
  });

  it("topSessions per day: ordered by cost desc, limited to 5", () => {
    expect(s.byDay[0].topSessions!.map((x) => x.session)).toEqual(["A", "B"]);
    const rs = sortTs(many(8, (i) => rec(2026, 1, 10, `S${i}`, { output: 10 * (i + 1), min: i })));
    const top = summarize(rs, win(10, 10), META).byDay[0].topSessions!;
    expect(top).toHaveLength(5);
    expect(top.map((x) => x.session)).toEqual(["S7", "S6", "S5", "S4", "S3"]);
    expect(top[0].messages).toBe(1);
  });
});

describe("summarize: DST-straddling previous window", () => {
  it("uses whole local days (spring-forward Mar 8 2026 falls in the previous window)", () => {
    const records = sortTs([
      { ...rec(2026, 3, 6, "D", { h: 0, min: 30 }) }, // 00:30 EST on the first day of prev window
      rec(2026, 3, 8, "D", { h: 12 }),
      rec(2026, 3, 9, "D", { h: 12 }),
    ]);
    const s = summarize(records, { from: at(2026, 3, 9, 0), to: new Date(2026, 2, 11, 23, 59, 59, 999).getTime() }, META);
    // Window Mar 9-11 -> previous Mar 6-8. Subtracting 72h of ms would start at
    // Mar 6 01:00 and wrongly drop the 00:30 record.
    expect(s.previous!.from).toBe(at(2026, 3, 6, 0));
    expect(s.previous!.totals.messages).toBe(2);
  });
});

describe("summarize: token-type splits", () => {
  it("prices 1h cache writes via the residual and reports net savings", () => {
    const cost = costOf(MODEL, {
      input_tokens: 100,
      output_tokens: 50,
      cache_creation_input_tokens: 400,
      cache_read_input_tokens: 1000,
      cache_creation: { ephemeral_1h_input_tokens: 400 },
    });
    const r = rec(2026, 1, 10, "T", { cacheCreate: 400, cost });
    const s = summarize([r], win(10, 10), META);
    expect(s.tokenCost.cacheWrite).toBeCloseTo((400 * R.cacheWrite1h) / 1e6, 12);
    const gross = (1000 * (R.input - R.cacheRead)) / 1e6;
    const premium = (400 * (R.cacheWrite1h - R.input)) / 1e6;
    expect(s.totals.saved).toBeCloseTo(gross, 12);
    expect(s.cacheNetSaved).toBeCloseTo(gross - premium, 12);
  });

  it("unknown model has zero rates: nothing saved, no negative cacheWrite", () => {
    const r = rec(2026, 1, 10, "U", { model: "mystery-model", cost: 0 });
    const s = summarize([r], win(10, 10), META);
    expect(s.totals.saved).toBe(0);
    expect(s.tokenCost).toEqual({ input: 0, output: 0, cacheRead: 0, cacheWrite: 0 });
  });

  it("previous totals carry cacheNetSaved", () => {
    const s = summarize([rec(2026, 1, 8, "P")], win(10, 11), META);
    expect(s.previous!.cacheNetSaved).toBeGreaterThan(0);
  });
});

describe("summarize: subagent (sidechain) messages", () => {
  it("do not advance the main thread's position", () => {
    const records = sortTs([
      ...many(20, (i) => rec(2026, 1, 10, "M", { min: i })),
      ...many(20, (i) => rec(2026, 1, 10, "M", { agent: "agent-1", h: 13, min: i })),
      ...many(10, (i) => rec(2026, 1, 10, "M", { h: 14, min: i })), // main positions 21..30
    ]);
    const s = summarize(records, win(10, 10), META);
    // main: 1-25 -> 25 msgs, 26-50 -> 5; agent-1: positions 1..20 -> 20 msgs in the first bucket
    expect(s.turnBuckets.map((b) => b.messages)).toEqual([45, 5, 0, 0, 0, 0]);
  });
});
