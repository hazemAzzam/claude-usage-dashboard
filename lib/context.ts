import { cacheState, getRecords, summarize, type Summary } from "./usage";
import { EFFORT_LABEL } from "./effort";
import { tokens, usdExact, usdFine } from "./format";

function totalsLine(s: Summary): string {
  const t = s.totals;
  const inTotal = t.input + t.cacheCreate + t.cacheRead;
  const cacheShare = inTotal > 0 ? Math.round((t.cacheRead / inTotal) * 100) : 0;
  return (
    `cost ${usdExact(t.cost)}, ${t.sessions} sessions, ${t.messages} assistant messages, ` +
    `tokens(input ${tokens(t.input)}, output ${tokens(t.output)}, cache-write ${tokens(t.cacheCreate)}, ` +
    `cache-read ${tokens(t.cacheRead)}, cache-read share ${cacheShare}% of input)`
  );
}

// A compact, information-dense text snapshot of the user's Claude Code usage,
// injected as system context so a local model can answer questions about it.
export async function buildUsageContext(): Promise<string> {
  const { records, builtAt, ms, stats } = await getRecords();
  const meta = { builtAt, parseMs: ms, cache: cacheState(stats, ms) };
  const all = summarize(records, "all", meta);
  const d30 = summarize(records, "30d", meta);
  const d7 = summarize(records, "7d", meta);

  const first = all.byDay[0]?.day ?? "n/a";
  const last = all.byDay[all.byDay.length - 1]?.day ?? "n/a";

  const lines: string[] = [];
  lines.push("# Claude Code usage data");
  lines.push(
    "Costs are API list-price equivalents of token usage, NOT the user's actual " +
      "Claude Code subscription bill (that is a flat fee). Use them to compare where tokens go.",
  );
  lines.push(`Data covers ${first} to ${last} over ${all.byDay.length} active days.`);
  lines.push("");
  lines.push("## Totals");
  lines.push(`- All time: ${totalsLine(all)}`);
  lines.push(`- Last 30 days: ${totalsLine(d30)}`);
  lines.push(`- Last 7 days: ${totalsLine(d7)}`);
  lines.push("");
  lines.push("## Cost by model (all time)");
  for (const m of all.byModel.filter((m) => m.cost > 0)) {
    lines.push(`- ${m.model}: ${usdExact(m.cost)}, ${m.messages} msgs, ${tokens(m.input + m.output + m.cacheCreate + m.cacheRead)} tokens`);
  }
  lines.push("");
  lines.push("## Top projects by cost (all time)");
  for (const p of all.byProject.slice(0, 12)) {
    lines.push(`- ${p.project}: ${usdExact(p.cost)}, ${p.sessions} sessions, ${p.messages} msgs`);
  }
  lines.push("");
  lines.push("## Most expensive sessions");
  for (const s of all.topSessions.slice(0, 10)) {
    lines.push(`- ${s.project} on ${s.day}: ${usdExact(s.cost)}, ${s.messages} msgs`);
  }
  lines.push("");
  lines.push("## Cost by model × effort (all time)");
  lines.push(
    "Effort is a reasoning-depth setting (low/medium/high/xhigh/max), not a model choice; " +
      "per-token price is identical across effort levels for a given model — cost/msg differs " +
      "purely because higher effort makes the model emit more output tokens per message.",
  );
  for (const m of all.byModel.filter((m) => m.cost > 0)) {
    for (const e of m.efforts ?? []) {
      lines.push(
        `- ${m.model} / ${EFFORT_LABEL[e.effort]}: ${e.messages} msgs, ` +
          `${Math.round(e.messages ? e.output / e.messages : 0)} output/msg, ` +
          `${usdFine(e.messages ? e.cost / e.messages : 0)}/msg`,
      );
    }
  }
  lines.push("");
  lines.push("## Daily cost (last 30 days)");
  for (const d of d30.byDay) {
    lines.push(`- ${d.day}: ${usdExact(d.cost)} (${d.messages} msgs)`);
  }
  return lines.join("\n");
}
