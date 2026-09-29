import { describe, expect, it } from "vitest";
import { modelColor } from "../../lib/format";
import type { DayBucket, ProjectRow, SessionRow, Summary } from "../../lib/usage";
import { deriveDailyRows, deriveDailyStats, rangeDayCount, tokensPerDollar, weekdayOf, weekendNote } from "../use-daily-view";
import { deriveProjectDetail, deriveProjectList, filterProjects, resolveSelected } from "../use-projects-view";

const B = { cost: 0, input: 0, output: 0, cacheCreate: 0, cacheRead: 0, messages: 0, saved: 0 };
const day = (d: string, cost: number, extra: Partial<DayBucket> = {}): DayBucket => ({ day: d, ...B, cost, messages: 10, ...extra }) as DayBucket;

describe("daily", () => {
  it("weekdayOf reads a local date key", () => {
    expect(weekdayOf("2026-09-29")).toBe(2); // Tuesday
    expect(weekdayOf("2026-09-27")).toBe(0);
  });

  it("tokensPerDollar counts every token type", () => {
    expect(tokensPerDollar({ input: 100, output: 100, cacheCreate: 200, cacheRead: 600, cost: 2 })).toBe(500);
    expect(tokensPerDollar({ input: 1, output: 1, cacheCreate: 1, cacheRead: 1, cost: 0 })).toBe(0);
  });

  it("rangeDayCount is null for unbounded ranges", () => {
    expect(rangeDayCount(0, 123)).toBeNull();
    const from = new Date(2026, 8, 1).getTime();
    const to = new Date(2026, 8, 29, 23, 59, 59, 999).getTime();
    expect(rangeDayCount(from, to)).toBe(29);
  });

  it("weekendNote compares weekend and weekday averages", () => {
    // Tue Sep 29 = $100, Sun Sep 27 = $40
    expect(weekendNote([day("2026-09-27", 40), day("2026-09-29", 100)])).toBe("weekend days average 40% of weekday cost");
    expect(weekendNote([day("2026-09-29", 100)])).toBe("active days in range");
  });

  it("deriveDailyRows scales bars to the peak day and splits by model", () => {
    const rows = deriveDailyRows(
      [
        day("2026-09-29", 100, { models: [{ model: "claude-opus-4-8", ...B, cost: 75, messages: 5 }, { model: "claude-haiku-4-5", ...B, cost: 25, messages: 5 }] as DayBucket["models"], input: 100, cacheRead: 900 }),
        day("2026-09-28", 50),
      ],
      100,
    );
    expect(rows[0].barWidthPct).toBe(100);
    expect(rows[1].barWidthPct).toBe(50);
    expect(rows[0].dow).toBe("Tue");
    expect(rows[0].parts.map((p) => p.pctOfDay)).toEqual([75, 25]);
    expect(rows[0].parts[0].color).toBe(modelColor("claude-opus-4-8"));
    expect(rows[0].cacheShareLabel).toBe("90%");
    expect(rows[1].parts).toEqual([]);
  });

  it("deriveDailyStats builds the four header stats", () => {
    const s = {
      from: new Date(2026, 8, 1).getTime(),
      to: new Date(2026, 8, 29, 23, 59, 59, 999).getTime(),
      byDay: [day("2026-09-27", 40), day("2026-09-29", 100)],
      totals: { ...B, cost: 140, output: 100, cacheRead: 1400, sessions: 2 },
    } as unknown as Summary;
    const st = deriveDailyStats(s);
    expect(st.map((x) => x.label)).toEqual(["Active days", "Avg cost / day", "Peak day", "Tokens per $"]);
    expect(st[0].value).toBe("2 / 29");
    expect(st[1].value).toBe("$70.00");
    expect(st[2].value).toBe("Sep 29");
    expect(st[2].sub).toBe("$100.00 · Tue");
    expect(st[3].value).toBe("11"); // (100 + 1400) tokens / $140
  });
});

describe("projects", () => {
  const proj = (name: string, cost: number, sessions = 2): ProjectRow =>
    ({
      project: name,
      sessions,
      ...B,
      cost,
      messages: 40,
      models: [
        { model: "claude-opus-4-8", ...B, cost: cost * 0.8, messages: 30 },
        { model: "claude-haiku-4-5", ...B, cost: cost * 0.2, messages: 10 },
      ],
      byDay: [
        day("2026-09-01", cost / 2, { models: [{ model: "claude-opus-4-8", cost: cost / 2 }] as unknown as DayBucket["models"] }),
        day("2026-09-02", cost / 2, {
          models: [
            { model: "claude-opus-4-8", cost: cost * 0.3 },
            { model: "claude-haiku-4-5", cost: cost * 0.2 },
          ] as unknown as DayBucket["models"],
        }),
      ],
    }) as ProjectRow;

  it("filterProjects matches case-insensitively and passes everything for a blank query", () => {
    const ps = [proj("Alpha", 10), proj("beta", 5)];
    expect(filterProjects(ps, "ALP").map((p) => p.project)).toEqual(["Alpha"]);
    expect(filterProjects(ps, "  ")).toHaveLength(2);
  });

  it("deriveProjectList scales bars to the priciest project", () => {
    const list = deriveProjectList([proj("Alpha", 100), proj("beta", 25)], 100);
    expect(list.map((p) => p.widthPct)).toEqual([100, 25]);
    expect(list[0].costLabel).toBe("$100.00");
    expect(list[0].sessionsLabel).toBe("2 sessions");
  });

  it("deriveProjectDetail builds stats, per-model stacked days and recent sessions", () => {
    const sessions = [1, 2, 3].map((n) => ({ session: `session-${n}xxxxxxxx`, project: "Alpha", day: "2026-09-01", lastTs: n, model: "claude-opus-4-8", messages: n, input: 0, output: 0, cacheCreate: 0, cacheRead: 0, cost: n }) as unknown as SessionRow);
    const d = deriveProjectDetail(proj("Alpha", 100, 3), 400, [...sessions, { ...sessions[0], project: "other", session: "zzz" }], null);
    expect(d.shareLabel).toBe("25.0% of total cost");
    expect(d.stats.map((s) => s.value)).toEqual(["$100.00", "3", "40", "$33.3333"]);
    expect(d.legend.map((l) => l.label)).toEqual(["opus-4-8", "haiku-4-5"]);
    expect(d.days[0]).toMatchObject({ day: "2026-09-01", "claude-opus-4-8": 50, "claude-haiku-4-5": 0 });
    expect(d.days[1]["claude-haiku-4-5"]).toBe(20);
    expect(d.byModel.map((m) => m.widthPct)).toEqual([100, 25]);
    expect(d.sessions.map((s) => s.messages)).toEqual([3, 2, 1]); // most recent first, other project excluded
    expect(d.sessions[0].id).toBe("session-");
    expect(d.sessionsTitle).toBe("Latest sessions (3)");
  });

  it("fills idle days in the chart across the span", () => {
    const d = deriveProjectDetail(proj("Alpha", 100), 100, [], { from: "2026-08-31", to: "2026-09-04" });
    expect(d.days.map((r) => r.day)).toEqual(["2026-08-31", "2026-09-01", "2026-09-02", "2026-09-03", "2026-09-04"]);
    expect(d.days[0]["claude-opus-4-8"]).toBe(0);
    expect(d.days[1]["claude-opus-4-8"]).toBe(50);
    expect(d.days[4]["claude-haiku-4-5"]).toBe(0);
  });

  it("resolveSelected keeps a visible pick and otherwise moves to the first visible project", () => {
    const ps = [proj("Alpha", 10), proj("beta", 5)];
    expect(resolveSelected("beta", ps)).toBe("beta");
    expect(resolveSelected("gone", ps)).toBe("Alpha");
    expect(resolveSelected("Alpha", [])).toBe("");
  });

  it("titles a truncated session list", () => {
    const many = Array.from({ length: 20 }, (_, i) => ({ session: `s${i}`, project: "Alpha", day: "d", lastTs: i, model: "m", messages: 1, cost: 1 }) as unknown as SessionRow);
    expect(deriveProjectDetail(proj("Alpha", 10, 20), 10, many, null).sessionsTitle).toBe("Latest sessions (15 of 20)");
  });
});
