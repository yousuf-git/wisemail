"use client";

import { ChevronDown, Loader2, Lock, Sparkles } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { TONES, TONE_LABEL, type Tone } from "@/lib/ai/types";
import { AiRequestError, requestDraft } from "./api";
import { aiAccess, useAiStatus } from "./use-ai-status";

/**
 * "Draft reply" in the thread toolbar (PRD §5.10): asks for a draft in the chosen tone and hands
 * the HTML to the inline composer, which the member edits and sends themselves. Paid plans only:
 * on Free the button stays visible, locked, with the upgrade note.
 */
export function DraftReplyButton({
  orgSlug,
  threadId,
  onDraft,
}: {
  orgSlug: string;
  threadId: string;
  onDraft: (html: string) => void;
}) {
  const router = useRouter();
  const { status, refresh } = useAiStatus(orgSlug);
  const access = aiAccess(status, "draft");
  const [busy, setBusy] = useState(false);
  if (access.kind === "hidden") return null;

  if (access.kind === "locked") {
    return (
      <Button
        type="button"
        variant="ghost"
        size="sm"
        aria-disabled
        title={access.message}
        onClick={() =>
          toast(access.message, {
            action: {
              label: access.reason === "not_in_plan" ? "See plans" : "AI settings",
              onClick: () => router.push(`/${orgSlug}/settings/ai`),
            },
          })
        }
        className="text-ink-muted"
      >
        <Lock aria-hidden /> <span className="sr-only sm:not-sr-only">Draft reply</span>
      </Button>
    );
  }

  async function draft(tone: Tone) {
    setBusy(true);
    try {
      const result = await requestDraft(orgSlug, { threadId, tone });
      onDraft(result.html);
      toast.success("Draft ready. Edit it, then send when it sounds right.");
    } catch (error) {
      toast.error(
        error instanceof AiRequestError ? error.message : "We couldn't draft a reply. Try again.",
      );
    } finally {
      setBusy(false);
      refresh();
    }
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          disabled={busy}
          aria-label="Draft reply with AI"
        >
          {busy ? <Loader2 aria-hidden className="animate-spin" /> : <Sparkles aria-hidden />}
          <span className="sr-only sm:not-sr-only">{busy ? "Drafting…" : "Draft reply"}</span>
          <ChevronDown aria-hidden className="size-3 opacity-60" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuLabel className="text-xs text-ink-muted">
          Draft in a tone (5 credits)
        </DropdownMenuLabel>
        {TONES.map((tone) => (
          <DropdownMenuItem key={tone} onSelect={() => void draft(tone)}>
            {TONE_LABEL[tone]}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** Small inline link used where a full lock note is needed. */
export function UpgradeLink({ orgSlug }: { orgSlug: string }) {
  return (
    <Link href={`/${orgSlug}/settings/ai`} className="font-semibold underline">
      See plans
    </Link>
  );
}
