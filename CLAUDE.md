# CLAUDE.md

A local-only Next.js (App Router) dashboard that parses Claude Code transcripts
from `~/.claude/projects/**/*.jsonl` and shows API-equivalent token cost/usage
sliced by day, project, model, session, and effort level. No DB, no account —
everything is derived from local JSONL files, parsed once and incrementally
updated via a persistent cache (in-memory hot copy TTL 5s; see "Parse cache").

## Layering

- **`lib/effort.ts`** and **`lib/pricing.ts`** are pure, single sources of truth
  — no `node:*` imports, safe to import from client components. `lib/effort.ts`
  owns the `Effort` type/order/labels; `lib/pricing.ts` owns per-model $/1M rates.
- **`lib/usage-cache.ts`** is server-only and owns transcript I/O: walking
  `~/.claude/projects/**/*.jsonl`, the persistent per-file parse cache (see
  "Parse cache" below), and merging cached lines into `UsageRecord[]`.
- **`lib/usage.ts`** is server-only and owns aggregation (`summarize()`) over the
  `UsageRecord[]` that `lib/usage-cache.ts` produces. Client components must only
  import **types** from it (`Summary`, `ModelBucket`, `EffortBucket`, etc.), never
  the module's runtime code.
- **`UsageRecord`** is defined in `lib/usage.ts` and imported back into
  `lib/usage-cache.ts` with `import type` — type-only imports are fully
  erased at compile time, so this never creates a runtime circular
  dependency between the two modules despite the "cross" import direction.
- **API routes** (`app/api/usage`, `app/api/chat`) are thin adapters: parse query
  params, call into `lib/`, return JSON or a stream. No aggregation logic lives
  in the route handlers themselves.
- **`components/views/*`** are presentation — they receive an already-aggregated
  `Summary` as a prop and render it. They don't fetch or filter data themselves;
  `app/page.tsx` owns fetch/filter state and passes the result down.

## Parse cache (`lib/usage-cache.ts`)

Transcripts are parsed once and cached to `.cache/usage-index.json`
(gitignored), keyed by absolute file path, storing each file's parsed lines
plus a byte `offset` ("how far we've read"). On each load every file is
`stat`-ed: unchanged (size/mtime/ino match) reuses cached lines, grown (same
ino, size > offset) reads and parses only the new byte range, shrunk or a
different ino triggers a full reparse, deleted files drop out. Invariants
that must hold for any change here:

- **Dedup/sort order is byte-for-byte identical to a full reparse.** Files
  are merged newest-mtime-first (stable sort — ties keep insertion/walk
  order), dedup is first-wins by `message.id:requestId`, a key of exactly
  `":"` (both empty) is **never** deduped, a line with an unparseable
  timestamp is dropped but still reserves its dedup key, and the final
  record list is stably sorted by timestamp. Any change to this pipeline
  must be verified against a full reparse (`?rebuild=1`) on the same data —
  `jq -S` diff the two responses (stripping `builtAt`/`parseMs`/`generatedAt`,
  which are wall-clock and expected to differ).
- **Cost and `day` are computed at merge time, not cached.** `ParsedLine`
  stores only raw token counts + `ts`; a pricing change in `lib/pricing.ts`
  never requires a cache rebuild.
- **Bump `CACHE_VERSION`** (top of `lib/usage-cache.ts`) whenever the
  line-parsing logic changes (new/changed `ParsedLine` fields, different
  dedup-key derivation, etc). A version/`projectsDir` mismatch on load
  discards the cache and triggers a full rebuild rather than trusting
  incompatible cached rows.
- **`server-only`** — `lib/usage-cache.ts` imports `"server-only"` at the top;
  never import it from a client component.
- **`USAGE_CACHE=off`** disables the on-disk cache FILE only — no
  `.cache/usage-index.json` is ever read or written. The in-memory index is
  still kept and swept incrementally for the life of the process (same 5s
  TTL, same "only parse new bytes" behavior), it just isn't persisted, so a
  process restart always starts cold. It is **not** "always full reparse
  every request" — that's what `?rebuild=1` is for, which discards both the
  in-memory and on-disk index and always does a genuine full reparse.
- Writes to the cache file are **debounced and off the request path**
  (`schedulePersist`, min. 30s between writes, plus always immediately after
  a full rebuild or the first cold build of a process) — a request never
  blocks on `fsync`ing the multi-MB index file. A write failure (read-only
  disk, disk full) is caught, logged once, and never fails the request or
  leaves the in-memory cache unset; it only means the next process restart
  falls back to a full reparse.
- A trailing partial line (no line terminator yet, i.e. still being written)
  is parsed for that one request only and its result is **never persisted**
  — the stored `offset` stays before it, so the next load reparses it once
  it's complete.

## Aggregation pattern

`lib/usage.ts`'s `summarize()` builds every breakdown (`byDay`, `byModel`,
`byEffort`, per-project, per-session, model×effort, day×model, ...) with one
shared `empty()` bucket shape and `add()` accumulator — each record is folded
into every relevant bucket in a single pass. Follow this pattern for new
breakdowns rather than post-processing `records` again elsewhere.

## Rules

- **Never use `message.usage.output_tokens_details.thinking_tokens`** — it reads
  0 on nearly all `xhigh`/`max` messages and is not a reliable effort signal.
  Effort always comes from the `effort`/`perTurnEffort` log fields via
  `parseEffort()`.
- Filters (date range, effort) are applied **inside `summarize()`**, before
  aggregation, so every view/table/chart gets a consistently filtered `Summary`
  — never filter a subset of the data downstream in a single view.

## Verification

`npx tsc --noEmit && npm run lint && npm run build` must pass. `npm run lint`
now runs `eslint .` against the flat config in `eslint.config.mjs` (ESLint 9;
`eslint-config-next` for Next 16.3). There is no test suite. Manual/browser
verification is not required for routine changes.

Stack: Next.js 16.3.x + React 19.3.x, Node >=20.9 (see `engines` in
`package.json`).

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
