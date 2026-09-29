"use client";

import { useEffect, useRef, useState } from "react";

export interface ChatMsg {
  role: "user" | "assistant";
  content: string;
}

// Chat state + streaming for the "Ask about your usage" sheet. Owned by
// DashboardProvider (not the panel) because the sheet unmounts its content when
// closed — history, the draft and any in-flight stream must survive that.
// The in-flight request is aborted when a new send starts (can't happen while
// busy, but kept for safety) and when the provider unmounts.
export function useChat() {
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => () => abortRef.current?.abort(), []);

  async function send(text: string) {
    const content = text.trim();
    if (!content || busy) return;
    setError(null);
    setInput("");

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    const next: ChatMsg[] = [...messages, { role: "user", content }];
    setMessages([...next, { role: "assistant", content: "" }]);
    setBusy(true);

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: next }),
        signal: controller.signal,
      });

      if (!res.ok || !res.body) {
        let detail = `Request failed (${res.status})`;
        try {
          const j = await res.json();
          if (j?.error) detail = j.error;
        } catch {
          /* non-JSON */
        }
        throw new Error(detail);
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value, { stream: true });
        setMessages((prev) => {
          const copy = [...prev];
          const last = copy[copy.length - 1];
          if (last?.role === "assistant") copy[copy.length - 1] = { ...last, content: last.content + chunk };
          return copy;
        });
      }
    } catch (e) {
      if (e instanceof DOMException && e.name === "AbortError") return;
      setError(e instanceof Error ? e.message : "Something went wrong");
      // drop the empty assistant bubble on error
      setMessages((prev) => {
        const copy = [...prev];
        if (copy[copy.length - 1]?.role === "assistant" && !copy[copy.length - 1].content) copy.pop();
        return copy;
      });
    } finally {
      if (!controller.signal.aborted) setBusy(false);
    }
  }

  return { messages, input, setInput, busy, error, send, clear: () => setMessages([]) };
}

export type ChatState = ReturnType<typeof useChat>;
