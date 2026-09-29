"use client";

import { Reply } from "lucide-react";

import { Composer, type ComposerReply, type SenderOptionDTO } from "@/components/composer/composer";
import { Button } from "@/components/ui/button";

/** Inline reply under the thread: a quiet "Reply" prompt that opens the composer (`variant="inline"`). */
export function ReplyBox({
  orgSlug,
  senders,
  canSend,
  open,
  onOpenChange,
  reply,
  onSent,
}: {
  orgSlug: string;
  senders: SenderOptionDTO[];
  canSend: boolean;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  reply: ComposerReply;
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
