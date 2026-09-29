"use client";

import { useEffect, useRef } from "react";
import type { ChatState } from "@/hooks/use-chat";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

const SUGGESTIONS = [
  "Which projects cost me the most, and why?",
  "How can I cut my Claude Code costs?",
  "What's driving my spend in the last 7 days?",
  "Is my cache-read share good?",
];

// Presentational: history/streaming state lives in useChat (owned by
// DashboardProvider) so it survives the sheet closing.
export function ChatPanel({ chat }: { chat: ChatState }) {
  const { messages, input, setInput, busy, error, send, clear } = chat;
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages]);

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <div>
          <CardTitle className="text-sm font-medium">Ask your usage data</CardTitle>
          <p className="mt-1 text-xs text-muted-foreground">
            Local model · <code className="rounded bg-muted px-1 py-0.5 text-[11px]">google/gemma-4-e4b</code> via LM Studio
          </p>
        </div>
        {messages.length > 0 && (
          <Button variant="ghost" size="sm" onClick={clear} disabled={busy}>
            Clear
          </Button>
        )}
      </CardHeader>
      <CardContent>
        <div ref={scrollRef} className="max-h-[360px] min-h-[140px] space-y-3 overflow-y-auto pr-1">
          {messages.length === 0 ? (
            <div className="space-y-3 py-2">
              <p className="text-sm text-muted-foreground">
                Chat with a local model about your Claude Code spend. Try:
              </p>
              <div className="flex flex-wrap gap-2">
                {SUGGESTIONS.map((s) => (
                  <button
                    key={s}
                    onClick={() => send(s)}
                    className="rounded-full border px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            messages.map((m, i) => (
              <div key={i} className={m.role === "user" ? "flex justify-end" : "flex justify-start"}>
                <div
                  className={`max-w-[85%] whitespace-pre-wrap rounded-lg px-3 py-2 text-sm ${
                    m.role === "user" ? "bg-primary text-primary-foreground" : "bg-muted text-foreground"
                  }`}
                >
                  {m.content || (busy ? <span className="opacity-60">Thinking…</span> : "")}
                </div>
              </div>
            ))
          )}
        </div>

        {error && <div className="mt-3 rounded-md border border-destructive/50 bg-destructive/10 px-3 py-2 text-xs text-destructive">{error}</div>}

        <div className="mt-3 flex items-end gap-2">
          <Textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                send(input);
              }
            }}
            placeholder="Ask about your usage… (Enter to send, Shift+Enter for newline)"
            rows={1}
            className="max-h-32 min-h-[40px] resize-none"
            disabled={busy}
          />
          <Button onClick={() => send(input)} disabled={busy || !input.trim()}>
            {busy ? "…" : "Send"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
