"use client";

import { Check, ChevronDown, Loader2, Lock, Sparkles, X } from "lucide-react";
import Link from "next/link";
import { useState, type ReactNode } from "react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { TONES, TONE_LABEL, type ComposeAction, type Tone } from "@/lib/ai/types";
import { AiRequestError, requestCompose } from "./api";
import { aiAccess, useAiStatus } from "./use-ai-status";

type Result =
  | { kind: "subjects"; suggestions: string[] }
  | { kind: "text"; html: string; text: string; label: string }
  | { kind: "locked"; message: string }
  | { kind: "error"; message: string };

/**
 * Composer AI actions (PRD §5.10, FED "AI actions live in the capsule's bottom bar as pills"):
 * suggest subject, rewrite in a tone, shorten, fix grammar. Nothing is applied by itself: every
 * result is a suggestion the member accepts (Use / Replace) or discards. Returns the pills for
 * the bottom bar and the result panel to render above it.
 */
export function useComposeAi(input: {
  orgSlug: string;
  subject: string;
  bodyHtml: string;
  /** Body actions need the rich editor (they return plain paragraphs). */
  richMode: boolean;
  disabled: boolean;
  onUseSubject: (subject: string) => void;
  onReplaceBody: (html: string) => void;
}): { toolbar: ReactNode; panel: ReactNode } {
  const { orgSlug } = input;
  const { status, refresh } = useAiStatus(orgSlug);
  const access = aiAccess(status, "compose");
  const [busy, setBusy] = useState<string | null>(null);
  const [result, setResult] = useState<Result | null>(null);

  if (access.kind === "hidden") return { toolbar: null, panel: null };

  async function run(action: ComposeAction, tone?: Tone) {
    if (access.kind === "locked") {
      setResult({ kind: "locked", message: access.message });
      return;
    }
    const key = action + (tone ?? "");
    setBusy(key);
    setResult(null);
    try {
      const response = await requestCompose(orgSlug, {
        action,
        tone,
        subject: input.subject,
        bodyHtml: input.bodyHtml,
      });
      if (response.kind === "subjects") {
        setResult({ kind: "subjects", suggestions: response.suggestions });
      } else {
        setResult({
          kind: "text",
          html: response.html,
          text: response.text,
          label:
            action === "rewrite"
              ? `Rewritten in a ${tone ?? "friendly"} tone`
              : action === "shorten"
                ? "Shortened"
                : "Grammar fixed",
        });
      }
    } catch (error) {
      setResult({
        kind: "error",
        message:
          error instanceof AiRequestError ? error.message : "We couldn't reach the AI. Try again.",
      });
    } finally {
      setBusy(null);
      refresh();
    }
  }

  const locked = access.kind === "locked";
  const bodyBlocked = !input.richMode;
  const pill = (label: string, action: ComposeAction, opts: { needsBody?: boolean } = {}) => {
    const blocked = !locked && opts.needsBody && bodyBlocked;
    return (
      <Button
        key={action}
        type="button"
        variant="ghost"
        size="sm"
        disabled={input.disabled || busy !== null || blocked}
        aria-disabled={locked || undefined}
        title={locked ? access.message : blocked ? "Switch to Rich text to use this." : undefined}
        onClick={() => void run(action)}
        data-testid={`ai-${action}`}
      >
        {busy === action ? (
          <Loader2 aria-hidden className="animate-spin" />
        ) : locked ? (
          <Lock aria-hidden />
        ) : (
          <Sparkles aria-hidden />
        )}
        {label}
      </Button>
    );
  };

  const toolbar = (
    <div role="group" aria-label="AI writing tools" className="flex flex-wrap items-center gap-0.5">
      {pill("Suggest subject", "subjects")}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={input.disabled || busy !== null || (!locked && bodyBlocked)}
            aria-disabled={locked || undefined}
            title={
              locked ? access.message : bodyBlocked ? "Switch to Rich text to use this." : undefined
            }
            data-testid="ai-rewrite"
            onClick={(event) => {
              if (locked) {
                event.preventDefault();
                setResult({ kind: "locked", message: access.message });
              }
            }}
          >
            {busy?.startsWith("rewrite") ? (
              <Loader2 aria-hidden className="animate-spin" />
            ) : locked ? (
              <Lock aria-hidden />
            ) : (
              <Sparkles aria-hidden />
            )}
            Rewrite
            <ChevronDown aria-hidden className="size-3 opacity-60" />
          </Button>
        </DropdownMenuTrigger>
        {!locked ? (
          <DropdownMenuContent align="start">
            {TONES.map((tone) => (
              <DropdownMenuItem key={tone} onSelect={() => void run("rewrite", tone)}>
                {TONE_LABEL[tone]}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        ) : null}
      </DropdownMenu>
      {pill("Shorten", "shorten", { needsBody: true })}
      {pill("Fix grammar", "grammar", { needsBody: true })}
    </div>
  );

  const panel = result ? (
    <div
      data-testid="ai-result"
      role="status"
      className="mt-2 grid min-w-0 grid-cols-[minmax(0,1fr)] gap-2 rounded-lg bg-engaged-soft/60 p-3 text-sm"
    >
      {result.kind === "subjects" ? (
        <>
          <p className="text-xs font-semibold text-engaged-ink">Subject ideas</p>
          <ul className="grid grid-cols-[minmax(0,1fr)] gap-1">
            {result.suggestions.map((s) => (
              <li
                key={s}
                className="flex items-center justify-between gap-2 rounded-md bg-surface px-3 py-1.5"
              >
                <span className="min-w-0 flex-1 break-words">{s}</span>
                <Button
                  type="button"
                  size="xs"
                  variant="outline"
                  onClick={() => {
                    input.onUseSubject(s);
                    setResult(null);
                  }}
                >
                  <Check aria-hidden /> Use
                </Button>
              </li>
            ))}
          </ul>
        </>
      ) : result.kind === "text" ? (
        <>
          <p className="text-xs font-semibold text-engaged-ink">{result.label}</p>
          <div
            className="max-h-48 overflow-y-auto rounded-md bg-surface px-3 py-2 [&_p]:my-1"
            dangerouslySetInnerHTML={{ __html: result.html }}
          />
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              size="sm"
              onClick={() => {
                input.onReplaceBody(result.html);
                setResult(null);
              }}
            >
              <Check aria-hidden /> Replace my draft
            </Button>
            <Button type="button" size="sm" variant="ghost" onClick={() => setResult(null)}>
              Keep mine
            </Button>
          </div>
        </>
      ) : result.kind === "locked" ? (
        <p>
          {result.message}{" "}
          <Link href={`/${orgSlug}/settings/ai`} className="font-semibold underline">
            See plans
          </Link>
        </p>
      ) : (
        <p role="alert" className="text-danger-ink">
          {result.message}
        </p>
      )}
      {result.kind !== "text" ? (
        <Button
          type="button"
          size="xs"
          variant="ghost"
          className="justify-self-start"
          onClick={() => setResult(null)}
        >
          <X aria-hidden /> Dismiss
        </Button>
      ) : null}
    </div>
  ) : null;

  return { toolbar, panel };
}
