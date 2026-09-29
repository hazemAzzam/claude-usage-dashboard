import "server-only";
import { compareEffort, type Effort } from "./effort";
import { ratesFor, type Rates } from "./pricing";
import { getCachedRecords, type SweepStats } from "./usage-cache";

export { projectsDir } from "./usage-cache";

// One assistant message, reduced to just what the dashboard needs. Lives
// here (not in lib/usage-cache.ts) since this is the aggregation module's
// own output shape; lib/usage-cache.ts imports it back via `import type`,
// which is fully erased at compile time and so never creates a runtime
// circular dependency between the two modules.
export interface UsageRecord {
  ts: number; // epoch ms
  day: string; // YYYY-MM-DD (local)
  project: string; // display label (basename of cwd, or log folder)
  model: string;
  session: string;
  cost: number;
  input: number;
  output: number;
  cacheCreate: number;
  cacheRead: number;
  effort: Effort;
  // Subagent/sidechain id; absent or "" for the main thread. Only used to key
  // the message-position counter (see summarize()).
  agent?: string;
}

// Records now come from the persistent parse cache (lib/usage-cache.ts)
// instead of a full reparse every call. `force` triggers an incremental
// cache load bypassing its short in-memory TTL (the dashboard's Refresh
// button); `rebuild` discards the persisted cache index and does a full
// reparse of every file (the API's `?rebuild=1`). See lib/usage-cache.ts for
// the load/merge/persist orchestration and CLAUDE.md for the invariants it
// preserves.
export async function getRecords(
  force = false,
  rebuild = false,
): Promise<{ records: UsageRecord[]; builtAt: number; ms: number; stats: SweepStats }> {
  return getCachedRecords({ force, rebuild });
}

// How much work the load behind this response did, derived from the sweep
// stats: "warm" = nothing needed parsing (in-memory hit or unchanged files),
// "cold" = some files were new/grown/changed and only those were parsed,
// "rebuilt" = every file was reparsed (`?rebuild=1`, first run, cache
// version bump). `ms === 0` marks a TTL hit in getCachedRecords, whose
// `stats` are the previous load's and would otherwise misreport.
export type CacheState = "warm" | "cold" | "rebuilt";

export function cacheState(stats: SweepStats, ms: number): CacheState {
  if (ms === 0 || (stats.reparsed === 0 && stats.appended === 0)) return "warm";
  return stats.filesTotal > 0 && stats.reparsed >= stats.filesTotal ? "rebuilt" : "cold";
}

// ---- aggregation ----
export type Range = "7d" | "30d" | "90d" | "all";

function cutoff(range: Range, now: number): number {
  const days = range === "7d" ? 7 : range === "30d" ? 30 : range === "90d" ? 90 : Infinity;
  return days === Infinity ? 0 : now - days * 86_400_000;
}

// `saved` is GROSS cache-read savings: what the cache-read tokens would have
// cost at the full input rate minus what they cost at the cache-read rate
// (API-equivalent $). It ignores the premium paid to write the cache; see
// `Summary.cacheNetSaved` for the net figure.
const empty = () => ({ cost: 0, input: 0, output: 0, cacheCreate: 0, cacheRead: 0, messages: 0, saved: 0 });
export type Bucket = ReturnType<typeof empty>;

// ratesFor() scans a prefix table; memoise per model id for the hot loop.
const rateMemo = new Map<string, Rates>();
function rates(model: string): Rates {
  let r = rateMemo.get(model);
  if (!r) rateMemo.set(model, (r = ratesFor(model)));
  return r;
}

// Per-record price parts, computed ONCE per record and shared by every bucket
// it is folded into. `write` is the cache-write cost taken as the residual of
// r.cost (exact, including the 5m/1h TTL split that raw counts can't recover).
interface Priced {
  inC: number;
  outC: number;
  crC: number;
  write: number;
  saved: number; // gross cache-read savings
  net: number; // saved minus the cache-write premium over plain input
}
const NO_PRICE: Priced = { inC: 0, outC: 0, crC: 0, write: 0, saved: 0, net: 0 };
function priced(r: UsageRecord): Priced {
  const x = rates(r.model);
  const inC = (r.input * x.input) / 1e6;
  const outC = (r.output * x.output) / 1e6;
  const crC = (r.cacheRead * x.cacheRead) / 1e6;
  const write = r.cost - inC - outC - crC;
  const saved = (r.cacheRead * (x.input - x.cacheRead)) / 1e6;
  const premium = write - (r.cacheCreate * x.input) / 1e6;
  return { inC, outC, crC, write, saved, net: saved - premium };
}

// Cost split by token type. cacheWrite is the residual (cost minus the other
// three), so it absorbs the 5m/1h TTL pricing that raw counts can't recover.
export type TokenCost = { input: number; output: number; cacheWrite: number; cacheRead: number };
const emptyTok = () => ({ input: 0, output: 0, cacheRead: 0 });
type TokAcc = ReturnType<typeof emptyTok>;
function addTok(t: TokAcc, p: Priced) {
  t.input += p.inC;
  t.output += p.outC;
  t.cacheRead += p.crC;
}
function finishTok(t: TokAcc, cost: number): TokenCost {
  const cacheWrite = cost - t.input - t.output - t.cacheRead;
  // Clamp float noise (and unknown-model records priced 0) to 0.
  return { ...t, cacheWrite: cacheWrite < 1e-9 ? 0 : cacheWrite };
}

// Message position within a session, bucketed. hi === null is open-ended.
export const TURN_BUCKETS: ReadonlyArray<{ label: string; lo: number; hi: number | null }> = [
  { label: "1–25", lo: 1, hi: 25 },
  { label: "26–50", lo: 26, hi: 50 },
  { label: "51–100", lo: 51, hi: 100 },
  { label: "101–150", lo: 101, hi: 150 },
  { label: "151–250", lo: 151, hi: 250 },
  { label: "251+", lo: 251, hi: null },
];
function turnBucketIndex(pos: number): number {
  for (let i = 0; i < TURN_BUCKETS.length; i++) {
    const hi = TURN_BUCKETS[i].hi;
    if (hi === null || pos <= hi) return i;
  }
  return TURN_BUCKETS.length - 1;
}
export type TurnBucket = { label: string; lo: number; hi: number | null } & Bucket;

// Slim per-model cost used by the project day chart (no token counts needed).
export type DayModelCost = { model: string; cost: number };

export type DaySession = { session: string; project: string; cost: number; messages: number };

// Totals for the equal-length window immediately before the selected one.
export interface PeriodTotals {
  from: number;
  to: number;
  // true when the selected window ends in the future: the previous window was
  // trimmed to the same elapsed length so a partial period isn't compared with
  // a complete one.
  partial: boolean;
  totals: Bucket & { sessions: number };
  cacheNetSaved: number;
  byDay: Array<{ day: string; cost: number }>;
}

function add(b: Bucket, r: UsageRecord, p: Priced) {
  b.saved += p.saved;
  b.cost += r.cost;
  b.input += r.input;
  b.output += r.output;
  b.cacheCreate += r.cacheCreate;
  b.cacheRead += r.cacheRead;
  b.messages += 1;
}

export type EffortBucket = { effort: Effort } & Bucket;

// `efforts` is the per-effort split of this model (sorted by compareEffort);
// present when the model has more than one effort level in the window, drives
// the "Efficiency by model" table's expandable rows.
export type ModelBucket = { model: string; efforts?: EffortBucket[] } & Bucket;
// `models` is the per-model split of this day (cost desc); present on the
// top-level `byDay` (drives the daily table's expandable rows). Each project's
// `byDay` carries a slimmer `models: {model, cost}[]` instead (see ProjectRow).
// The optional extras are only set on the top-level `byDay`: `hours` is cost
// per LOCAL hour 0..23 (same convention as byHour/heatmap), `topSessions` the
// day's 5 costliest sessions.
export type DayBucket = {
  day: string;
  models?: ModelBucket[];
  sessions?: number;
  hours?: number[];
  tokenCost?: TokenCost;
  topSessions?: DaySession[];
} & Bucket;

// One row per day with a cost column per model (model name -> cost). Used for
// the multi-line "cost over time, split by model" chart.
export interface DayModelRow {
  day: string;
  [model: string]: number | string;
}

export interface SessionRow {
  session: string;
  project: string;
  day: string; // last day seen
  firstTs: number;
  lastTs: number;
  model: string; // primary model (highest cost)
  models: string[]; // all models used, by cost desc
  modelBreakdown: ModelBucket[]; // per-model msgs/tokens/cost, cost desc
  cost: number;
  messages: number;
  input: number;
  output: number;
  cacheCreate: number;
  cacheRead: number;
}

export type ProjectRow = {
  project: string;
  sessions: number;
  models: ModelBucket[];
  byDay: Array<{ day: string; models: DayModelCost[] } & Bucket>;
} & Bucket;

export interface Summary {
  from: number; // window start (epoch ms)
  to: number; // window end (epoch ms)
  builtAt: number;
  parseMs: number;
  cache: CacheState;
  generatedAt: number;
  totals: Bucket & { sessions: number };
  // Gross `saved` minus the cache-write premium over plain input (range total).
  cacheNetSaved: number;
  byDay: DayBucket[];
  byProject: ProjectRow[];
  byModel: ModelBucket[];
  byEffort: EffortBucket[];
  availableEfforts: Effort[]; // effort levels present in the date window, before the effort filter
  effort: Effort | null; // the effort filter that was applied (echo)
  topSessions: Array<{ session: string; project: string; day: string; cost: number; messages: number }>;
  byDayModel: DayModelRow[];
  allSessions: SessionRow[];
  byHour: Array<{ hour: number } & Bucket>; // 0..23
  byWeekday: Array<{ weekday: number } & Bucket>; // 0=Sun..6=Sat
  heatmap: number[][]; // [weekday 0..6][hour 0..23] -> cost
  turnBuckets: TurnBucket[]; // in-range cost by message position within its session
  tokenCost: TokenCost; // in-range cost split by token type
  previous: PeriodTotals | null; // prior equal-length window; null for unbounded ("all") ranges
  // The CURRENT calendar month (containing generatedAt), ALL efforts, NOT
  // range- or effort-filtered: the plan-value card is always "this month".
  // byDay is dense: one cost per day 1..daysInMonth (0 where no usage).
  planMonth: { month: string; daysInMonth: number; byDay: Array<{ day: string; cost: number }> };
}

// An explicit date window (epoch ms). `summarize` also accepts a preset Range
// (used by lib/context.ts); the dashboard passes an explicit window.
export type DateWindow = { from: number; to: number };

export function summarize(
  records: UsageRecord[],
  sel: Range | DateWindow,
  meta: { builtAt: number; parseMs: number; cache: CacheState },
  opts?: { effort?: Effort | null; now?: number },
): Summary {
  const now = opts?.now ?? Date.now();
  const { from, to } =
    typeof sel === "object" ? sel : { from: cutoff(sel, now), to: now };
  const effortFilter = opts?.effort ?? null;

  const totals = { ...empty(), sessions: 0 };
  const byDay = new Map<string, Bucket>();
  const byModel = new Map<string, Bucket>();
  const byEffort = new Map<Effort, Bucket>();
  const modelEffort = new Map<string, Map<Effort, Bucket>>(); // model -> (effort -> bucket)
  const dayModel = new Map<string, Map<string, Bucket>>(); // day -> (model -> bucket)
  const byHour = Array.from({ length: 24 }, () => empty());
  const byWeekday = Array.from({ length: 7 }, () => empty());
  const heatmap = Array.from({ length: 7 }, () => Array<number>(24).fill(0));
  const availableEfforts = new Set<Effort>();
  const turns = TURN_BUCKETS.map(() => empty());
  const tokTotal = emptyTok();
  const dayHours = new Map<string, number[]>();
  const dayTok = new Map<string, TokAcc>();
  const daySessions = new Map<string, Map<string, DaySession>>();

  // Message position counter. `records` arrive globally ts-sorted from
  // buildRecords, so counting every record (before any window/effort filter)
  // gives each message its true position in the session's whole history.
  // Keyed by session + agent: subagent (sidechain) transcripts carry the parent
  // sessionId but have their own conversation, so they must not advance the
  // main thread's position.
  const sessionPos = new Map<string, number>();

  // Previous window: same length, ending where the selected one starts. Only
  // meaningful when the selection is bounded (from > 0).
  const hasPrev = from > 0;
  // Whole LOCAL calendar days, so a DST change inside the window can't shift
  // the boundary by an hour (a ms subtraction would).
  const nDays = Math.round((to - from + 1) / 86_400_000);
  const fd = new Date(from);
  const prevFrom = new Date(
    fd.getFullYear(), fd.getMonth(), fd.getDate() - nDays,
    fd.getHours(), fd.getMinutes(), fd.getSeconds(), fd.getMilliseconds(),
  ).getTime();
  const prevTotals = { ...empty(), sessions: 0 };
  let netSaved = 0;
  let prevNetSaved = 0;
  const prevSessions = new Set<string>();
  const prevByDay = new Map<string, number>();

  // Trim the previous window when the selection runs into the future.
  const partial = hasPrev && to > now;
  const prevEnd = partial ? prevFrom + Math.max(0, now - from) + 1 : from; // exclusive

  // Plan month: the CURRENT calendar month (containing `now`, local time like
  // r.day), all efforts, independent of the selected range.
  const nowDate = new Date(now);
  const pmYear = nowDate.getFullYear();
  const pmMonth = nowDate.getMonth();
  const monthKey = `${pmYear}-${String(pmMonth + 1).padStart(2, "0")}`;
  const daysInMonth = new Date(pmYear, pmMonth + 1, 0).getDate();
  const planDays = Array<number>(daysInMonth).fill(0);

  const sessions = new Map<
    string,
    { project: string; day: string; firstTs: number; lastTs: number; bucket: Bucket; models: Map<string, Bucket> }
  >();
  const projects = new Map<
    string,
    {
      bucket: Bucket;
      sessions: Set<string>;
      models: Map<string, Bucket>;
      byDay: Map<string, Bucket>;
      dayModels: Map<string, Map<string, number>>; // day -> model -> cost (project detail chart)
    }
  >();

  for (const r of records) {
    const posKey = r.agent ? `${r.session}\0${r.agent}` : r.session;
    const pos = (sessionPos.get(posKey) ?? 0) + 1;
    sessionPos.set(posKey, pos);
    const effortOk = !effortFilter || r.effort === effortFilter;
    const inRange = r.ts >= from && r.ts <= to;
    const inPrev = hasPrev && r.ts >= prevFrom && r.ts < prevEnd;
    const px = effortOk && (inRange || inPrev) ? priced(r) : NO_PRICE;

    if (effortOk) {
      if (inPrev) {
        add(prevTotals, r, px);
        prevNetSaved += px.net;
        prevSessions.add(r.session);
        prevByDay.set(r.day, (prevByDay.get(r.day) ?? 0) + r.cost);
      }
    }
    if (r.day.startsWith(monthKey)) planDays[Number(r.day.slice(8, 10)) - 1] += r.cost;

    if (!inRange) continue;

    // Collect the available-effort set from everything in the date window,
    // BEFORE the effort filter narrows what actually gets aggregated — so the
    // filter chip row always reflects what's selectable for this window.
    availableEfforts.add(r.effort);
    if (!effortOk) continue;

    add(totals, r, px);
    netSaved += px.net;
    add(turns[turnBucketIndex(pos)], r, px);
    addTok(tokTotal, px);
    const dt = new Date(r.ts);
    const hr = dt.getHours();
    const wd = dt.getDay();

    let d = byDay.get(r.day);
    if (!d) byDay.set(r.day, (d = empty()));
    add(d, r, px);

    let dh = dayHours.get(r.day);
    if (!dh) dayHours.set(r.day, (dh = Array<number>(24).fill(0)));
    dh[hr] += r.cost;
    let dtk = dayTok.get(r.day);
    if (!dtk) dayTok.set(r.day, (dtk = emptyTok()));
    addTok(dtk, px);
    let ds = daySessions.get(r.day);
    if (!ds) daySessions.set(r.day, (ds = new Map()));
    let dss = ds.get(r.session);
    if (!dss) ds.set(r.session, (dss = { session: r.session, project: r.project, cost: 0, messages: 0 }));
    dss.cost += r.cost;
    dss.messages += 1;

    let m = byModel.get(r.model);
    if (!m) byModel.set(r.model, (m = empty()));
    add(m, r, px);

    let me = modelEffort.get(r.model);
    if (!me) modelEffort.set(r.model, (me = new Map()));
    let meb = me.get(r.effort);
    if (!meb) me.set(r.effort, (meb = empty()));
    add(meb, r, px);

    let eb = byEffort.get(r.effort);
    if (!eb) byEffort.set(r.effort, (eb = empty()));
    add(eb, r, px);

    let dm = dayModel.get(r.day);
    if (!dm) dayModel.set(r.day, (dm = new Map()));
    let dmb = dm.get(r.model);
    if (!dmb) dm.set(r.model, (dmb = empty()));
    add(dmb, r, px);

    add(byHour[hr], r, px);
    add(byWeekday[wd], r, px);
    heatmap[wd][hr] += r.cost;

    let s = sessions.get(r.session);
    if (!s)
      sessions.set(
        r.session,
        (s = { project: r.project, day: r.day, firstTs: r.ts, lastTs: r.ts, bucket: empty(), models: new Map() }),
      );
    add(s.bucket, r, px);
    s.day = r.day;
    if (r.ts < s.firstTs) s.firstTs = r.ts;
    if (r.ts > s.lastTs) s.lastTs = r.ts;
    let sm = s.models.get(r.model);
    if (!sm) s.models.set(r.model, (sm = empty()));
    add(sm, r, px);

    let p = projects.get(r.project);
    if (!p) projects.set(r.project, (p = { bucket: empty(), sessions: new Set(), models: new Map(), byDay: new Map(), dayModels: new Map() }));
    add(p.bucket, r, px);
    p.sessions.add(r.session);
    let pm = p.models.get(r.model);
    if (!pm) p.models.set(r.model, (pm = empty()));
    add(pm, r, px);
    let pd = p.byDay.get(r.day);
    if (!pd) p.byDay.set(r.day, (pd = empty()));
    add(pd, r, px);
    let pdm = p.dayModels.get(r.day);
    if (!pdm) p.dayModels.set(r.day, (pdm = new Map()));
    pdm.set(r.model, (pdm.get(r.model) ?? 0) + r.cost);
  }

  totals.sessions = sessions.size;
  prevTotals.sessions = prevSessions.size;

  const allSessions: SessionRow[] = [...sessions.entries()]
    .map(([session, s]) => {
      const modelBreakdown = [...s.models.entries()]
        .map(([model, b]) => ({ model, ...b }))
        .sort((a, b) => b.cost - a.cost);
      const models = modelBreakdown.map((m) => m.model);
      return {
        session,
        project: s.project,
        day: s.day,
        firstTs: s.firstTs,
        lastTs: s.lastTs,
        model: models[0] ?? "unknown",
        models,
        modelBreakdown,
        cost: s.bucket.cost,
        messages: s.bucket.messages,
        input: s.bucket.input,
        output: s.bucket.output,
        cacheCreate: s.bucket.cacheCreate,
        cacheRead: s.bucket.cacheRead,
      };
    })
    .sort((a, b) => b.cost - a.cost);

  const byProject: ProjectRow[] = [...projects.entries()]
    .map(([project, p]) => ({
      project,
      sessions: p.sessions.size,
      ...p.bucket,
      models: [...p.models.entries()].map(([model, b]) => ({ model, ...b })).sort((a, b) => b.cost - a.cost),
      byDay: [...p.byDay.entries()]
        .sort((a, b) => a[0].localeCompare(b[0]))
        .map(([day, b]) => ({
          day,
          ...b,
          models: [...(p.dayModels.get(day)?.entries() ?? [])]
            .map(([model, cost]) => ({ model, cost }))
            .sort((x, y) => y.cost - x.cost),
        })),
    }))
    .sort((a, b) => b.cost - a.cost);

  // Models with spend, highest first — drives line order + color so the chart
  // matches the donut/legend (which use this same order).
  const modelList = [...byModel.entries()]
    .filter(([, b]) => b.cost > 0)
    .sort((a, b) => b[1].cost - a[1].cost)
    .map(([m]) => m);
  const sortedDays = [...byDay.keys()].sort((a, b) => a.localeCompare(b));
  const byDayModel: DayModelRow[] = sortedDays.map((day) => {
    const dm = dayModel.get(day);
    const row: DayModelRow = { day };
    for (const m of modelList) row[m] = dm?.get(m)?.cost ?? 0;
    return row;
  });

  // Per-day per-model breakdown (cost desc) for the daily table's expandable rows.
  const dayModelBreakdown = new Map<string, ModelBucket[]>();
  for (const [day, dm] of dayModel) {
    dayModelBreakdown.set(
      day,
      [...dm.entries()].map(([model, b]) => ({ model, ...b })).sort((a, b) => b.cost - a.cost),
    );
  }

  return {
    from,
    to,
    builtAt: meta.builtAt,
    parseMs: meta.parseMs,
    cache: meta.cache,
    generatedAt: now,
    totals,
    byDay: [...byDay.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([day, b]) => ({
        day,
        ...b,
        models: dayModelBreakdown.get(day) ?? [],
        sessions: daySessions.get(day)?.size ?? 0,
        hours: dayHours.get(day) ?? Array<number>(24).fill(0),
        tokenCost: finishTok(dayTok.get(day) ?? emptyTok(), b.cost),
        topSessions: [...(daySessions.get(day)?.values() ?? [])].sort((x, y) => y.cost - x.cost).slice(0, 5),
      })),
    byProject,
    byModel: [...byModel.entries()]
      .map(([model, b]) => {
        const efforts = modelEffort.get(model);
        const effortsList = [...(efforts?.entries() ?? [])]
          .map(([effort, eb]) => ({ effort, ...eb }))
          .sort((a, b) => compareEffort(a.effort, b.effort));
        return { model, ...b, efforts: effortsList };
      })
      .sort((a, b) => b.cost - a.cost),
    byEffort: [...byEffort.entries()]
      .map(([effort, b]) => ({ effort, ...b }))
      .sort((a, b) => compareEffort(a.effort, b.effort)),
    availableEfforts: [...availableEfforts].sort(compareEffort),
    effort: effortFilter,
    topSessions: allSessions
      .slice(0, 12)
      .map((s) => ({ session: s.session, project: s.project, day: s.day, cost: s.cost, messages: s.messages })),
    byDayModel,
    allSessions,
    byHour: byHour.map((b, hour) => ({ hour, ...b })),
    byWeekday: byWeekday.map((b, weekday) => ({ weekday, ...b })),
    heatmap,
    turnBuckets: TURN_BUCKETS.map((t, i) => ({ ...t, ...turns[i] })),
    cacheNetSaved: netSaved,
    tokenCost: finishTok(tokTotal, totals.cost),
    previous: hasPrev
      ? {
          from: prevFrom,
          to: prevEnd - 1,
          partial,
          totals: prevTotals,
          cacheNetSaved: prevNetSaved,
          byDay: [...prevByDay.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([day, cost]) => ({ day, cost })),
        }
      : null,
    planMonth: {
      month: monthKey,
      daysInMonth,
      byDay: planDays.map((cost, i) => ({ day: `${monthKey}-${String(i + 1).padStart(2, "0")}`, cost })),
    },
  };
}
