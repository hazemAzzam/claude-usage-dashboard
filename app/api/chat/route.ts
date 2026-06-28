import { NextRequest } from "next/server";
import { buildUsageContext } from "@/lib/context";
import { LLM, type ChatMessage } from "@/lib/llm";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const SYSTEM = `You are a helpful analyst embedded in a local "Claude Code Usage" dashboard.
You answer the user's questions about THEIR Claude Code usage and costs, using only the
usage data provided below. Be concise and concrete: cite real numbers from the data, and
when the user asks how to cut costs, give specific, actionable tips grounded in their data
(e.g. which projects/models dominate spend, how cache reads lower cost). If the data does
not contain the answer, say so plainly instead of guessing. Costs shown are list-price
equivalents of token usage, not the user's actual subscription bill.`;

export async function POST(req: NextRequest) {
  let body: { messages?: ChatMessage[] };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const history = Array.isArray(body.messages) ? body.messages : [];
  const turns = history
    .filter((m) => m && (m.role === "user" || m.role === "assistant") && typeof m.content === "string")
    .slice(-12); // keep context small for the local model

  if (!turns.some((m) => m.role === "user")) {
    return Response.json({ error: "No user message" }, { status: 400 });
  }

  let context: string;
  try {
    context = await buildUsageContext();
  } catch (e) {
    return Response.json(
      { error: e instanceof Error ? e.message : "Failed to read usage data" },
      { status: 500 },
    );
  }

  const messages: ChatMessage[] = [
    { role: "system", content: `${SYSTEM}\n\n---\n${context}` },
    ...turns,
  ];

  let upstream: Response;
  try {
    upstream = await fetch(`${LLM.baseUrl}/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: LLM.model,
        messages,
        stream: true,
        temperature: 0.3,
      }),
    });
  } catch {
    return Response.json(
      { error: `Can't reach LM Studio at ${LLM.baseUrl}. Is the local server running?` },
      { status: 502 },
    );
  }

  if (!upstream.ok || !upstream.body) {
    const detail = await upstream.text().catch(() => "");
    return Response.json(
      { error: `LM Studio error ${upstream.status}: ${detail.slice(0, 300) || "no response body"}` },
      { status: 502 },
    );
  }

  // Re-emit just the assistant text tokens from the OpenAI-style SSE stream.
  const decoder = new TextDecoder();
  const encoder = new TextEncoder();
  let buffer = "";

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const reader = upstream.body!.getReader();
      try {
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const events = buffer.split("\n\n");
          buffer = events.pop() ?? "";
          for (const event of events) {
            const line = event.split("\n").find((l) => l.startsWith("data:"));
            if (!line) continue;
            const data = line.slice(5).trim();
            if (data === "[DONE]") continue;
            try {
              const json = JSON.parse(data);
              const delta = json.choices?.[0]?.delta?.content;
              if (delta) controller.enqueue(encoder.encode(delta));
            } catch {
              // ignore keep-alive / partial fragments
            }
          }
        }
      } catch {
        // upstream dropped; just close the stream
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
    },
  });
}
