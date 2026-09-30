"use client";

import { Loader2, Paperclip } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { retryInboundAction } from "@/app/(app)/[orgSlug]/inbox/actions";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import type { AddressDTO, MessageDTO } from "@/lib/dto/mail";
import { cn } from "@/lib/utils";
import { AttachmentChips } from "./attachment-chips";
import { EmailFrame } from "./email-frame";
import { displayName, messageTime, useNow } from "./format";
import { ReceiptSteps } from "./receipt-steps";

const list = (people: AddressDTO[]) =>
  people.map((p) => (p.name ? `${p.name} <${p.address}>` : p.address)).join(", ");

function Body({
  message,
  orgSlug,
  onRetried,
}: {
  message: MessageDTO;
  orgSlug: string;
  onRetried: () => void;
}) {
  const [retrying, setRetrying] = useState(false);
  const hasBody = message.html !== null || message.text !== null;

  if (!hasBody && message.contentStatus === "pending") {
    return (
      <div role="status" aria-live="polite" className="grid gap-2" data-testid="body-pending">
        <p className="flex items-center gap-2 text-sm text-ink-muted">
          <Loader2 aria-hidden className="size-4 animate-spin" /> Fetching message…
        </p>
        <Skeleton className="h-3.5 w-4/5" />
        <Skeleton className="h-3.5 w-3/5" />
      </div>
    );
  }
  if (!hasBody && message.contentStatus === "failed") {
    return (
      <div className="flex flex-wrap items-center gap-3 text-sm text-ink-muted" role="alert">
        Content unavailable right now.
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={retrying}
          onClick={async () => {
            setRetrying(true);
            const result = await retryInboundAction(orgSlug, { emailId: message.id });
            setRetrying(false);
            if (!result.ok) return void toast.error(result.error.message);
            toast.success("Fetching the message again");
            onRetried();
          }}
        >
          {retrying ? "Retrying…" : "Retry"}
        </Button>
      </div>
    );
  }
  if (!hasBody) {
    return <p className="text-sm text-ink-muted">This message has no content to show.</p>;
  }
  return (
    <EmailFrame
      title={`Message from ${displayName(message.from.address, message.from.name)}: ${message.subject}`}
      html={message.html}
      text={message.text}
    />
  );
}

/**
 * One message in a thread (board: `.msg`). Older messages are collapsed to a single line; the
 * body renders in a sandboxed iframe, attachments below, and our own replies carry the receipt steps.
 */
export function MessageCard({
  message,
  orgSlug,
  expanded,
  onToggle,
  onRetried,
}: {
  message: MessageDTO;
  orgSlug: string;
  expanded: boolean;
  onToggle: () => void;
  onRetried: () => void;
}) {
  const now = useNow();
  const ours = message.direction === "outbound";
  const who = displayName(message.from.address, message.from.name);
  const time = messageTime(message.at, now ? undefined : "UTC");

  return (
    <article
      data-testid="message"
      data-direction={message.direction}
      aria-label={`Message from ${who}`}
      className={cn(
        "grid gap-2 rounded-lg px-3.5 py-3",
        ours ? "bg-surface shadow-[0_0_0_1px_var(--line)]" : "bg-canvas",
      )}
    >
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={expanded}
        className="flex w-full flex-wrap items-baseline justify-between gap-x-2 gap-y-0.5 text-left text-[12.5px] text-ink-muted outline-none focus-visible:ring-2 focus-visible:ring-accent"
      >
        <span className="min-w-0 truncate">
          <b className="font-semibold text-ink">{who}</b>
          {expanded ? <> &lt;{message.from.address}&gt;</> : null}
          {!expanded && message.snippet ? (
            <span className="ml-2 text-ink-muted">{message.snippet}</span>
          ) : null}
          {!expanded && message.attachments.some((a) => !a.embedded) ? (
            <Paperclip
              aria-label="Has attachments"
              className="ml-1.5 inline size-3 align-[-1px] text-ink-muted"
            />
          ) : null}
        </span>
        <time dateTime={message.at} className="flex-none tabular-nums">
          {time}
        </time>
      </button>

      {expanded ? (
        <>
          <p className="text-xs text-ink-muted">
            To: {list(message.to) || "(none)"}
            {message.cc.length ? <> · Cc: {list(message.cc)}</> : null}
            {message.bcc.length ? <> · Bcc: {list(message.bcc)}</> : null}
          </p>
          <Body message={message} orgSlug={orgSlug} onRetried={onRetried} />
          <AttachmentChips attachments={message.attachments} />
          {ours && message.receipts ? (
            <ReceiptSteps
              receipts={message.receipts}
              settingsHref={`/${orgSlug}/settings/connections`}
            />
          ) : null}
        </>
      ) : ours && message.receipts ? (
        <ReceiptSteps
          receipts={message.receipts}
          settingsHref={`/${orgSlug}/settings/connections`}
        />
      ) : null}
    </article>
  );
}
