// LM Studio exposes an OpenAI-compatible server. These point at the local
// instance; override via env if your server runs elsewhere or loads another model.
export const LLM = {
  // Base URL of the OpenAI-compatible API (no trailing slash).
  baseUrl: process.env.LM_STUDIO_URL || "http://localhost:1234/v1",
  // Model id as reported by GET /v1/models.
  model: process.env.LM_STUDIO_MODEL || "google/gemma-4-e4b",
} as const;

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}
