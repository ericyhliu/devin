import { config } from "./config.js";

const ORG_BASE = `${config.devinApiBaseUrl}/v3/organizations/${config.devinOrgId}`;

function authHeaders() {
  return {
    Authorization: `Bearer ${config.devinApiKey}`,
    "Content-Type": "application/json",
  };
}

export interface CreateSessionInput {
  prompt: string;
  title?: string;
  tags?: string[];
  /** When true, Devin dedupes identical requests instead of starting a new run. */
  idempotent?: boolean;
  /** JSON Schema for a structured result (e.g. the list of issues discovery filed). */
  structuredOutputSchema?: Record<string, unknown>;
}

export interface DevinPullRequest {
  pr_url: string;
  pr_state?: string;
}

export interface DevinSession {
  session_id: string;
  url: string;
  status: string; // new | claimed | running | exit | error | suspended | resuming
  status_detail: string | null; // working | waiting_for_user | finished | ...
  pull_requests: DevinPullRequest[];
  acus_consumed?: number;
  structured_output?: unknown; // populated when the session returns structured output
}

/** Create a Devin session. Returns the new session's id + url + initial status. */
export async function createSession(input: CreateSessionInput): Promise<DevinSession> {
  const res = await fetch(`${ORG_BASE}/sessions`, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify({
      prompt: input.prompt,
      title: input.title,
      tags: input.tags,
      idempotent: input.idempotent ?? true,
      ...(input.structuredOutputSchema
        ? { structured_output_schema: input.structuredOutputSchema }
        : {}),
    }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Devin createSession ${res.status}: ${text.slice(0, 300)}`);
  }
  return (await res.json()) as DevinSession;
}

/** Fetch the current state of a session (used by the sync loop, not the happy path). */
export async function getSession(sessionId: string): Promise<DevinSession> {
  const res = await fetch(`${ORG_BASE}/sessions/${sessionId}`, {
    headers: authHeaders(),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Devin getSession ${res.status}: ${text.slice(0, 300)}`);
  }
  return (await res.json()) as DevinSession;
}

export interface DevinMessage {
  event_id: string;
  source: string; // "user" | "devin" | ...
  message: string;
}

/**
 * Fetch the latest message Devin emitted in a session (for live progress text).
 * Returns the most recent non-user message, or null if none yet.
 */
export async function getLatestDevinMessage(sessionId: string): Promise<string | null> {
  const res = await fetch(`${ORG_BASE}/sessions/${sessionId}/messages`, {
    headers: authHeaders(),
  });
  if (!res.ok) return null; // progress text is best-effort; never block on it
  const data = (await res.json()) as { items?: DevinMessage[] };
  const items = data.items ?? [];
  for (let i = items.length - 1; i >= 0; i--) {
    if (items[i].source !== "user") return items[i].message;
  }
  return null;
}
