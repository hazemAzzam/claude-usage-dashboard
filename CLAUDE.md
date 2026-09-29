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
- **`lib/stats.ts`** — client-safe pure numeric helpers (`pctDelta`,
  `movingAverage`, `cumulative`, `median`, `shareOf`, `linearProjection`,
  `fillDays`, ...); views/hooks use these rather than inline arithmetic.
- **`lib/derive.ts`** — client-safe pure derivations shared by more than one
  view hook or by chart prop types: `deriveEffortCostPerMsg`, `daySpan` (the
  day range every per-day series is densified over), `zeroDay`,
  `shortSessionId`, and the `DailyByModelRow` / `DailyModelLegend` /
  `EffortCostRow` types. Type-only imports from `lib/usage.ts`.
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
- **`Summary.cache`** (`"warm" | "cold" | "rebuilt"`) reports how much parsing
  the load behind a response did. `cacheState(stats, ms)` in `lib/usage.ts`
  derives it from the existing `SweepStats`; the route passes it through
  `summarize()`'s `meta`. It is display-only (sidebar parse card).
- **API routes** (`app/api/usage`, `app/api/chat`) are thin adapters: parse query
  params, call into `lib/`, return JSON or a stream. No aggregation logic lives
  in the route handlers themselves.
- **`components/views/*`** are presentation — they receive an already-aggregated
  `Summary` as a prop (plus any hook results a view needs) and render it. They
  don't fetch, hold filter/sort/expand state, or derive data themselves; see
  "Client layering" below for where that state lives.

## Client layering

Mirrors the server-side split: hooks own state/fetching/derivation, components
are presentational (props/hook result in, JSX out — no `fetch`, no `useEffect`
for derived data, no inline sorting/aggregation/string-building in JSX).
Small derivations a shell component needs (effort items with cost labels,
preset day counts, breadcrumb title, sidebar counts) are exported pure
functions in the hook files, not logic inside the `.tsx`.

Routing is Next.js App Router with a route group: **`app/(dashboard)/layout.tsx`**
is a **server** layout that only reads the `sidebar_state` cookie (so the
collapsed/expanded state persists across reloads) and renders the client
`components/shell/dashboard-frame.tsx`, which is the composition — `TooltipProvider` ›
`DashboardProvider` › `SidebarProvider` › `AppSidebar` + `SidebarInset`
(`TopBar`, error banner, first-load skeleton / dimmed-on-refetch children,
footer) plus the chat `Sheet`. Each view is its own tiny route
(`app/(dashboard)/{page,sessions,projects,daily,efficiency,patterns}/page.tsx`)
that calls `useLoadedDashboard()` and renders one existing view from
`components/views/*` (`key={filters.rangeKey}` on Sessions/Projects so
per-range view state resets). `app/page.tsx` no longer exists; `app/layout.tsx`
only owns `<html>`/`<body>`/fonts/metadata. There are no URL search params —
filters live in memory only.

- **`hooks/use-dashboard.tsx`** — `DashboardProvider` / `useDashboard()`
  compose `useDashboardFilters` + `useUsageSummary` (both unchanged) plus the
  chat sheet's open state and chat history (`hooks/use-chat.ts` — held here
  because the Sheet unmounts its content when closed; the in-flight stream is
  aborted on unmount), and expose `{ filters, data, error, loading,
  refresh, effortOpts, chatOpen, setChatOpen }`. The provider lives in the
  layout, *above* the pages, so navigating between routes never refetches
  `/api/usage` — only a filter change or Refresh does.
  `useLoadedDashboard()` is the page-facing variant that narrows `data` to
  non-null (the layout only renders children once a Summary exists). The file
  also exports the shell's pure derivations: `navCounts`, `effortItems`
  (effort filter items with per-level cost labels), `parseStats` (card + footer strings), `isNavActive`, `effortLabel`, `viewTitle`.
  `rangeLabel` is a placeholder until mounted (`hooks/use-mounted.ts`) so the
  client-clock default range never causes a hydration mismatch.
- **`components/shell/*`** — `app-sidebar.tsx` (inset sidebar,
  `collapsible="icon"`; only `usePathname()` for the active item),
  `top-bar.tsx` (trigger, breadcrumb, preset segmented control, Ask Claude),
  `date-range-picker.tsx` (popover: presets with day counts, two-month range
  calendar, Cancel/Apply), `parse-stats.tsx` (sidebar-footer card + Refresh).
  All presentational.

- **`hooks/use-usage-summary.ts`** — owns fetching `/api/usage` for
  `{start, end, effort}`, in-flight request cancellation, loading/error state,
  and `refresh()` (manual re-scan, sends `refresh=1`). Uses React 19
  **`useEffectEvent`** so the effect depends only on the `{range, effort,
  refreshToken}` query key, not on the fetch function's identity — the fetch
  body reads fresh `setState`/reactive values without needing to be in the
  effect's own dependency array. Because a `useEffectEvent`-created function
  can only be called from an Effect (or another Effect Event) in the same
  component, `refresh()` can't call the fetcher directly — it bumps a
  `refreshToken` counter that the effect is keyed on, and a ref records
  whether the pending run is a manual refresh (sends `refresh=1`) vs. a
  filter-driven reload. `data` is never cleared while a request is in
  flight — the previous result stays on screen through a filter change or a
  refresh, and the dashboard layout dims the view on `loading` rather than
  swapping back to the skeleton.
- **`hooks/use-dashboard-filters.ts`** — date range + quick presets + effort
  selection state, plus the derived `rangeKey` (`${start}_${end}_${effort}`)
  used to reset per-range view state (search/sort/expand) via `key={rangeKey}`
  on the Sessions/Projects views. Each preset carries a `getRange()` function
  evaluated at click time (in `selectPreset`), not during render or at hook
  mount — presets like "Today"/"This month" depend on the current date, so
  precomputing them once would go stale after midnight, and calling
  `new Date()` during render is impure regardless. Which preset is active is
  tracked as its own `selectedPreset` key (set by `selectPreset`, cleared when
  a hand-picked popover range is applied via `applyRange`) rather than recomputed by re-calling `getRange()`
  at render to compare — that would reintroduce the same staleness and
  render-impurity problem for the highlight. Also exports a plain
  `effortOptions(data, effort)` helper (not a hook) that keeps the currently
  selected effort visible in the sidebar list even if the latest response's
  `availableEfforts` no longer includes it; it's a separate function rather
  than folded into the hook to avoid a circular dependency (`useUsageSummary`
  needs `range`/`effort` from this hook, so this hook can't also depend on
  `useUsageSummary`'s `data`).
- **`useDateRangeDraft`** (in `hooks/use-dashboard-filters.ts`) — draft state
  for the date popover: the draft range, visible month, preset rows with
  "Nd" hints, and `apply`/`cancel`. Nothing reaches the filters until Apply.
  Preset day counts are computed in the open handler (they call each preset's
  `getRange()`, which reads the current date), never during render. Its pure
  helpers (`parseKey`, `dayCount`, `draftLabel`, `draftHint`, `draftToValue`,
  `presetRows`, `segmentPresets`) are exported. `applyRange(value, presetKey)`
  on the filters hook commits a popover selection and keeps the preset
  highlight if it was an untouched preset pick.
- **`hooks/use-sortable.ts`** / **`hooks/use-expandable.ts`** — generic sort
  key/dir/toggle and open-row-id-set toggle, replacing logic that used to be
  duplicated across the Sessions/Daily/Efficiency views.
- **`hooks/use-overview-view.ts`** — the Overview's derivations, each an
  exported pure function (unit-tested in `hooks/__tests__/`) that
  `useOverviewView(summary, planPrice)` memoises: `deriveKpis` (value, delta vs
  `Summary.previous`, tone, per-day spark), `deriveTurnCost` (cost/message per
  `turnBuckets` bucket + the turns-151+ multiple/share and callout string),
  `derivePlanValue` (cumulative month line, plan reference, paid-off day,
  `linearProjection` to month end, hidden until 3 days have elapsed; "today" is `Summary.generatedAt`, not a
  render-time clock), `deriveDailyByModel` (+7-day moving average) and
  `deriveEffortCostPerMsg` (also feeds the Efficiency KPIs/note). Delta colour
  semantics live in `deltaTone` (cost up = warn, savings up = good); the arrow
  is part of the label text so direction never depends on colour alone.
- **`hooks/use-plan-price.ts`** — `usePlanPrice()` over `localStorage["plan-price"]`
  (20|100|200, default 200) via `useSyncExternalStore`; the server/hydration
  snapshot is the default, so there is no hydration mismatch.
- **`hooks/use-sessions-view.ts`** — search/filter/sort view model for the
  Sessions table (search matches project or session id) plus `derivePareto`
  (cumulative cost-share curve, top-10%/20% shares) and `deriveScatter`
  (messages vs cost per session; outlier = cost > 2x the median cost of its
  `floor(log2(messages))` bin). Both charts describe the whole range and ignore
  the table's search/model filters. Search text runs through
  **`useDeferredValue`** so typing stays responsive while a large
  `allSessions` list re-filters.
- **`hooks/use-daily-view.ts`** — sort + expand view model for the Daily
  table; `deriveDailyRows` (share-of-range bar width, per-model parts, cache
  share, tokens/$) and `deriveDailyStats`. `tokensPerDollar` counts *all* token
  types (cache reads dominate, which is the point).
- **`hooks/use-efficiency-view.ts`** — `deriveEfficiencyKpis`,
  `deriveModelRows` (per-model/per-effort metrics for the expandable table),
  `effortModelGrid` (cost/message matrix, models as columns, with intensity for
  shading) and `effortGridNote` (the generated takeaway).
- **`hooks/use-patterns-view.ts`** — `heatmapMarginals` (weekday/hour totals,
  peaks), `derivePatternStats` and `deriveHeatmapModel` (Monday-first rows with
  cell alpha, row totals, hourly bars) consumed by `components/heatmap.tsx`.
- **`hooks/use-projects-view.ts`** — list filter/selection state and
  `deriveProjectList` / `deriveProjectDetail` (stats, per-day per-model stacked
  cost from `ProjectRow.byDay[].models`, latest 15 sessions).
- **`components/charts.tsx`** — Recharts wrappers (`Sparkline`, `TurnCostBars`,
  `PlanValueChart`, `DailyStackedCost`, `EffortCostBars`, `ParetoCurve`,
  `SessionScatter`, `ModelLegend`). Purely presentational: they map
  already-derived rows onto Recharts and do no derivation: no aggregation,
  ratios, sorting or insight strings (they only pass values through, call
  format helpers such as `fmtUSDShort` for ticks, and take axis domains/ticks
  from the hook). Model colours come from one
  function, `modelColor()` in `lib/format.ts` (per model family), so a model has
  the same colour in every chart and table. **UI/logic rule**: `.tsx` files hold
  no arithmetic, sorting, filtering, ratio or insight-string building — that
  lives in the exported `derive*` functions above (only trivial format calls
  like `usdExact(x)` are allowed in JSX).
- Pure calculation helpers that don't need React state live as non-exported
  (or `export`ed for tests) functions inside the relevant hook file.
  **View hooks (`hooks/use-*-view.ts`) never import other view hooks**: a helper
  or type two of them need moves to `lib/` (`lib/derive.ts`, `lib/stats.ts`,
  `lib/format.ts`), never into a new `lib/` subdirectory.
- **Idle days count as zero.** `byDay`/`byDayModel` only contain days with
  usage, so anything time-based (7-day average, sparklines, the Projects day
  chart) densifies with `fillDays(rows, span.from, span.to, make)` first, over
  `daySpan(summary)`: bounded ranges run from the range start to the earlier of
  the range end and today (`generatedAt`); "all" runs first to last active day.
- **Dependency rule**: components import hooks + `lib` types/helpers + `ui`;
  hooks import `lib` (types, `effort`, `format`, `pricing` are fine) and
  React. Hooks and components **never** import runtime values from
  `lib/usage.ts` or `lib/usage-cache.ts` (server-only) — `import type` only.

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

The same pass also folds in the cross-cutting extras:

- **Project day x model** — each `ProjectRow.byDay[]` entry carries a slim
  `models: {model, cost}[]` (cost desc) so the Projects view can stack a
  project's daily cost by model without token counts.

- **Message position** (`turnBuckets`, `TURN_BUCKETS`) uses a per-conversation
  counter incremented for **every** record *before* the date/effort filters.
  `buildRecords` returns records globally ts-sorted, so the counter is a
  message's true position even when the session began before the selected
  range. Don't move the increment below a `continue`. The counter is keyed by
  `session + agent`: subagent (sidechain) transcripts carry the parent
  `sessionId` but are separate conversations, so `ParsedLine`/`UsageRecord`
  carry an `agent` field (`agentId`, else `"sidechain"`, else `""`) and
  `CACHE_VERSION` was bumped to 2 for that line-parsing change. `agent` is not
  part of the dedup key.
- **Previous window** (`Summary.previous`) is the same number of whole *local
  calendar days* ending the instant before `from` (computed with `Date` parts,
  so a DST change can't shift it by an hour). When the selected window ends in
  the future (`to > now`, e.g. "This month") the previous window is trimmed to
  the same elapsed length and `previous.partial` is `true`, so a partial period
  is never compared with a complete one (KPI/subtitle copy says "same point in
  previous period"). **`planMonth`** is always the CURRENT calendar month
  (containing `now`, not `to`), **all efforts**, independent of both the range
  and the effort filter — the plan card is "this month". Both need records
  outside the range, so they are folded in the same loop ahead of the range
  check. `previous` is `null` for unbounded (`"all"`) ranges. `summarize()`
  takes `opts.now` (default `Date.now()`) so tests can pin "today".
  `summarize()` always receives every record — the route never pre-filters.
- **`saved`, `cacheNetSaved` and `tokenCost`** come from real per-model rates
  (`lib/pricing.ts`, memoised; priced once per record) at summarize time, never
  from the cache — a pricing change needs no `CACHE_VERSION` bump. `saved` (on
  every bucket) is **gross** cache-read savings (read tokens at input rate minus
  cache-read rate). `Summary.cacheNetSaved` (and `previous.cacheNetSaved`) is
  net: gross minus the cache-write premium over plain input, using the exact
  write cost (TTL-aware). `tokenCost.cacheWrite` is the residual (cost minus
  input/output/cacheRead). Per-day `hours` use local hours, like
  `byHour`/`heatmap`.

## UI primitives (shadcn on Tailwind v3)

`components.json` targets shadcn `base-nova` (Base UI), but the project is on
**Tailwind v3** and stays there. Generated primitives in `components/ui/`
(sidebar, popover, calendar, tooltip, sheet, toggle-group, ...) are written for
Tailwind v4, so after `npx shadcn add ...` they must be rewritten by hand:
`w-(--x)` -> `w-[var(--x)]`, `data-open:`/`data-closed:`/`data-active:` ->
`data-[open]:` etc. (Base UI sets presence attributes such as `data-open`, not
`data-state`), `size-8!` -> `!size-8`, `has-data-[x]` -> `has-[[data-x]]`,
`outline-hidden` -> `outline-none`, `in-data-[..]` -> `group-data-[..]`,
`--spacing(n)` -> rem, and the `cn` import must be `@/lib/utils` (the CLI once
added the unrelated `cn` npm package). `--sidebar-*` colors are HSL triplets in
`app/globals.css` (used as `hsl(var(--sidebar-*))`) mapped in
`tailwind.config.ts`; `--radius-md` is defined there too because generated
classes reference it. Older generated files (`button.tsx`) still contain some
v4 syntax that silently does nothing.

## Rules

- **Never use `message.usage.output_tokens_details.thinking_tokens`** — it reads
  0 on nearly all `xhigh`/`max` messages and is not a reliable effort signal.
  Effort always comes from the `effort`/`perTurnEffort` log fields via
  `parseEffort()`.
- Filters (date range, effort) are applied **inside `summarize()`**, before
  aggregation, so every view/table/chart gets a consistently filtered `Summary`
  — never filter a subset of the data downstream in a single view.

## Verification

`npx tsc --noEmit && npm run lint && npm run build && npm test` must pass. `npm run lint`
now runs `eslint .` against the flat config in `eslint.config.mjs` (ESLint 9;
`eslint-config-next` for Next 16.3). `npm test` runs vitest
(`lib/__tests__/*.test.ts` and `hooks/__tests__/*.test.ts`; `server-only` is aliased to an empty module in
`vitest.config.mts` so `summarize()` is importable in plain Node; TZ is pinned
to America/New_York there because bucketing is local-time and the DST test
needs a DST zone). Add a test
when changing `summarize()`, `lib/stats.ts` or any exported `derive*` function. Manual/browser verification is
not required for routine changes.

Stack: Next.js 16.3.x + React 19.3.x, Node >=20.9 (see `engines` in
`package.json`).

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
