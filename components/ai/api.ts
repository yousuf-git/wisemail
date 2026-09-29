import type { AiStatusDTO, ComposeAction, Tone } from "@/lib/ai/types";

/** Client fetchers for `/api/v1/ai/*` (session cookie authorizes; org named by slug). */

export class AiRequestError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "AiRequestError";
  }
}

async function send<T>(
  method: "GET" | "POST",
  path: string,
  orgSlug: string,
  body?: unknown,
): Promise<T> {
  const response = await fetch(`/api/v1/ai/${path}?orgSlug=${encodeURIComponent(orgSlug)}`, {
    method,
    credentials: "same-origin",
    headers: body === undefined ? undefined : { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!response.ok) {
    const data = (await response.json().catch(() => null)) as {
      error?: string;
      message?: string;
    } | null;
    throw new AiRequestError(
      response.status,
      data?.error ?? "internal",
      data?.message ?? "Something went wrong. Try again in a moment.",
    );
  }
  return (await response.json()) as T;
}

export const fetchAiStatus = (orgSlug: string) => send<AiStatusDTO>("GET", "status", orgSlug);

export const requestDraft = (
  orgSlug: string,
  input: { threadId: string; tone: Tone; instructions?: string },
) => send<{ html: string; text: string; model: string }>("POST", "draft", orgSlug, input);

export type ComposeResponse =
  | { kind: "subjects"; suggestions: string[]; model: string }
  | { kind: "text"; html: string; text: string; model: string };

export const requestCompose = (
  orgSlug: string,
  input: { action: ComposeAction; subject?: string; bodyHtml: string; tone?: Tone },
) => send<ComposeResponse>("POST", "compose", orgSlug, input);

export const requestExplain = (orgSlug: string, input: { incidentId: string; refresh?: boolean }) =>
  send<{ text: string; generatedAt: string; cached: boolean }>("POST", "explain", orgSlug, input);
