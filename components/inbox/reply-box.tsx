"use client";

import dynamic from "next/dynamic";
import { Reply } from "lucide-react";

import type { ComposerReply, SenderOptionDTO } from "@/components/composer/composer";
import { Button } from "@/components/ui/button";

const Composer = dynamic(() => import("@/components/composer/composer").then((m) => m.Composer), {
  ssr: false,
  loading: () => (
    <div className="rounded-lg border border-line px-3 py-6 text-sm text-ink-muted">
      Opening reply…
    </div>
  ),
});

/** Inline reply under the thread: a quiet "Reply" prompt that opens the composer (`variant="inline"`). */
export function ReplyBox({
  orgSlug,
  senders,
  canSend,
  open,
  onOpenChange,
  reply,
  aiDraft = null,
  onSent,
}: {
  orgSlug: string;
  senders: SenderOptionDTO[];
  canSend: boolean;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  reply: ComposerReply;
  /** AI-drafted body to start the reply with (Draft reply button). */
  aiDraft?: { html: string; nonce: number } | null;
  onSent: () => void;
}) {
  if (!open) {
    return (
      <Button
        type="button"
        variant="outline"
        className="w-full justify-start rounded-lg text-ink-muted"
        onClick={() => onOpenChange(true)}
      >
        <Reply aria-hidden /> Reply to {reply.to[0] ?? "this conversation"}…
      </Button>
    );
  }
  return (
    <div data-testid="inline-reply">
      <Composer
        orgSlug={orgSlug}
        senders={senders}
        canSend={canSend}
        reply={reply}
        aiDraft={aiDraft}
        variant="inline"
        onSent={() => onSent()}
      />
      <Button
        type="button"
        variant="link"
        size="xs"
        className="mt-1 h-auto p-0 text-xs text-ink-muted"
        onClick={() => onOpenChange(false)}
      >
        Discard reply
      </Button>
    </div>
  );
}
