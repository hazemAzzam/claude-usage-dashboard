"use client";

import Link from "next/link";
import { ArrowLeftRightIcon } from "lucide-react";
import type { Summary } from "@/lib/usage";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Empty } from "@/components/stats";
import { PairedHourBars, DivergingBars, SLOT_COLOR, SlotBadge, TokenMixBars } from "@/components/charts";
import { TOKEN_TYPES, useCompareView, type Finding, type SlotView, type Tone } from "@/hooks/use-compare-view";

const TONE_CLASS: Record<Tone, string> = {
  warn: "text-delta-bad",
  good: "text-delta-good",
  neutral: "text-soft-foreground",
};
const DOT_CLASS: Record<Finding["tone"], string> = {
  up: "bg-delta-bad",
  down: "bg-delta-good",
  neutral: "bg-soft-foreground",
};

export function CompareView({ data }: { data: Summary }) {
  const v = useCompareView(data);
  if (!v.hasDays) return <Empty />;
  const [slotA, slotB] = v.slots;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <p className="text-sm text-muted-foreground">{v.hint}</p>
        <div className="flex items-center gap-2">
          <SlotButton s={slotA} onSelect={() => v.setSlot("A")} />
          <button
            type="button"
            onClick={v.swap}
            disabled={!v.canSwap}
            aria-label="Swap A and B"
            className="inline-flex size-8 items-center justify-center rounded-md border text-muted-foreground hover:bg-accent hover:text-accent-foreground disabled:cursor-not-allowed disabled:opacity-40"
          >
            <ArrowLeftRightIcon className="size-4" />
          </button>
          <SlotButton s={slotB} onSelect={() => v.setSlot("B")} />
        </div>
      </div>

      <div role="group" aria-label="Quick comparisons" className="inline-flex flex-wrap rounded-md border p-0.5">
        {v.quick.map((q) => (
          <button
            key={q.kind}
            type="button"
            disabled={q.disabled}
            aria-pressed={q.active}
            onClick={() => v.applyQuick(q.kind)}
            className={`rounded px-2.5 py-1 text-xs disabled:cursor-not-allowed disabled:opacity-40 ${q.active ? "bg-accent text-accent-foreground" : "text-muted-foreground hover:bg-accent/60"}`}
          >
            {q.label}
          </button>
        ))}
      </div>

      <div role="group" aria-label="Pick a day" className="flex gap-1 overflow-x-auto rounded-lg border p-2">
        {v.strip.map((d) => (
          <button
            key={d.day}
            type="button"
            aria-label={d.aria}
            title={d.aria}
            onClick={() => v.pick(d.day)}
            className={`flex w-7 shrink-0 flex-col items-center justify-end gap-1 rounded px-0.5 pb-1 hover:bg-accent ${d.isA || d.isB ? "bg-accent" : ""}`}
          >
            <span className="flex h-10 w-full items-end">
              <span
                className="w-full rounded-[2px]"
                style={{ height: `${d.heightPct}%`, minHeight: 3, background: d.isA ? SLOT_COLOR.A : d.isB ? SLOT_COLOR.B : "oklch(var(--effort-unknown))" }}
              />
            </span>
            <span className="font-mono text-[10px] tabular-nums">{d.n}</span>
            {(d.isA || d.isB) && <span className="font-mono text-[9px] font-semibold">{d.isA && d.isB ? "AB" : d.isA ? "A" : "B"}</span>}
          </button>
        ))}
      </div>

      {!v.needsSecondDay && <Comparison v={v} slotA={slotA} slotB={slotB} />}
    </div>
  );
}

type CompareState = ReturnType<typeof useCompareView>;

function Comparison({ v, slotA, slotB }: { v: CompareState; slotA: SlotView; slotB: SlotView }) {
  return (
    <>
      <section className="grid grid-cols-2 gap-4 md:grid-cols-4">
        {v.cards.map((c) => (
          <Card key={c.label}>
            <CardContent className="pt-5">
              <div className="flex items-center justify-between gap-2 text-xs">
                <span className="uppercase tracking-wide text-muted-foreground">{c.label}</span>
                <span className={`font-mono tabular-nums ${TONE_CLASS[c.tone]}`}>
                  <span className="sr-only">A vs B: </span>
                  {c.delta}
                </span>
              </div>
              <div className="mt-2 space-y-1 font-mono text-sm tabular-nums">
                <div className="flex items-center gap-2"><SlotBadge slot="A" />{c.a}</div>
                <div className="flex items-center gap-2 text-muted-foreground"><SlotBadge slot="B" />{c.b}</div>
              </div>
            </CardContent>
          </Card>
        ))}
      </section>

      <div className="grid gap-4 lg:grid-cols-[3fr_2fr]">
        <Card>
          <CardHeader className="flex-row items-center justify-between gap-2 space-y-0">
            <CardTitle className="text-sm font-medium">Hour by hour <span className="ml-1 text-xs font-normal text-muted-foreground">cost per hour, local time</span></CardTitle>
            <div className="flex gap-3 font-mono text-xs">
              <span className="inline-flex items-center gap-1.5"><SlotBadge slot="A" />{slotA.label}</span>
              <span className="inline-flex items-center gap-1.5"><SlotBadge slot="B" />{slotB.label}</span>
            </div>
          </CardHeader>
          <CardContent><PairedHourBars rows={v.hours} summary={v.hoursSummary} /></CardContent>
        </Card>
        <Card>
          <CardHeader className="space-y-0">
            <CardTitle className="text-sm font-medium">What changed <span className="ml-1 text-xs font-normal text-muted-foreground">A compared with B</span></CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2.5 text-sm">
              {v.findings.map((f) => (
                <li key={f.text} className="flex gap-2.5">
                  <span className={`mt-1.5 size-1.5 shrink-0 rounded-full ${DOT_CLASS[f.tone]}`} aria-hidden />
                  {f.text}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card>
          <CardHeader className="space-y-0">
            <CardTitle className="text-sm font-medium">Cost difference by model <span className="ml-1 text-xs font-normal text-muted-foreground">A minus B · right = A spent more</span></CardTitle>
          </CardHeader>
          <CardContent>{v.models.length ? <DivergingBars rows={v.models} /> : <p className="text-sm text-muted-foreground">No model spend on either day.</p>}</CardContent>
        </Card>
        <Card>
          <CardHeader className="space-y-0">
            <CardTitle className="text-sm font-medium">Where the dollars went <span className="ml-1 text-xs font-normal text-muted-foreground">cost by token type</span></CardTitle>
          </CardHeader>
          <CardContent><TokenMixBars rows={v.tokenRows} types={TOKEN_TYPES} /></CardContent>
        </Card>
        <Card>
          <CardHeader className="flex-row items-center justify-between space-y-0">
            <CardTitle className="text-sm font-medium">Top sessions</CardTitle>
            <Link href="/sessions" className="text-xs text-muted-foreground underline-offset-2 hover:underline">Open Sessions</Link>
          </CardHeader>
          <CardContent className="space-y-3">
            {v.tops.map((g) => (
              <div key={g.slot} className="space-y-1">
                <div className="flex items-center gap-1.5 font-mono text-xs text-muted-foreground"><SlotBadge slot={g.slot} />{g.slot} · {g.dayLabel}</div>
                {g.rows.length === 0 && <p className="text-xs text-muted-foreground">No sessions.</p>}
                {g.rows.map((r) => (
                  <div key={r.session} className="grid grid-cols-[72px_1fr_auto_auto] items-center gap-2 px-1 py-0.5 text-xs">
                    <span className="font-mono">{r.id}</span>
                    <span className="truncate text-muted-foreground">{r.project}</span>
                    <span className="font-mono tabular-nums text-muted-foreground">{r.turnsLabel}</span>
                    <span className="font-mono tabular-nums">{r.costLabel}</span>
                  </div>
                ))}
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </>
  );
}

function SlotButton({ s, onSelect }: { s: SlotView; onSelect: () => void }) {
  return (
    <button
      type="button"
      aria-pressed={s.active}
      aria-label={s.aria}
      onClick={onSelect}
      className="flex items-center gap-2 rounded-md border px-2.5 py-1.5 text-left text-sm"
      style={{ borderColor: s.active ? SLOT_COLOR[s.slot] : undefined }}
    >
      <SlotBadge slot={s.slot} />
      <span className="flex flex-col leading-tight">
        <span className="font-mono">{s.label}</span>
        <span className="text-[11px] text-muted-foreground">{s.dow}</span>
      </span>
    </button>
  );
}
