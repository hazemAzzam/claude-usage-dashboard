# CLAUDE.md

A local-only Next.js (App Router) dashboard that parses Claude Code transcripts
from `~/.claude/projects/**/*.jsonl` and shows API-equivalent token cost/usage
sliced by day, project, model, session, and effort level. No DB, no account —
everything is derived from local JSONL files on each request (cached 30s).

## Layering

- **`lib/effort.ts`** and **`lib/pricing.ts`** are pure, single sources of truth
  — no `node:*` imports, safe to import from client components. `lib/effort.ts`
  owns the `Effort` type/order/labels; `lib/pricing.ts` owns per-model $/1M rates.
- **`lib/usage.ts`** is server-only (uses `node:fs`/`node:readline` to scan
  transcripts). Client components must only import **types** from it (`Summary`,
  `ModelBucket`, `EffortBucket`, etc.), never the module's runtime code.
- **API routes** (`app/api/usage`, `app/api/chat`) are thin adapters: parse query
  params, call into `lib/`, return JSON or a stream. No aggregation logic lives
  in the route handlers themselves.
- **`components/views/*`** are presentation — they receive an already-aggregated
  `Summary` as a prop and render it. They don't fetch or filter data themselves;
  `app/page.tsx` owns fetch/filter state and passes the result down.

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
