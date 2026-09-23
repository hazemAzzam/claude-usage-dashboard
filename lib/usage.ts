import { createReadStream } from "node:fs";
import { readdir, stat } from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";
import readline from "node:readline";
import { costOf, type Usage } from "./pricing";
import { compareEffort, type Effort, isEffort, parseEffort } from "./effort";

// One assistant message, reduced to just what the dashboard needs.
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
}

export function projectsDir(): string {
  return process.env.CLAUDE_PROJECTS_DIR || path.join(homedir(), ".claude", "projects");
}

function dayKey(ts: number): string {
  const d = new Date(ts);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

async function listJsonl(root: string): Promise<string[]> {
  const out: string[] = [];
  async function walk(dir: string) {
    let entries;
    try {
      entries = await readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      const full = path.join(dir, e.name);
      if (e.isDirectory()) await walk(full);
      else if (e.isFile() && e.name.endsWith(".jsonl")) out.push(full);
    }
  }
  await walk(root);
  return out;
}

interface RawLine {
  type?: string;
  timestamp?: string;
  cwd?: string;
  sessionId?: string;
  requestId?: string;
  message?: { id?: string; model?: string; usage?: Usage };
  effort?: string;
  perTurnEffort?: string | null;
}

async function parseFile(file: string, seen: Set<string>, out: UsageRecord[]) {
  const folder = path.basename(path.dirname(file));
  const rl = readline.createInterface({
    input: createReadStream(file, { encoding: "utf8" }),
    crlfDelay: Infinity,
  });
  for await (const line of rl) {
    if (!line || line[0] !== "{") continue;
    let rec: RawLine;
    try {
      rec = JSON.parse(line) as RawLine;
    } catch {
      continue;
    }
    if (rec.type !== "assistant") continue;
    const msg = rec.message;
    if (!msg) continue;
    const usage = msg.usage;
    if (!usage) continue;

    // Dedup: the same assistant message can appear in multiple transcript files.
    const key = `${msg.id ?? ""}:${rec.requestId ?? ""}`;
    if (key !== ":" && seen.has(key)) continue;
    if (key !== ":") seen.add(key);

    const ts = Date.parse(rec.timestamp ?? "");
    if (Number.isNaN(ts)) continue;

    const cwd: string = rec.cwd || "";
    const project = cwd ? path.basename(cwd) : folder.replace(/^-/, "").split("-").pop() || folder;

    out.push({
      ts,
      day: dayKey(ts),
      project,
      model: msg.model || "unknown",
      session: rec.sessionId || "unknown",
      cost: costOf(msg.model, usage),
      input: usage.input_tokens ?? 0,
      output: usage.output_tokens ?? 0,
      cacheCreate: usage.cache_creation_input_tokens ?? 0,
      cacheRead: usage.cache_read_input_tokens ?? 0,
      // perTurnEffort overrides effort only when it's itself a recognised level —
      // an unrecognised/garbage override must not mask a valid `effort` value.
      effort: isEffort(rec.perTurnEffort ?? null) ? (rec.perTurnEffort as Effort) : parseEffort(rec.effort),
    });
  }
}

// ---- module cache (the parse is the expensive part) ----
let cache: { records: UsageRecord[]; builtAt: number; ms: number } | null = null;
let inflight: Promise<UsageRecord[]> | null = null;
const TTL_MS = 30_000;

async function buildRecords(): Promise<UsageRecord[]> {
  const t0 = Date.now();
  const files = await listJsonl(projectsDir());
  const seen = new Set<string>();
  const out: UsageRecord[] = [];
  // Newest files first so dedup keeps the most recent copy of a message.
  const withTimes = await Promise.all(
    files.map(async (f) => ({ f, m: (await stat(f).catch(() => null))?.mtimeMs ?? 0 })),
  );
  withTimes.sort((a, b) => b.m - a.m);
  for (const { f } of withTimes) await parseFile(f, seen, out);
  out.sort((a, b) => a.ts - b.ts);
  cache = { records: out, builtAt: Date.now(), ms: Date.now() - t0 };
  return out;
}

export async function getRecords(force = false): Promise<{ records: UsageRecord[]; builtAt: number; ms: number }> {
  if (!force && cache && Date.now() - cache.builtAt < TTL_MS) return cache;
  if (force) cache = null;
  if (!inflight) inflight = buildRecords().finally(() => (inflight = null));
  await inflight;
  return cache!;
}

// ---- aggregation ----
export type Range = "7d" | "30d" | "90d" | "all";

function cutoff(range: Range, now: number): number {
  const days = range === "7d" ? 7 : range === "30d" ? 30 : range === "90d" ? 90 : Infinity;
  return days === Infinity ? 0 : now - days * 86_400_000;
}

const empty = () => ({ cost: 0, input: 0, output: 0, cacheCreate: 0, cacheRead: 0, messages: 0 });
type Bucket = ReturnType<typeof empty>;

function add(b: Bucket, r: UsageRecord) {
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
// top-level `byDay` (drives the daily table's expandable rows), omitted on the
// per-project `byDay` where it isn't needed.
export type DayBucket = { day: string; models?: ModelBucket[] } & Bucket;

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
  byDay: DayBucket[];
} & Bucket;

export interface Summary {
  from: number; // window start (epoch ms)
  to: number; // window end (epoch ms)
  builtAt: number;
  parseMs: number;
  generatedAt: number;
  totals: Bucket & { sessions: number };
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
}

// An explicit date window (epoch ms). `summarize` also accepts a preset Range
// (used by lib/context.ts); the dashboard passes an explicit window.
export type DateWindow = { from: number; to: number };

export function summarize(
  records: UsageRecord[],
  sel: Range | DateWindow,
  meta: { builtAt: number; parseMs: number },
  opts?: { effort?: Effort | null },
): Summary {
  const now = Date.now();
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

  const sessions = new Map<
    string,
    { project: string; day: string; firstTs: number; lastTs: number; bucket: Bucket; models: Map<string, Bucket> }
  >();
  const projects = new Map<
    string,
    { bucket: Bucket; sessions: Set<string>; models: Map<string, Bucket>; byDay: Map<string, Bucket> }
  >();

  for (const r of records) {
    if (r.ts < from || r.ts > to) continue;

    // Collect the available-effort set from everything in the date window,
    // BEFORE the effort filter narrows what actually gets aggregated — so the
    // filter chip row always reflects what's selectable for this window.
    availableEfforts.add(r.effort);
    if (effortFilter && r.effort !== effortFilter) continue;

    add(totals, r);

    let d = byDay.get(r.day);
    if (!d) byDay.set(r.day, (d = empty()));
    add(d, r);

    let m = byModel.get(r.model);
    if (!m) byModel.set(r.model, (m = empty()));
    add(m, r);

    let me = modelEffort.get(r.model);
    if (!me) modelEffort.set(r.model, (me = new Map()));
    let meb = me.get(r.effort);
    if (!meb) me.set(r.effort, (meb = empty()));
    add(meb, r);

    let eb = byEffort.get(r.effort);
    if (!eb) byEffort.set(r.effort, (eb = empty()));
    add(eb, r);

    let dm = dayModel.get(r.day);
    if (!dm) dayModel.set(r.day, (dm = new Map()));
    let dmb = dm.get(r.model);
    if (!dmb) dm.set(r.model, (dmb = empty()));
    add(dmb, r);

    const dt = new Date(r.ts);
    const hr = dt.getHours();
    const wd = dt.getDay();
    add(byHour[hr], r);
    add(byWeekday[wd], r);
    heatmap[wd][hr] += r.cost;

    let s = sessions.get(r.session);
    if (!s)
      sessions.set(
        r.session,
        (s = { project: r.project, day: r.day, firstTs: r.ts, lastTs: r.ts, bucket: empty(), models: new Map() }),
      );
    add(s.bucket, r);
    s.day = r.day;
    if (r.ts < s.firstTs) s.firstTs = r.ts;
    if (r.ts > s.lastTs) s.lastTs = r.ts;
    let sm = s.models.get(r.model);
    if (!sm) s.models.set(r.model, (sm = empty()));
    add(sm, r);

    let p = projects.get(r.project);
    if (!p) projects.set(r.project, (p = { bucket: empty(), sessions: new Set(), models: new Map(), byDay: new Map() }));
    add(p.bucket, r);
    p.sessions.add(r.session);
    let pm = p.models.get(r.model);
    if (!pm) p.models.set(r.model, (pm = empty()));
    add(pm, r);
    let pd = p.byDay.get(r.day);
    if (!pd) p.byDay.set(r.day, (pd = empty()));
    add(pd, r);
  }

  totals.sessions = sessions.size;

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
      byDay: [...p.byDay.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([day, b]) => ({ day, ...b })),
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
    generatedAt: now,
    totals,
    byDay: [...byDay.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([day, b]) => ({ day, ...b, models: dayModelBreakdown.get(day) ?? [] })),
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
  };
}
