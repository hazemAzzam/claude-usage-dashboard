import "server-only";
import { mkdir, open, readFile, readdir, rename, stat, unlink } from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";
import { isEffort, parseEffort, type Effort } from "./effort";
import { costOf, type Usage } from "./pricing";
import type { UsageRecord } from "./usage";

// ---------------------------------------------------------------------------
// Persistent parse cache for ~/.claude/projects/**/*.jsonl transcripts.
//
// Parsing every transcript line on every request doesn't scale as logs grow.
// This module parses each file ONCE, persists the parsed rows plus a
// per-file "how far we've read" byte offset to `.cache/usage-index.json`,
// and on each subsequent load only reads the NEW bytes appended since the
// last parse. The same merge/dedup/sort/cost pipeline then runs over the
// cached rows every time, so the output is identical to a full reparse.
//
// See CLAUDE.md's "Parse cache" section for the invariants this must
// preserve (dedup order, cost/day computed at merge time, version bump
// policy, server-only).
// ---------------------------------------------------------------------------

// Bump whenever the line -> Row mapping changes (new/changed fields,
// different dedup-key derivation, etc). A mismatch vs. the persisted index's
// `version` (or any other structural problem with the cache file) forces a
// full rebuild instead of trusting stale/incompatible rows.
// v2: ParsedLine gained `agent` (subagent/sidechain id) so message position
// can be counted per conversation rather than per parent sessionId.
const CACHE_VERSION = 2;

export function projectsDir(): string {
  return process.env.CLAUDE_PROJECTS_DIR || path.join(homedir(), ".claude", "projects");
}

// `USAGE_CACHE=off` disables the ON-DISK cache file only (no
// .cache/usage-index.json read or written) — parsing is still in-memory
// incremental for the process's lifetime, just not persisted across
// restarts. It is NOT "always full reparse"; use `?rebuild=1` for that. Any
// other value (or unset) leaves the on-disk cache on.
function cacheEnabled(): boolean {
  return process.env.USAGE_CACHE !== "off";
}

function cacheDir(): string {
  return process.env.USAGE_CACHE_DIR || path.join(process.cwd(), ".cache");
}

function cacheFilePath(): string {
  return path.join(cacheDir(), "usage-index.json");
}

// ---- on-disk / in-memory shapes ----

// A parsed assistant-message line, reduced to only what UsageRecord/costOf
// need — cost and day are deliberately NOT stored here so pricing changes
// never require a cache rebuild; they're computed at merge time instead.
//
// `ts` is null when the line's timestamp was unparseable — the line still
// reserves its dedup `key`, but is dropped when records are rebuilt (same as
// the original `if (Number.isNaN(ts)) continue`).
//
// `key` is null when the line's dedup key was literally ":" (both
// message.id and requestId empty) — those lines are never deduped, so null
// specifically means "no dedup key, always keep", never "missing".
export interface ParsedLine {
  ts: number | null;
  session: string;
  project: string;
  model: string;
  effort: Effort;
  input: number;
  output: number;
  cacheCreate: number;
  cacheRead: number;
  ttl5m: number | null;
  ttl1h: number | null;
  // agentId for subagent lines, "sidechain" if isSidechain without an id, else
  // "" (main thread). Not part of the dedup key.
  agent: string;
  key: string | null;
}

interface FileEntry {
  size: number;
  mtimeMs: number;
  ino: number;
  // Byte offset up to (and including) the last complete line terminator
  // consumed so far. A trailing partial line beyond this offset is parsed
  // for the current request only and never persisted.
  offset: number;
  lines: ParsedLine[];
}

interface CacheIndex {
  version: number;
  projectsDir: string;
  updatedAt: number;
  files: Record<string, FileEntry>;
}

function emptyIndex(): CacheIndex {
  return { version: CACHE_VERSION, projectsDir: projectsDir(), updatedAt: 0, files: {} };
}

// ---- cache file load/save ----

let warnedOnce = false;

async function loadCacheFile(): Promise<CacheIndex> {
  const file = cacheFilePath();
  let raw: string;
  try {
    raw = await readFile(file, "utf8");
  } catch {
    return emptyIndex();
  }
  let parsed: CacheIndex;
  try {
    parsed = JSON.parse(raw) as CacheIndex;
  } catch {
    if (!warnedOnce) {
      warnedOnce = true;
      console.warn(`[usage-cache] cache file at ${file} is corrupt JSON; rebuilding.`);
    }
    return emptyIndex();
  }
  if (
    parsed.version !== CACHE_VERSION ||
    parsed.projectsDir !== projectsDir() ||
    typeof parsed.files !== "object" ||
    parsed.files === null
  ) {
    if (!warnedOnce) {
      warnedOnce = true;
      console.warn(`[usage-cache] cache file at ${file} is stale (version/projectsDir mismatch); rebuilding.`);
    }
    return emptyIndex();
  }

  // Validate each entry's shape defensively (a hand-edited or
  // partially-written cache file could have a malformed entry even though
  // the outer JSON parsed fine) — drop just that entry so the next sweep
  // treats it as "unseen" and reparses that one file, instead of one bad
  // entry corrupting the whole load.
  const cleanFiles: Record<string, FileEntry> = {};
  let droppedInvalid = 0;
  for (const [path, entry] of Object.entries(parsed.files)) {
    if (isValidFileEntry(entry)) {
      cleanFiles[path] = entry;
    } else {
      droppedInvalid++;
    }
  }
  if (droppedInvalid > 0) {
    console.warn(`[usage-cache] cache file at ${file} had ${droppedInvalid} invalid entr(y/ies); dropping them.`);
  }

  return { ...parsed, files: cleanFiles };
}

function isValidFileEntry(v: unknown): v is FileEntry {
  if (typeof v !== "object" || v === null) return false;
  const e = v as Record<string, unknown>;
  return (
    typeof e.size === "number" &&
    typeof e.mtimeMs === "number" &&
    typeof e.ino === "number" &&
    typeof e.offset === "number" &&
    Number.isFinite(e.size) &&
    Number.isFinite(e.mtimeMs) &&
    Number.isFinite(e.ino) &&
    Number.isFinite(e.offset) &&
    Array.isArray(e.lines)
  );
}

// Atomic write: tmp file in the same directory, fsync, rename over the
// target. Errors (read-only filesystem, disk full, permission denied) are
// caught and logged rather than propagated — the in-memory result for this
// request is still good and must still be served; the only cost of a save
// failure is falling back to a slower reparse on a future request (see
// `schedulePersist`, which calls this off the request path). Never leaves a
// stray tmp file behind: on write failure `open` may not have run, and if
// the handle did open, we unlink the tmp file before rethrowing.
async function saveCacheFile(index: CacheIndex): Promise<void> {
  const file = cacheFilePath();
  const dir = path.dirname(file);
  const tmp = path.join(dir, `.usage-index.${process.pid}.${Math.random().toString(36).slice(2)}.tmp`);
  try {
    await mkdir(dir, { recursive: true });
    const handle = await open(tmp, "w");
    try {
      await handle.writeFile(JSON.stringify(index), "utf8");
      await handle.sync();
    } finally {
      await handle.close();
    }
    await rename(tmp, file);
  } catch (err) {
    await unlink(tmp).catch(() => {});
    if (!warnedSaveFailure) {
      warnedSaveFailure = true;
      console.warn(
        `[usage-cache] failed to persist cache file at ${file}; continuing with in-memory cache only.`,
        err,
      );
    }
    throw err;
  }
}
let warnedSaveFailure = false;

// ---- file walk ----

interface FileStat {
  path: string;
  size: number;
  mtimeMs: number;
  ino: number;
}

// Depth-first walk, directory-entry order as returned by readdir (not
// sorted) — same walk order as the original lib/usage.ts `listJsonl`, so
// mtime-tie ordering in the newest-first sort stays identical.
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

async function statFiles(files: string[]): Promise<FileStat[]> {
  const out: FileStat[] = [];
  for (const f of files) {
    const s = await stat(f).catch(() => null);
    if (!s) continue;
    out.push({ path: f, size: s.size, mtimeMs: s.mtimeMs, ino: s.ino });
  }
  return out;
}

// ---- line parsing ----

interface RawLine {
  type?: string;
  timestamp?: string;
  cwd?: string;
  sessionId?: string;
  requestId?: string;
  agentId?: string;
  isSidechain?: boolean;
  message?: { id?: string; model?: string; usage?: Usage };
  effort?: string;
  perTurnEffort?: string | null;
}

// Parses one raw JSONL line into a ParsedLine. Returns null for lines that
// don't produce a record at all (wrong type, no usage block, bad JSON) —
// those never reserved a dedup key in the original code either.
function parseLine(line: string, folder: string): ParsedLine | null {
  if (!line || line[0] !== "{") return null;
  let rec: RawLine;
  try {
    rec = JSON.parse(line) as RawLine;
  } catch {
    return null;
  }
  if (rec.type !== "assistant") return null;
  const msg = rec.message;
  if (!msg) return null;
  const usage = msg.usage;
  if (!usage) return null;

  const key = `${msg.id ?? ""}:${rec.requestId ?? ""}`;
  const dedupKey = key === ":" ? null : key;

  const ts = Date.parse(rec.timestamp ?? "");
  const tsOrNull = Number.isNaN(ts) ? null : ts;

  const cwd: string = rec.cwd || "";
  const project = cwd ? path.basename(cwd) : folder.replace(/^-/, "").split("-").pop() || folder;

  const effort: Effort = isEffort(rec.perTurnEffort ?? null)
    ? (rec.perTurnEffort as Effort)
    : parseEffort(rec.effort);

  const ttl5m = usage.cache_creation?.ephemeral_5m_input_tokens;
  const ttl1h = usage.cache_creation?.ephemeral_1h_input_tokens;

  return {
    ts: tsOrNull,
    session: rec.sessionId || "unknown",
    project,
    model: msg.model || "unknown",
    effort,
    input: usage.input_tokens ?? 0,
    output: usage.output_tokens ?? 0,
    cacheCreate: usage.cache_creation_input_tokens ?? 0,
    cacheRead: usage.cache_read_input_tokens ?? 0,
    ttl5m: ttl5m === undefined ? null : ttl5m,
    ttl1h: ttl1h === undefined ? null : ttl1h,
    agent: rec.agentId || (rec.isSidechain ? "sidechain" : ""),
    key: dedupKey,
  };
}

// Matches node:readline's line-boundary behavior under crlfDelay:Infinity:
// '\r\n' counts as ONE boundary, but a lone '\n', lone '\r', U+2028 (LINE
// SEPARATOR), or U+2029 (PARAGRAPH SEPARATOR) each count as their own
// boundary. Real transcripts have been seen with literal U+2028/U+2029
// bytes embedded inside a JSON string value (e.g. source code containing
// those characters in a regex/comment) — readline splits the line there,
// the resulting fragments fail JSON.parse, and the original code silently
// drops that assistant message. Reproducing the same split points keeps
// cached output identical to a full reparse.
//
// Splitting happens on RAW BYTES, not decoded text: '\n' (0x0A) and '\r'
// (0x0D) are single ASCII bytes and can never appear as part of a
// multi-byte UTF-8 sequence (continuation bytes are always >= 0x80), so no
// decoding is needed to find them safely. U+2028/U+2029 encode to the
// 3-byte UTF-8 sequence E2 80 A8 / E2 80 A9, matched directly against the
// byte buffer for the same reason. Only complete lines are ever decoded
// (once, whole) — a multi-byte character straddling a chunk boundary is
// simply carried forward as part of the undecoded tail and never split
// mid-character, unlike the earlier text-based approach this replaced
// (which decoded each chunk independently and could corrupt a split
// multi-byte character into U+FFFD, throwing off both the parsed line and
// the computed byte offset).
const NL = 0x0a;
const CR = 0x0d;
const LS_PS_SECOND_BYTE = 0x80; // shared 2nd byte of E2 80 A8 / E2 80 A9
const LS_PS_LAST_BYTE = new Set([0xa8, 0xa9]); // A8 = U+2028, A9 = U+2029

// Scans `buf` for the next line-boundary starting at or after `from`.
// Returns [boundaryStart, boundaryLenBytes] for the earliest boundary
// found, or null if none. A boundary sequence that isn't fully present yet
// (e.g. the buffer ends right after 0xE2 of an as-yet-incomplete LS/PS) is
// correctly left unmatched here, so it's carried into the next chunk
// instead of being misread.
function findNextBoundary(buf: Buffer, from: number): [number, number] | null {
  for (let i = from; i < buf.length; i++) {
    const b = buf[i];
    if (b === NL) return [i, 1];
    if (b === CR) {
      if (i + 1 < buf.length && buf[i + 1] === NL) return [i, 2];
      return [i, 1];
    }
    if (b === 0xe2 && i + 2 < buf.length && buf[i + 1] === LS_PS_SECOND_BYTE && LS_PS_LAST_BYTE.has(buf[i + 2])) {
      return [i, 3];
    }
  }
  return null;
}

// Splits raw bytes into complete decoded lines plus an optional trailing
// partial-line byte tail (no terminator yet, or a boundary sequence cut
// short at the end of `buf` that needs more bytes to resolve).
function splitLineBytes(buf: Buffer): { lines: string[]; partial: Buffer } {
  const lines: string[] = [];
  let pos = 0;
  for (;;) {
    const found = findNextBoundary(buf, pos);
    if (!found) break;
    const [start, boundaryLen] = found;
    lines.push(buf.subarray(pos, start).toString("utf8"));
    pos = start + boundaryLen;
  }
  return { lines, partial: buf.subarray(pos) };
}

// Reads and parses file bytes in [fromOffset, stat.size), returning the
// complete-line ParsedLines, the new offset (end of the last complete line,
// exact bytes), and any trailing partial-line ParsedLine (parsed for this
// request only, never persisted — `newOffset` does NOT advance past it, so
// a concurrent writer still mid-line gets it properly reparsed on the next
// load).
//
// Chunk boundaries carry raw, undecoded Buffer bytes across iterations —
// see `splitLineBytes` for why this keeps multi-byte UTF-8 and LS/PS
// handling exact even when either straddles a chunk boundary.
async function parseRange(
  filePath: string,
  fromOffset: number,
  toSize: number,
  folder: string,
): Promise<{ lines: ParsedLine[]; newOffset: number; partial: ParsedLine | null }> {
  const lines: ParsedLine[] = [];
  let fh;
  try {
    fh = await open(filePath, "r");
  } catch {
    // File vanished between statFiles() and here (deleted mid-sweep, or a
    // tool replaced it non-atomically). Treat as "nothing read" rather than
    // failing the whole request — the caller's `onDisk` set is built from
    // the earlier stat pass, so on THIS sweep it's still treated as present
    // with no new data; the NEXT sweep's stat pass will no longer see it
    // and it'll be dropped as deleted, same as any other delete.
    return { lines, newOffset: fromOffset, partial: null };
  }
  try {
    let consumedTotal = fromOffset; // bytes consumed through the last complete line
    const CHUNK = 8 * 1024 * 1024;
    let carryBytes = Buffer.alloc(0); // raw undecoded bytes left over from the previous chunk
    let readPos = fromOffset; // next byte offset to read from
    while (readPos < toSize) {
      const toRead = Math.min(CHUNK, toSize - readPos);
      const buf = Buffer.alloc(toRead);
      const { bytesRead } = await fh.read(buf, 0, toRead, readPos);
      if (bytesRead === 0) break; // safety against infinite loop on unexpected EOF
      readPos += bytesRead;
      const combinedBytes = Buffer.concat([carryBytes, buf.subarray(0, bytesRead)]);
      const { lines: complete, partial } = splitLineBytes(combinedBytes);
      for (const line of complete) {
        const parsed = parseLine(line, folder);
        if (parsed) lines.push(parsed);
      }
      consumedTotal = readPos - partial.length;
      carryBytes = Buffer.from(partial);
    }
    let partialLine: ParsedLine | null = null;
    if (carryBytes.length > 0) {
      partialLine = parseLine(carryBytes.toString("utf8"), folder);
    }
    return { lines, newOffset: consumedTotal, partial: partialLine };
  } finally {
    await fh.close();
  }
}

// ---- sweep: reconcile the cache index against on-disk state ----

export interface SweepStats {
  filesTotal: number;
  reparsed: number;
  appended: number;
  unchanged: number;
  deleted: number;
  parsedBytes: number;
  ms: number;
}

interface SweepResult {
  index: CacheIndex;
  // Extra in-memory-only lines from trailing partial lines, keyed by file
  // path — never persisted, folded into the merge for this response only.
  transientPartial: Map<string, ParsedLine>;
  stats: SweepStats;
  changed: boolean;
}

async function sweep(prevIndex: CacheIndex): Promise<SweepResult> {
  const t0 = Date.now();
  const root = prevIndex.projectsDir;
  const files = await listJsonl(root);
  const stats = await statFiles(files);
  const onDisk = new Set(stats.map((s) => s.path));

  const nextFiles: Record<string, FileEntry> = {};
  const transientPartial = new Map<string, ParsedLine>();
  let reparsed = 0;
  let appended = 0;
  let unchanged = 0;
  let parsedBytes = 0;
  let changed = false;

  for (const s of stats) {
    const prev = prevIndex.files[s.path];
    const folder = path.basename(path.dirname(s.path));

    // Full reparse needed: new file, shrink, ino change, or same-size
    // content change we can't trust as an append.
    const needsFullReparse =
      !prev || s.size < prev.offset || prev.ino !== s.ino || (s.size === prev.size && s.mtimeMs !== prev.mtimeMs);

    if (needsFullReparse) {
      const { lines, newOffset, partial } = await parseRange(s.path, 0, s.size, folder);
      nextFiles[s.path] = { size: s.size, mtimeMs: s.mtimeMs, ino: s.ino, offset: newOffset, lines };
      if (partial) transientPartial.set(s.path, partial);
      reparsed++;
      parsedBytes += s.size;
      changed = true;
      continue;
    }

    if (prev.size === s.size && prev.mtimeMs === s.mtimeMs) {
      // Stat-unchanged. Still, `prev.offset` can sit before `s.size` when
      // the file's tail was a partial line (no terminator) on a previous
      // sweep — that partial line is never persisted/advanced-past (see
      // `parseRange`), so if the file genuinely stopped growing there (its
      // last line permanently lacks a trailing newline), the earlier
      // "unchanged -> reuse prev as-is" path would silently drop that line
      // forever and stop reserving its dedup key, unlike a full reparse
      // which always includes a trailing unterminated line. Re-read
      // [offset, size) here too — same cost as the grown-file path, just
      // parsed transiently (not stored) since nothing on disk actually
      // changed.
      if (s.size > prev.offset) {
        const { partial } = await parseRange(s.path, prev.offset, s.size, folder);
        if (partial) transientPartial.set(s.path, partial);
      }
      nextFiles[s.path] = prev;
      unchanged++;
      continue;
    }

    if (s.size > prev.offset) {
      // Grew (same ino) — read only the new bytes from `offset` onward.
      const { lines: newLines, newOffset, partial } = await parseRange(s.path, prev.offset, s.size, folder);
      nextFiles[s.path] = {
        size: s.size,
        mtimeMs: s.mtimeMs,
        ino: s.ino,
        offset: newOffset,
        lines: prev.lines.concat(newLines),
      };
      if (partial) transientPartial.set(s.path, partial);
      appended++;
      parsedBytes += s.size - prev.offset;
      changed = true;
      continue;
    }

    // Same size/mtime/ino as prev but didn't hit the exact-match branch
    // above (shouldn't normally happen) — reuse as-is.
    nextFiles[s.path] = prev;
    unchanged++;
  }

  const deleted = Object.keys(prevIndex.files).filter((p) => !onDisk.has(p)).length;
  if (deleted > 0) changed = true;

  const index: CacheIndex = {
    version: prevIndex.version,
    projectsDir: root,
    updatedAt: Date.now(),
    files: nextFiles,
  };

  return {
    index,
    transientPartial,
    changed,
    stats: {
      filesTotal: stats.length,
      reparsed,
      appended,
      unchanged,
      deleted,
      parsedBytes,
      ms: Date.now() - t0,
    },
  };
}

// ---- merge: cached lines -> UsageRecord[] (dedup, sort, cost) ----

function dayKey(ts: number): string {
  const d = new Date(ts);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function lineToRecord(line: ParsedLine): UsageRecord | null {
  if (line.ts === null) return null; // bad-timestamp lines are dropped, same as the original
  const cost = costOf(line.model, {
    input_tokens: line.input,
    output_tokens: line.output,
    cache_creation_input_tokens: line.cacheCreate,
    cache_read_input_tokens: line.cacheRead,
    cache_creation:
      line.ttl5m !== null || line.ttl1h !== null
        ? { ephemeral_5m_input_tokens: line.ttl5m ?? undefined, ephemeral_1h_input_tokens: line.ttl1h ?? undefined }
        : undefined,
  });
  return {
    ts: line.ts,
    day: dayKey(line.ts),
    project: line.project,
    model: line.model,
    session: line.session,
    agent: line.agent,
    cost,
    input: line.input,
    output: line.output,
    cacheCreate: line.cacheCreate,
    cacheRead: line.cacheRead,
    effort: line.effort,
  };
}

// Merges every file's cached lines into a single UsageRecord[], preserving
// the original lib/usage.ts semantics exactly:
//  - files ordered by CURRENT mtime, newest first (stable sort — ties keep
//    walk/insertion order, i.e. Object.entries(index.files) order, which
//    mirrors the directory-walk order since files are inserted during scan)
//  - cross-file first-wins dedup by key (null keys, originally ":", are
//    never deduped)
//  - bad-timestamp lines are dropped but still reserve their key
//  - final stable sort by timestamp
export function buildRecords(index: CacheIndex, transientPartial?: Map<string, ParsedLine>): UsageRecord[] {
  const entries = Object.entries(index.files);
  entries.sort((a, b) => b[1].mtimeMs - a[1].mtimeMs);

  const seen = new Set<string>();
  const out: UsageRecord[] = [];

  for (const [filePath, entry] of entries) {
    const extra = transientPartial?.get(filePath);
    const lines = extra ? entry.lines.concat(extra) : entry.lines;
    for (const line of lines) {
      if (line.key !== null) {
        if (seen.has(line.key)) continue;
        seen.add(line.key);
      }
      const rec = lineToRecord(line);
      if (rec) out.push(rec);
    }
  }

  out.sort((a, b) => a.ts - b.ts);
  return out;
}

// ---- public entry point: in-memory hot cache + single in-flight load ----

export interface CacheLoadResult {
  records: UsageRecord[];
  builtAt: number;
  ms: number;
  stats: SweepStats;
}

const TTL_MS = 5_000;
// Minimum gap between persisted writes of the cache file. Every live-session
// append would otherwise trigger a synchronous multi-MB JSON.stringify+fsync
// on the request path; instead we persist off the request path (see
// `schedulePersist`) and coalesce bursts of changes into at most one write
// per this interval, plus always immediately after a full rebuild or the
// very first cold build (so a fresh cache survives a near-immediate restart).
const PERSIST_MIN_INTERVAL_MS = 30_000;

let hotIndex: CacheIndex | null = null;
let hotRecords: UsageRecord[] | null = null;
let hotBuiltAt = 0;
let hotStats: SweepStats = { filesTotal: 0, reparsed: 0, appended: 0, unchanged: 0, deleted: 0, parsedBytes: 0, ms: 0 };
let inflight: Promise<CacheLoadResult> | null = null;
let loadedFromDisk = false;

let lastPersistAt = 0;
let persistTimer: ReturnType<typeof setTimeout> | null = null;
let pendingPersistIndex: CacheIndex | null = null;

// Fire-and-forget, debounced persistence — never awaited by the request
// path. `immediate` (used after a rebuild or the first cold build) writes
// right away instead of waiting out the coalescing window, since those are
// already-expensive requests where the extra write cost is negligible and
// losing that particular snapshot to a near-immediate restart is the most
// wasteful case (it would force the next request back to a full reparse).
function schedulePersist(index: CacheIndex, immediate: boolean): void {
  pendingPersistIndex = index;
  const dueIn = immediate ? 0 : Math.max(0, PERSIST_MIN_INTERVAL_MS - (Date.now() - lastPersistAt));
  if (persistTimer) {
    if (!immediate) return; // a write is already scheduled; it'll pick up the latest pendingPersistIndex
    clearTimeout(persistTimer);
  }
  persistTimer = setTimeout(() => {
    persistTimer = null;
    const toWrite = pendingPersistIndex;
    pendingPersistIndex = null;
    if (!toWrite) return;
    lastPersistAt = Date.now();
    saveCacheFile(toWrite).catch(() => {
      // Already logged (once) inside saveCacheFile; nothing else to do here
      // — the in-memory cache continues to serve requests regardless.
    });
  }, dueIn);
  // Don't hold the process open just for this timer (relevant in short-lived
  // script/test contexts; irrelevant for a long-running `next start`).
  persistTimer.unref?.();
}

async function doLoad(rebuild: boolean): Promise<CacheLoadResult> {
  const t0 = Date.now();
  const persistOn = cacheEnabled();
  const isFirstLoad = hotIndex === null;

  let prev: CacheIndex;
  if (rebuild) {
    prev = emptyIndex();
  } else if (persistOn) {
    if (!loadedFromDisk || hotIndex === null) {
      prev = await loadCacheFile();
      loadedFromDisk = true;
    } else {
      prev = hotIndex;
    }
  } else {
    // USAGE_CACHE=off: never read/write the persisted FILE. The in-memory
    // index is still kept and swept incrementally within a process's
    // lifetime (same as with the file cache on) — "off" means no on-disk
    // persistence, not "always full reparse"; a process restart always
    // starts cold either way since there's no file to load from.
    prev = hotIndex ?? emptyIndex();
  }
  // Guard against a stale in-memory/persisted index pointed at a different
  // projects dir (e.g. env var changed between requests in dev).
  if (prev.projectsDir !== projectsDir()) prev = emptyIndex();

  const { index, transientPartial, stats, changed } = await sweep(prev);
  const records = buildRecords(index, transientPartial);

  if (persistOn && changed) {
    schedulePersist(index, rebuild || isFirstLoad);
  }

  hotIndex = index;
  hotRecords = records;
  hotBuiltAt = Date.now();
  hotStats = stats;

  return { records, builtAt: hotBuiltAt, ms: Date.now() - t0, stats };
}

// `force`: bypass the in-memory TTL and run an incremental load now (the
// dashboard's Refresh button). `rebuild`: discard the persisted/in-memory
// index entirely and do a full reparse of every file (the API's `?rebuild=1`).
export async function getCachedRecords(opts?: { force?: boolean; rebuild?: boolean }): Promise<CacheLoadResult> {
  const force = opts?.force ?? false;
  const rebuild = opts?.rebuild ?? false;

  if (!rebuild && !force && hotRecords && Date.now() - hotBuiltAt < TTL_MS) {
    return { records: hotRecords, builtAt: hotBuiltAt, ms: 0, stats: hotStats };
  }

  if (!inflight) {
    inflight = doLoad(rebuild).finally(() => {
      inflight = null;
    });
    return inflight;
  }

  // A load is already in flight. A plain (no force/rebuild) request is
  // content to just ride along with it — that's the TTL-coalescing this
  // in-flight guard exists for. But `force`/`rebuild` are explicit "do the
  // work now" requests (Refresh / discard-and-reparse); silently handing
  // back whatever an unrelated concurrent plain load happens to produce
  // would violate that (e.g. `rebuild` must always yield a genuine full
  // reparse, not whichever sweep was already in progress). Chain a fresh
  // load after the current one finishes instead of joining it.
  if (force || rebuild) {
    const chained = inflight.then(() => doLoad(rebuild));
    inflight = chained.finally(() => {
      inflight = null;
    });
    return inflight;
  }

  return inflight;
}
