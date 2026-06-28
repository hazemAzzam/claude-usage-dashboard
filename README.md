# Claude Code Usage Dashboard

A local-only [Next.js](https://nextjs.org) dashboard that reads your Claude Code
transcripts from `~/.claude/projects/**/*.jsonl` and turns them into a clear,
visual breakdown of your **token usage** and **API-equivalent cost** — sliced by
day, project, model, and session.

Everything runs on your own machine. No data ever leaves your computer, there is
no database, and no account or API key is required.

<p align="left">
  <img alt="Next.js" src="https://img.shields.io/badge/Next.js-14-black?logo=next.js" />
  <img alt="TypeScript" src="https://img.shields.io/badge/TypeScript-5-3178C6?logo=typescript&logoColor=white" />
  <img alt="React" src="https://img.shields.io/badge/React-18-61DAFB?logo=react&logoColor=white" />
  <img alt="Tailwind CSS" src="https://img.shields.io/badge/Tailwind-3-38BDF8?logo=tailwindcss&logoColor=white" />
  <img alt="shadcn/ui" src="https://img.shields.io/badge/shadcn%2Fui-components-000" />
  <img alt="Node" src="https://img.shields.io/badge/Node-%3E%3D18-5FA04E?logo=node.js&logoColor=white" />
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
- [What you get — the five views](#what-you-get--the-five-views)
- [Ask about your usage (optional chat panel)](#ask-about-your-usage-optional-chat-panel)
- [Configuration](#configuration)
- [How it works](#how-it-works)
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

**Prerequisites:** [Node.js](https://nodejs.org) 18 or newer. That's it — you've
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
| `npm run lint`  | Run ESLint                                      |

---

## What you get — the five views

Every view shares a range filter at the top: **7 / 30 / 90 days / All time**, plus
a **Refresh** button that forces a re-scan of your transcripts.

### 📊 Overview
Your at-a-glance landing page:
- **KPI cards** — total cost, session count, total tokens, and cache-read share
- **Cost over time** — an area/line chart with one toggleable line per model
- **Cost by model** — donut chart with legend
- **Top projects** — bar chart of your biggest spenders
- **Token breakdown** — input / output / cache-write / cache-read
- **Most expensive sessions** — your top 12 sessions
- An optional **chat panel** (see below)

### 🗒️ Sessions
A full, sortable, filterable table of **every** coding session. Filter by project
name or model, and sort by any column (date, cost, messages, input/output/cache
tokens).

### 📁 Projects
Per-project drill-down. Pick a project from the cost-ranked sidebar to see its
cost over time, model breakdown, daily stats, and session list.

### 📅 Daily
A day-by-day table (cost, messages, input, output, cache-create, cache-read,
cache share %) plus summary stats: active days, average cost/day, and your
busiest day.

### 🔥 Patterns
Discover your coding habits with a **weekday × hour-of-day cost heatmap** and an
hour-of-day bar chart — surfacing your peak hour, peak weekday, and active hours.

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
| `LM_STUDIO_URL`       | `http://localhost:1234/v1`     | LM Studio OpenAI-compatible base URL (chat panel only)        |
| `LM_STUDIO_MODEL`     | `google/gemma-4-e4b`           | Model id to chat with — must match a model loaded in LM Studio |

---

## How it works

```
~/.claude/projects/**/*.jsonl   ──▶   lib/usage.ts   ──▶   /api/usage   ──▶   React + Recharts UI
   (Claude Code transcripts)          (parse + price)      (aggregate)        (charts & tables)
```

- **`lib/usage.ts`** — recursively scans your transcripts line by line, keeps only
  `assistant` messages that carry a `usage` block, and **deduplicates** by
  `message.id:requestId` (the same message can appear across multiple transcript
  files due to Claude Code checkpointing). Parsed records are cached in memory for
  30 seconds; **Refresh** forces a fresh scan.
- **`lib/pricing.ts`** — per-model rates in $/1M tokens. Cache writes are priced at
  1.25× input (5-minute TTL) or 2× (1-hour TTL); cache reads at 0.1× input. Model
  matching is longest-prefix, so new model variants degrade gracefully.
- **`app/api/usage/route.ts`** — aggregates the parsed data for the requested range
  and returns it as JSON.
- The UI is built with **shadcn/ui** components and **Recharts** charts.

> [!TIP]
> When Anthropic's pricing changes, update the rate table in `lib/pricing.ts`.
> Unknown model strings are priced at `$0` until you add them.

---

## Project structure

```
claude-usage-dashboard/
├── app/
│   ├── page.tsx              # App shell: range + view switcher, data fetching
│   ├── layout.tsx            # Root layout (dark theme, Geist fonts, metadata)
│   ├── globals.css           # Tailwind base + shadcn theme variables
│   ├── fonts/                # Bundled Geist Sans / Geist Mono
│   └── api/
│       ├── usage/route.ts    # GET /api/usage — scan + aggregate transcripts
│       └── chat/route.ts     # POST /api/chat — proxy to LM Studio (SSE stream)
├── components/
│   ├── views/                # overview, sessions, projects, daily, patterns
│   ├── ui/                   # shadcn primitives
│   ├── charts.tsx            # Recharts wrappers
│   ├── chat-panel.tsx        # Streaming chat UI
│   ├── heatmap.tsx           # Weekday × hour cost heatmap
│   └── stats.tsx             # Shared atoms (KPIs, tables, sort headers)
├── lib/
│   ├── usage.ts              # Transcript scanning, dedup, aggregation, cache
│   ├── pricing.ts            # Per-model $/1M rates + cost calculation
│   ├── context.ts            # Builds usage summary for the chat panel
│   ├── llm.ts                # LM Studio config
│   ├── format.ts             # Number / date formatters
│   └── utils.ts              # cn() class merger
├── .env.example              # Documented optional env vars
└── package.json
```

---

## Tech stack

- **[Next.js 14](https://nextjs.org)** (App Router) + **TypeScript**
- **[React 18](https://react.dev)**
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
Parsed data is cached for 30 seconds. Click **Refresh** to force a re-scan.

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
