"use client";

import { AlertTriangle, Loader2 } from "lucide-react";
import { useEffect, useState } from "react";

import {
  getBroadcastAudienceAction,
  sendBroadcastAction,
} from "@/app/(app)/[orgSlug]/broadcasts/actions";
import { audienceError } from "@/components/audience/errors";
import {
  formatScheduled,
  fromLocalInputValue,
  MIN_SCHEDULE_LEAD_MS,
  toLocalInputValue,
} from "@/components/composer/schedule";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { useNow } from "@/components/inbox/format";
import type { BroadcastAudienceDTO, BroadcastDTO } from "@/lib/dto/audience";

/**
 * The last step before a broadcast leaves (UC-23): who it reaches, what looks off, and when.
 * The audience size is read from the contacts we mirror when the dialog opens.
 */
export function SendDialog({
  orgSlug,
  broadcast,
  warnings,
  timeZone,
  onClose,
  onSent,
}: {
  orgSlug: string;
  broadcast: Pick<BroadcastDTO, "id" | "name" | "subject" | "segmentName">;
  warnings: string[];
  timeZone: string;
  onClose: () => void;
  onSent: (result: BroadcastDTO) => void;
}) {
  const [audience, setAudience] = useState<BroadcastAudienceDTO | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [when, setWhen] = useState<"now" | "later">("now");
  const [local, setLocal] = useState(() =>
    toLocalInputValue(new Date(Date.now() + 60 * 60_000), timeZone),
  );
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let live = true;
    void getBroadcastAudienceAction(orgSlug, { id: broadcast.id }).then((result) => {
      if (!live) return;
      if (result.ok) setAudience(result.data);
      else setLoadError(audienceError(result.error));
    });
    return () => {
      live = false;
    };
  }, [orgSlug, broadcast.id]);

  const now = useNow();
  const at = when === "later" ? fromLocalInputValue(local, timeZone) : null;
  const scheduleError =
    when === "later" && (!at || (now > 0 && at.getTime() < now + MIN_SCHEDULE_LEAD_MS))
      ? "Pick a time at least a minute from now."
      : null;
  const blocked = audience !== null && audience.recipients === 0;

  async function send() {
    if (scheduleError) return setError(scheduleError);
    setBusy(true);
    setError(null);
    const result = await sendBroadcastAction(orgSlug, {
      id: broadcast.id,
      ...(at ? { scheduledAt: at.toISOString() } : {}),
    });
    setBusy(false);
    if (!result.ok) return setError(audienceError(result.error));
    onSent(result.data);
  }

  return (
    <Dialog open onOpenChange={(open) => !open && !busy && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="text-xl">
            {when === "later" ? "Schedule" : "Send"} “{broadcast.name}”?
          </DialogTitle>
          <DialogDescription>
            Check who gets it and when. Once it&apos;s sent, it can&apos;t be recalled.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-3">
          <div
            className="rounded-lg bg-canvas-sunken px-4 py-3"
            aria-live="polite"
            data-testid="audience-size"
          >
            {audience ? (
              <>
                <p className="text-2xl font-bold tabular-nums">
                  {audience.recipients.toLocaleString()}{" "}
                  <span className="text-base font-semibold">
                    {audience.recipients === 1 ? "contact" : "contacts"}
                  </span>
                </p>
                <p className="text-sm text-ink-muted">
                  in {audience.segmentName ?? broadcast.segmentName ?? "the segment"}
                  {audience.unsubscribed > 0
                    ? ` · ${audience.unsubscribed.toLocaleString()} unsubscribed are left out`
                    : ""}
                  {audience.optedOutOfTopic > 0
                    ? ` · ${audience.optedOutOfTopic.toLocaleString()} skipped for the topic`
                    : ""}
                </p>
              </>
            ) : loadError ? (
              <p role="alert" className="text-sm text-danger-ink">
                {loadError}
              </p>
            ) : (
              <p className="flex items-center gap-2 text-sm text-ink-muted">
                <Loader2 aria-hidden className="size-4 animate-spin" /> Counting who this reaches…
              </p>
            )}
          </div>

          {blocked ? (
            <p role="alert" className="rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger-ink">
              {audience.inSegment === 0
                ? "This segment has no contacts yet, so there is nobody to send to. Add contacts to it first."
                : "Everyone in this segment has unsubscribed or opted out, so there is nobody to send to."}
            </p>
          ) : null}
          {warnings.map((warning) => (
            <p
              key={warning}
              className="flex items-start gap-2 rounded-lg bg-warning-soft px-3 py-2 text-sm text-warning-ink"
            >
              <AlertTriangle aria-hidden className="mt-0.5 size-4 shrink-0" />
              <span>{warning}</span>
            </p>
          ))}

          <fieldset className="grid gap-2">
            <legend className="mb-1 text-sm font-medium">When</legend>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="radio"
                name="when"
                checked={when === "now"}
                onChange={() => setWhen("now")}
                className="size-4 accent-[var(--accent)]"
              />
              Send now
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="radio"
                name="when"
                checked={when === "later"}
                onChange={() => setWhen("later")}
                className="size-4 accent-[var(--accent)]"
              />
              Schedule for later
            </label>
            {when === "later" ? (
              <div className="grid gap-1 pl-6">
                <Input
                  type="datetime-local"
                  aria-label="Send at"
                  value={local}
                  min={toLocalInputValue(new Date(), timeZone)}
                  onChange={(e) => setLocal(e.target.value)}
                  className="w-fit"
                />
                <p className="text-xs text-ink-muted">
                  {at ? `Goes out ${formatScheduled(at, timeZone)}` : "Pick a date and time"} (
                  {timeZone}).
                </p>
                {scheduleError ? (
                  <p role="alert" className="text-xs text-danger-ink">
                    {scheduleError}
                  </p>
                ) : null}
              </div>
            ) : null}
          </fieldset>

          {error ? (
            <p
              role="alert"
              data-testid="send-error"
              className="rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger-ink"
            >
              {error}
            </p>
          ) : null}
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose} disabled={busy}>
            Not yet
          </Button>
          <Button
            type="button"
            className="font-bold"
            disabled={busy || blocked || !audience || !!scheduleError}
            onClick={() => void send()}
          >
            {busy ? <Loader2 aria-hidden className="animate-spin" /> : null}
            {busy ? "Working…" : when === "later" ? "Schedule broadcast" : "Send broadcast"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
