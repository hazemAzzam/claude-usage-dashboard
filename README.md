# Claude Code Usage Dashboard

A local-only [Next.js](https://nextjs.org) dashboard that reads your Claude Code
transcripts from `~/.claude/projects/**/*.jsonl` and turns them into a clear,
visual breakdown of your **token usage** and **API-equivalent cost** — sliced by
day, project, model, and session.

Everything runs on your own machine. No data ever leaves your computer, there is
no database, and no account or API key is required.

<p align="left">
  <img alt="Next.js" src="https://img.shields.io/badge/Next.js-16.3-black?logo=next.js" />
  <img alt="TypeScript" src="https://img.shields.io/badge/TypeScript-5-3178C6?logo=typescript&logoColor=white" />
  <img alt="React" src="https://img.shields.io/badge/React-19.3-61DAFB?logo=react&logoColor=white" />
  <img alt="Tailwind CSS" src="https://img.shields.io/badge/Tailwind-3-38BDF8?logo=tailwindcss&logoColor=white" />
  <img alt="shadcn/ui" src="https://img.shields.io/badge/shadcn%2Fui-components-000" />
  <img alt="Node" src="https://img.shields.io/badge/Node-%3E%3D20.9-5FA04E?logo=node.js&logoColor=white" />
</p>

> [!NOTE]
> **About the cost numbers.** Cost is the public **list-price equivalent** of
> your token usage — great for seeing *where* your tokens actually go. It is
> **not** your real Claude Code subscription bill (that's a flat monthly fee).
> Think of it as "what this usage *would* cost on the pay-as-you-go API."

---

## Table of contents

- [Why use this](#why-use-this)
- [Quick start](#quick-start)
- [What you get — the five views](#what-you-get--the-views)
- [Effort levels](#effort-levels)
- [Ask about your usage (optional chat panel)](#ask-about-your-usage-optional-chat-panel)
- [Configuration](#configuration)
- [How it works](#how-it-works)
- [Client layering](#client-layering)
- [Project structure](#project-structure)
- [Tech stack](#tech-stack)
- [Troubleshooting](#troubleshooting)
- [FAQ](#faq)

---

## Why use this

If you use Claude Code on a flat-fee plan, you never see a per-token bill — which
makes it hard to know which projects, models, or habits are burning the most
tokens. This dashboard answers questions like:

- 💸 Which projects are the most "expensive"?
- 🤖 How is my usage split across Opus / Sonnet / Haiku?
- 📈 Is my usage trending up over time?
- 🗂️ How much of my spend is cache reads vs. fresh input/output?
- 🕒 What times of day and days of the week do I code the most?

---

## Quick start

**Prerequisites:** [Node.js](https://nodejs.org) 20.9 or newer. That's it — you've
almost certainly already generated transcript data just by using Claude Code.

```bash
# 1. Install dependencies
npm install

# 2. Start the dashboard
npm run dev
```

Then open **<http://localhost:3000>**. The app auto-discovers your transcripts at
`~/.claude/projects` — no configuration needed.

### Production build

```bash
npm run build
npm run start
```

### Available scripts

| Script          | What it does                                   |
| --------------- | ---------------------------------------------- |
| `npm run dev`   | Start the dev server at `localhost:3000`       |
| `npm run build` | Create an optimized production build           |
| `npm run start` | Serve the production build                     |
| `npm run lint`  | Run ESLint (flat config)                        |

---

## What you get — the views

Every view shares a range filter at the top: **7 / 30 / 90 days / All time**, plus
a **Refresh** button that forces a re-scan of your transcripts.

### 📊 Overview
Your at-a-glance landing page:
- **KPI cards** — total cost, sessions, cost per message and net savings from
  caching, each with a change vs. the previous equal-length period (`n/a` when
  there is none, e.g. "All time") and a per-day sparkline
- **Long sessions cost more per turn** — average cost per message by position in
  the session, with a generated callout (and a `/compact` hint) about turns 151+
- **Value vs. your plan** — cumulative spend for the current calendar month
  against a $20 / $100 / $200 plan (your pick is remembered in the browser), the
  day the plan "paid off" and a projection to month end
- **Daily cost by model** — stacked bars plus a 7-day moving average
- **Cost per message by effort**
- An optional **chat panel** (see below), opened from the sidebar

### 🗒️ Sessions
Two insight cards — a **Pareto curve** (how much of your spend comes from the
costliest 10% / 20% of sessions) and a **length-vs-cost scatter** (log scales,
ringed = over 2x the typical cost for that length) — above a searchable
(project or session id), model-filterable, sortable table of **every** session
that expands into a per-model breakdown.

### 📁 Projects
A filterable master list plus a per-project detail: stats, cost over time
stacked by model, a by-model table and the latest sessions.

### 📅 Daily
A day-by-day table with a share-of-range bar split by model, tokens per $, and
expandable per-model rows, plus stats: active days, average cost/day (with the
weekend-vs-weekday note), peak day and tokens per $.

### 🔀 Compare days
Pick two days (slots A and B) from a strip of every day in the range and see
them side by side: cost, messages, turns per session and cost per message with
deltas, hour-by-hour paired bars, a generated "What changed" list, a per-model
cost difference, cost by token type and each day's top sessions. Quick picks
cover "vs previous day", "vs same day last week" and busiest vs quietest
weekday (disabled when the target has no data or falls outside the range).
If the range has no second active day, only the day strip and a hint show.

### 🧮 Efficiency
Four action KPIs (cost per message, saved by caching, best output per $ model,
Max-vs-Low effort multiple), a per-model table you can expand by effort level,
and an **effort x model grid** of cost per message with a generated takeaway.

### 🔥 Patterns
A **weekday x hour cost heatmap** with weekday totals on the right and hourly
totals below, plus four stats: peak hour, peak day, busiest-hour share and
active hours.

---

## Effort levels

Claude Code assistant messages carry a reasoning **effort** level — a top-level
`effort` field on each log line, with an optional `perTurnEffort` field that
overrides it for that one turn. The override only wins when it's itself a
recognised level (`low`/`medium`/`high`/`xhigh`/`max`) — a missing or garbage
`perTurnEffort` value falls back to `effort` instead of masking it. The
dashboard reads this via `lib/effort.ts` and lets you filter and break down
usage by it.

| Log value | UI label  |
| --------- | --------- |
| `low`     | Low       |
| `medium`  | Medium    |
| `high`    | High      |
| `xhigh`   | Extra     |
| `max`     | Max       |
| *(missing/unrecognised)* | Unknown |

Claude Code only started writing the `effort` field after 2.1.28, so lines from
2.1.28 and earlier have none. Those lines fall into the **Unknown** bucket
rather than being dropped, so totals still add up. Most of them come from
subagent transcripts (`<project>/<session>/subagents/*.jsonl`), so on an
older history Unknown can be several percent of messages. It shrinks as those
logs age out of the date range you're viewing.

**Why `thinking_tokens` is ignored.** It's tempting to infer effort from
`message.usage.output_tokens_details.thinking_tokens`, but that field is
unreliable — it reads `0` on nearly all `xhigh`/`max` messages in practice, so
it would systematically under-report high-effort usage. The dashboard never
uses it; effort always comes from the `effort`/`perTurnEffort` log fields.

**Same price, more output.** Per-token pricing (`lib/pricing.ts`) does not vary
by effort — a `medium`-effort message and a `max`-effort message on the same
model are billed at the same $/token rate. Cost per message rises with effort
only because higher effort makes the model *generate more output tokens* per
turn. Real-world example (Opus 4.8, average output tokens per assistant
message): medium ≈ 1385, high ≈ 1575, xhigh ≈ 2064, max ≈ 3100.

**Using it:** the **effort filter** in the sidebar's "Effort" group is
a single-select list (with cost per level) — "All efforts" plus one item per level seen in the
current date window (`availableEfforts`); picking one narrows every view's
data server-side, the same way the date range does. The **Efficiency** view's
"By model" table lets any model with more than one effort level in range
expand to a per-effort breakdown — mirroring how the Daily and Sessions tables
expand into a per-model breakdown — and the **Effort x model** grid compares
cost per message across both. The **Overview** shows a "Cost per message by
effort" chart.

---

## Ask about your usage (optional chat panel)

The Overview includes an optional chat panel wired to a **local
[LM Studio](https://lmstudio.ai) server** (any OpenAI-compatible local LLM works).
It answers questions about *your own* parsed usage data — a compact summary is
injected as the model's context, so it can reason about your real numbers.

Try asking:
- *"Which projects cost me the most?"*
- *"How can I cut my Claude Code costs?"*
- *"What's my most expensive day this month?"*

**This is entirely optional.** If LM Studio isn't running, the chat panel simply
shows an error and the rest of the dashboard works perfectly.

**To enable it:**
1. Install [LM Studio](https://lmstudio.ai), load a model, and start its local
   server.
2. If your setup differs from the defaults, set `LM_STUDIO_URL` /
   `LM_STUDIO_MODEL` (see [Configuration](#configuration)).

---

## Configuration

All settings are **optional** — every value has a sensible default. To override,
copy `.env.example` to `.env.local` and edit:

```bash
cp .env.example .env.local
```

| Variable              | Default                        | Purpose                                                       |
| --------------------- | ------------------------------ | ------------------------------------------------------------- |
| `CLAUDE_PROJECTS_DIR` | `~/.claude/projects`           | Where your Claude Code transcripts live                       |
| `USAGE_CACHE_DIR`     | `./.cache` (project-relative)  | Where the persistent parse-cache index file is written        |
| `USAGE_CACHE`         | *(unset, cache on)*             | Set to `off` to disable the **on-disk cache file** only — parsing stays in-memory-incremental for the process lifetime, it just isn't persisted across restarts. Use `/api/usage?rebuild=1` to force a full reparse |
| `LM_STUDIO_URL`       | `http://localhost:1234/v1`     | LM Studio OpenAI-compatible base URL (chat panel only)        |
| `LM_STUDIO_MODEL`     | `google/gemma-4-e4b`           | Model id to chat with — must match a model loaded in LM Studio |

---

## How it works

```
~/.claude/projects/**/*.jsonl   ──▶   lib/usage-cache.ts   ──▶   lib/usage.ts   ──▶   /api/usage   ──▶   React + Recharts UI
   (Claude Code transcripts)          (parse cache)              (aggregate)         (JSON)             (charts & tables)
```

- **`lib/usage-cache.ts`** — the persistent parse cache. Parsing every transcript
  line on every request doesn't scale as logs grow, so each `.jsonl` file is parsed
  **once**. The parsed lines plus a per-file byte **offset** ("how far we've read")
  are persisted to `.cache/usage-index.json`. On each load it `stat`s every file:
  unchanged files are reused as-is, grown files are read only from their saved
  offset onward (an incremental append), shrunk/replaced files are fully reparsed,
  and deleted files drop out of the index. A trailing partial line (no newline yet)
  is parsed for that one request only and never persisted, so a concurrent writer
  mid-line doesn't corrupt the cache. The same dedup/sort/cost pipeline then runs
  over the cached lines every time, so cached output is identical to a full reparse.
  Cost and day are **not** stored in the cache — they're computed at merge time, so
  a pricing change in `lib/pricing.ts` never requires a cache rebuild.
  - **Incremental refresh** — the dashboard's **Refresh** button bypasses the
    5-second in-memory TTL and re-runs the same incremental load (cheap: only new
    bytes are parsed).
  - **Full rebuild** — add `?rebuild=1` to `/api/usage` to discard the cache
    entirely and do a full reparse of every file (useful after changing
    `CLAUDE_PROJECTS_DIR`, or if you suspect the cache is out of sync).
  - **Resetting the cache** — delete the `.cache/` directory to force a full
    reparse on the next request; it's regenerated automatically.
- **`lib/usage.ts`** — aggregation only now (`summarize()`); it gets already-parsed
  records from `lib/usage-cache.ts` instead of scanning transcripts itself.
- **`lib/pricing.ts`** — per-model rates in $/1M tokens. Cache writes are priced at
  1.25× input (5-minute TTL) or 2× (1-hour TTL); cache reads at 0.1× input. Model
  matching is longest-prefix, so new model variants degrade gracefully.
- **`lib/effort.ts`** — pure, client-safe module defining the `Effort` type, its
  display order, and UI labels (see [Effort levels](#effort-levels)). Both the
  server-only aggregation in `lib/usage.ts` and client components import from it.
- **`app/api/usage/route.ts`** — aggregates the parsed data for the requested range
  (and optional `effort` filter) and returns it as JSON.
- **`hooks/`** — all client-side state, fetching, and derived view models. the route pages under `app/(dashboard)/`
  and `components/views/*` are presentational: they take hook results/props in and render
  JSX out, with no `fetch`, `useEffect`, or inline sorting/aggregation of their own. See
  [Client layering](#client-layering) below.
- The UI is built with **shadcn/ui** components and **Recharts** charts.

> [!TIP]
> When Anthropic's pricing changes, update the rate table in `lib/pricing.ts`.
> Unknown model strings are priced at `$0` until you add them — no cache rebuild
> needed, since cost is computed at merge time, not cached.

---

## Client layering

The client is split the same way React 19 encourages: **hooks own state, fetching,
and derived data; components are presentational.** `app/(dashboard)/layout.tsx`
mounts a `DashboardProvider` (`useDashboardFilters` + `useUsageSummary`) so filters and the
fetched summary are shared across the per-view routes (`/`, `/sessions`, `/projects`,
`/daily`, `/compare`, `/efficiency`, `/patterns`) without refetching on navigation — no `fetch`,
`useEffect`, or inline sorting/aggregation lives in the pages or `components/`. See `CLAUDE.md` for the full hook list and the server-only import rule.

---

## Project structure

```
claude-usage-dashboard/
├── app/
│   ├── page.tsx              # App shell: pure composition — wires hooks to views
│   ├── layout.tsx            # Root layout (dark theme, Geist fonts, metadata)
│   ├── globals.css           # Tailwind base + shadcn theme variables
│   ├── fonts/                # Bundled Geist Sans / Geist Mono
│   └── api/
│       ├── usage/route.ts    # GET /api/usage — scan + aggregate transcripts
│       └── chat/route.ts     # POST /api/chat — proxy to LM Studio (SSE stream)
├── hooks/                    # Client state/fetching/derivation — see Client layering
│   ├── use-usage-summary.ts    # Fetches /api/usage, abort-cancels stale requests, refresh()
│   ├── use-dashboard-filters.ts # Date range + presets + effort selection, rangeKey
│   ├── use-sortable.ts         # Generic sort key/dir/toggle
│   ├── use-expandable.ts       # Generic expand/collapse row-id set
│   ├── use-overview-view.ts    # Overview derivations (KPIs, turn cost, plan value, ...)
│   ├── use-plan-price.ts       # Plan price ($20/$100/$200) in localStorage
│   ├── use-sessions-view.ts    # Sessions search/filter/sort + Pareto + scatter
│   ├── use-daily-view.ts       # Daily rows (model split bar), stats, sort + expand
│   ├── use-compare-view.ts     # Compare-days selection state + pure diff derivations
│   ├── use-efficiency-view.ts  # Efficiency KPIs, model table, effort x model grid
│   ├── use-patterns-view.ts    # Heatmap marginals + pattern stats
│   └── use-projects-view.ts    # Projects list filter + detail model
├── components/
│   ├── views/                # overview, sessions, projects, daily, compare, efficiency, patterns — presentational
│   ├── ui/                   # shadcn primitives
│   ├── charts.tsx            # Recharts wrappers (sparkline, turn-cost bars, plan value, stacked daily cost, Pareto, scatter)
│   ├── chat-panel.tsx        # Streaming chat UI
│   ├── shell/                # app-sidebar, top-bar, date-range-picker, parse-stats — presentational
│   ├── heatmap.tsx           # Weekday × hour cost heatmap with marginal totals
│   └── stats.tsx             # Shared atoms (KPIs, tables, sort headers)
├── lib/
│   ├── usage.ts              # Aggregation (summarize()) over already-parsed records
│   ├── usage-cache.ts        # Persistent parse cache: incremental scan/parse/dedup (server-only)
│   ├── usage-types.ts        # Shared UsageRecord type (avoids a usage.ts <-> usage-cache.ts cycle)
│   ├── pricing.ts            # Per-model $/1M rates + cost calculation
│   ├── effort.ts             # Effort type/order/labels — pure, client-safe
│   ├── context.ts            # Builds usage summary for the chat panel
│   ├── llm.ts                # LM Studio config
│   ├── format.ts             # Number / date formatters
│   └── utils.ts              # cn() class merger
├── .cache/                   # Persisted parse-cache index (gitignored, machine-local)
├── .env.example              # Documented optional env vars
└── package.json
```

---

## Tech stack

- **[Next.js 16.3](https://nextjs.org)** (App Router, Turbopack) + **TypeScript**
- **[React 19.3](https://react.dev)**
- **[shadcn/ui](https://ui.shadcn.com)** components
- **[Recharts](https://recharts.org)** for charts
- **[Tailwind CSS](https://tailwindcss.com)** for styling
- **[lucide-react](https://lucide.dev)** icons
- **Geist** Sans + Mono fonts (bundled locally)

No database, no backend service — just your local filesystem.

---

## Troubleshooting

**The dashboard is empty / "no data".**
Make sure you've actually used Claude Code (so transcripts exist) and that they're
at `~/.claude/projects`. If they live elsewhere, set `CLAUDE_PROJECTS_DIR` in
`.env.local` and click **Refresh**.

**My numbers look stale after a new session.**
Parsed data is cached in memory for 5 seconds (and persisted to
`.cache/usage-index.json` between server restarts). Click **Refresh** to force an
incremental re-scan, or add `?rebuild=1` to `/api/usage` (or delete `.cache/`) to
force a full reparse.

**The numbers look wrong / out of sync after editing or moving transcript files by hand.**
The cache detects size/mtime/inode changes automatically, but if you suspect it's
out of sync (e.g. after bulk-editing files with a tool that preserves mtime),
delete the `.cache/` directory or hit `/api/usage?rebuild=1` to force a clean
full reparse.

**A model shows `$0` cost.**
Its model id isn't in the pricing table yet. Add it to `lib/pricing.ts`.

**The chat panel shows an error.**
That's expected if LM Studio isn't running — the rest of the dashboard is
unaffected. Start LM Studio with a loaded model and a running local server, then
confirm `LM_STUDIO_URL` / `LM_STUDIO_MODEL` match your setup.

---

## FAQ

**Does this send my data anywhere?**
No. All parsing happens locally and your transcripts never leave your machine. The
only optional network call is to your *own* local LM Studio server for the chat
panel.

**Is the cost my actual bill?**
No — it's the public list-price equivalent of your token usage, useful for
understanding *where* tokens go. Your Claude Code subscription is a flat fee.

**Do I need an Anthropic API key?**
No. The dashboard only reads local transcript files.

---

Built with ❤️ for Claude Code power users.
