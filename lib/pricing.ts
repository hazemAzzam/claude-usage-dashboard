// Pricing per 1,000,000 tokens (USD). Cache write = 1.25x input (5m TTL) or
// 2x input (1h TTL); cache read = 0.1x input. These are the public list prices —
// your actual Claude Code subscription is a flat fee, so treat these costs as the
// API-equivalent value of your usage, useful for spotting where tokens go.

export interface Rates {
  input: number; // $ / 1M input tokens
  output: number; // $ / 1M output tokens
  cacheWrite5m: number; // $ / 1M tokens written to 5-minute cache
  cacheWrite1h: number; // $ / 1M tokens written to 1-hour cache
  cacheRead: number; // $ / 1M tokens read from cache
}

function rates(input: number, output: number): Rates {
  return {
    input,
    output,
    cacheWrite5m: input * 1.25,
    cacheWrite1h: input * 2,
    cacheRead: input * 0.1,
  };
}

// Matched longest-prefix-first against the model id reported in the logs.
const TABLE: Array<[string, Rates]> = [
  ["claude-fable-5", rates(10, 50)],
  ["claude-mythos-5", rates(10, 50)],
  ["claude-opus-4-8", rates(5, 25)],
  ["claude-opus-4-7", rates(5, 25)],
  ["claude-opus-4-6", rates(5, 25)],
  ["claude-opus-4-5", rates(5, 25)],
  ["claude-opus-4-1", rates(15, 75)],
  ["claude-opus-4", rates(15, 75)],
  ["claude-opus", rates(15, 75)],
  ["claude-sonnet-4-6", rates(3, 15)],
  ["claude-sonnet-4-5", rates(3, 15)],
  ["claude-sonnet-4", rates(3, 15)],
  ["claude-3-7-sonnet", rates(3, 15)],
  ["claude-sonnet", rates(3, 15)],
  ["claude-haiku-4-5", rates(1, 5)],
  ["claude-3-5-haiku", rates(0.8, 4)],
  ["claude-3-haiku", rates(0.25, 1.25)],
  ["claude-haiku", rates(1, 5)],
];

const ZERO: Rates = rates(0, 0);

export function ratesFor(model: string | undefined | null): Rates {
  if (!model) return ZERO;
  const m = model.toLowerCase();
  for (const [prefix, r] of TABLE) {
    if (m.startsWith(prefix)) return r;
  }
  return ZERO;
}

export interface Usage {
  input_tokens?: number;
  output_tokens?: number;
  cache_creation_input_tokens?: number;
  cache_read_input_tokens?: number;
  cache_creation?: {
    ephemeral_5m_input_tokens?: number;
    ephemeral_1h_input_tokens?: number;
  };
}

// Cost in USD for a single assistant message's usage block.
export function costOf(model: string | undefined, usage: Usage): number {
  const r = ratesFor(model);
  const input = usage.input_tokens ?? 0;
  const output = usage.output_tokens ?? 0;
  const cacheRead = usage.cache_read_input_tokens ?? 0;
  const cacheCreate = usage.cache_creation_input_tokens ?? 0;

  // Split cache writes by TTL when the breakdown is present; otherwise price as 5m.
  const ttl5m = usage.cache_creation?.ephemeral_5m_input_tokens;
  const ttl1h = usage.cache_creation?.ephemeral_1h_input_tokens;
  let cacheWriteCost: number;
  if (ttl5m !== undefined || ttl1h !== undefined) {
    cacheWriteCost =
      ((ttl5m ?? 0) * r.cacheWrite5m + (ttl1h ?? 0) * r.cacheWrite1h) / 1e6;
  } else {
    cacheWriteCost = (cacheCreate * r.cacheWrite5m) / 1e6;
  }

  return (
    (input * r.input + output * r.output + cacheRead * r.cacheRead) / 1e6 +
    cacheWriteCost
  );
}
