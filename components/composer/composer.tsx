"use client";

import { Eye, EyeOff, Loader2, Monitor, Moon, Send, Smartphone, Sun, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";

import {
  cancelScheduledAction,
  deleteDraftAction,
  getDraftAction,
  sendEmailAction,
} from "@/app/(app)/[orgSlug]/compose/actions";
import { senderReason } from "@/components/senders/sender-status";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import type { DraftDTO, SenderDTO } from "@/lib/dto/mail";
import { cn } from "@/lib/utils";
import { AddressField } from "./address-field";
import { AttachButton, AttachmentList } from "./attachment-list";
import { isLossyForRich, isBodyBlank, validateCompose } from "./compose-validation";
import { friendlyError } from "./errors";
import { PreviewFrame } from "./preview-frame";
import { SchedulePicker } from "./schedule-picker";
import { formatScheduled, isValidTimeZone } from "./schedule";
import { SenderSelect } from "./sender-select";
import { useAttachments } from "./use-attachments";
import { draftToFields, fieldsKey, useDraftAutosave, type DraftFields } from "./use-draft-autosave";

const RichEditor = lazy(() => import("./rich-editor"));
const HtmlEditor = lazy(() => import("./html-editor"));

/** Sender choices for the composer (the sender DTO from `lib/dto/mail.ts`). */
export type SenderOptionDTO = SenderDTO;

export type ComposerReply = {
  threadId: string;
  inReplyToEmailId: string;
  to: string[];
  cc?: string[];
  subject: string;
};

export type ComposerProps = {
  orgSlug: string;
  senders: SenderOptionDTO[];
  canSend: boolean;
  draft?: DraftDTO | null;
  reply?: ComposerReply | null;
  variant?: "page" | "inline";
  onSent?: (emailId: string) => void;
  /** IANA timezone of the org, used for scheduling. Defaults to the browser's. */
  timezone?: string;
};

type Mode = "rich" | "html" | "template";

const signatureBody = (sender: SenderDTO | undefined) =>
  sender?.signatureHtml.trim() ? `<p></p>${sender.signatureHtml}` : "";

const pickDefaultSender = (senders: SenderDTO[]) =>
  senders.find((s) => s.isDefault && s.status === "active") ??
  senders.find((s) => s.status === "active") ??
  null;

const editorFallback = <Skeleton className="h-40 w-full rounded-md" />;

export function Composer({
  orgSlug,
  senders,
  canSend,
  draft = null,
  reply = null,
  variant = "page",
  onSent,
  timezone,
}: ComposerProps) {
  const router = useRouter();
  const zone = isValidTimeZone(timezone)
    ? timezone
    : (Intl.DateTimeFormat().resolvedOptions().timeZone ?? "UTC");
  const inline = variant === "inline";

  // ---- initial state (from a draft, a reply or nothing) ----
  const [initial] = useState(() => {
    const sender = draft?.senderId
      ? (senders.find((s) => s.id === draft.senderId) ?? null)
      : pickDefaultSender(senders);
    const scheduled = draft?.scheduledAt ? new Date(draft.scheduledAt) : null;
    const auto = draft ? "" : signatureBody(sender ?? undefined);
    const fields: DraftFields = {
      senderId: draft ? draft.senderId : (sender?.id ?? null),
      threadId: draft?.threadId ?? reply?.threadId ?? null,
      inReplyToEmailId: draft?.inReplyToEmailId ?? reply?.inReplyToEmailId ?? null,
      to: draft?.to ?? reply?.to ?? [],
      cc: draft?.cc ?? reply?.cc ?? [],
      bcc: draft?.bcc ?? [],
      subject: draft?.subject ?? reply?.subject ?? "",
      mode: draft ? (draft.mode === "template" ? "html" : draft.mode) : "rich",
      bodyHtml: draft?.bodyHtml ?? auto,
      scheduledAt: scheduled && scheduled.getTime() > Date.now() ? scheduled.toISOString() : null,
    };
    return { fields, auto, baselineKey: fieldsKey(fields) };
  });

  const [senderId, setSenderId] = useState(initial.fields.senderId);
  const [to, setTo] = useState(initial.fields.to);
  const [cc, setCc] = useState(initial.fields.cc);
  const [bcc, setBcc] = useState(initial.fields.bcc);
  const [showCc, setShowCc] = useState(initial.fields.cc.length > 0);
  const [showBcc, setShowBcc] = useState(initial.fields.bcc.length > 0);
  const [subject, setSubject] = useState(initial.fields.subject);
  const [mode, setMode] = useState<Mode>(initial.fields.mode);
  const [bodyHtml, setBodyHtml] = useState(initial.fields.bodyHtml);
  const [scheduledAt, setScheduledAt] = useState<Date | null>(
    initial.fields.scheduledAt ? new Date(initial.fields.scheduledAt) : null,
  );
  const [editorKey, setEditorKey] = useState(0);
  const [showPreview, setShowPreview] = useState(false);
  const [previewWidth, setPreviewWidth] = useState<"desktop" | "mobile">("desktop");
  const [previewDark, setPreviewDark] = useState(false);
  const [dragging, setDragging] = useState(false);

  const [sending, setSending] = useState(false);
  const [finished, setFinished] = useState<null | "sent" | "scheduled" | "queued">(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [banner, setBanner] = useState<string | null>(null);
  const [conflict, setConflict] = useState(false);
  const autoBody = useRef(initial.auto);
  const [threadLink, setThreadLink] = useState({
    threadId: initial.fields.threadId,
    inReplyToEmailId: initial.fields.inReplyToEmailId,
  });
  const dragDepth = useRef(0);

  const sender = senders.find((s) => s.id === senderId) ?? null;
  const senderInactive = !!sender && sender.status !== "active";
  const editable = canSend && !sending && !finished;

  const fields = useMemo<DraftFields>(
    () => ({
      senderId,
      threadId: threadLink.threadId,
      inReplyToEmailId: threadLink.inReplyToEmailId,
      to,
      cc,
      bcc,
      subject,
      mode,
      bodyHtml,
      scheduledAt: scheduledAt ? scheduledAt.toISOString() : null,
    }),
    [senderId, threadLink, to, cc, bcc, subject, mode, bodyHtml, scheduledAt],
  );

  const autosave = useDraftAutosave({
    orgSlug,
    initialDraft: draft,
    fields,
    baselineKey: initial.baselineKey,
    enabled: canSend && !finished,
    onConflict: () => {
      setConflict(true);
      toast.error("This draft was edited somewhere else", {
        id: "draft-conflict",
        description: "Your changes here weren't saved. Reload to get the latest version.",
        duration: Infinity,
        action: { label: "Reload", onClick: () => void reloadLatest() },
      });
    },
  });

  const attachments = useAttachments({
    orgSlug,
    initial: draft?.attachments ?? [],
    ensureDraft: autosave.ensureDraft,
    onError: (message) => toast.error(message),
  });

  // ---- actions ----

  function applyDraft(next: DraftDTO) {
    const f = draftToFields(next);
    setSenderId(f.senderId);
    setTo(f.to);
    setCc(f.cc);
    setBcc(f.bcc);
    setShowCc(f.cc.length > 0);
    setShowBcc(f.bcc.length > 0);
    setSubject(f.subject);
    setMode(f.mode === "template" ? "html" : f.mode);
    setBodyHtml(f.bodyHtml);
    setScheduledAt(next.scheduledAt ? new Date(next.scheduledAt) : null);
    setThreadLink({ threadId: f.threadId, inReplyToEmailId: f.inReplyToEmailId });
    autoBody.current = "";
    setEditorKey((k) => k + 1);
    attachments.reset(next.attachments);
    autosave.adopt(next);
  }

  async function reloadLatest() {
    const id = autosave.draftId();
    if (!id) return;
    const result = await getDraftAction(orgSlug, { id });
    if (!result.ok) {
      toast.error(friendlyError(result.error).message);
      return;
    }
    applyDraft(result.data);
    setConflict(false);
    toast.dismiss("draft-conflict");
    toast.success("Loaded the latest version");
  }

  function changeSender(id: string) {
    setSenderId(id);
    setErrors((e) => ({ ...e, senderId: "" }));
    // An untouched signature follows the sender; anything the user wrote stays.
    if (bodyHtml === autoBody.current) {
      const next = signatureBody(senders.find((s) => s.id === id));
      autoBody.current = next;
      setBodyHtml(next);
      setEditorKey((k) => k + 1);
    }
  }

  function changeMode(next: string) {
    const target = next as Mode;
    if (target === mode || target === "template") return;
    if (
      target === "rich" &&
      isLossyForRich(bodyHtml) &&
      !window.confirm(
        "Rich text keeps simple formatting only. Tables, custom styles and other HTML will be simplified. Switch anyway?",
      )
    ) {
      return;
    }
    setMode(target);
    setEditorKey((k) => k + 1);
  }

  const setBody = useCallback((html: string) => {
    setBodyHtml(html);
    setErrors((e) => (e.html ? { ...e, html: "" } : e));
  }, []);

  async function submit() {
    if (!canSend || sending || finished) return;
    setBanner(null);
    const checks = validateCompose({
      senderId,
      senderActive: !!sender && !senderInactive,
      senderReason: sender ? senderReason(sender) : null,
      to,
      cc,
      bcc,
      subject,
      bodyHtml,
      scheduledAt,
      uploading: attachments.uploading,
    });
    // A body that is only the auto-inserted signature is still an empty message.
    if (autoBody.current && bodyHtml === autoBody.current) checks.html = "Write a message.";
    setErrors(checks);
    if (Object.keys(checks).length) {
      setBanner("Fix the highlighted fields, then send again.");
      return;
    }
    setSending(true);
    try {
      const draftId = await autosave.flush();
      const result = await sendEmailAction(orgSlug, {
        senderId: senderId!,
        to,
        cc,
        bcc,
        subject: subject.trim(),
        html: bodyHtml,
        inReplyToEmailId: threadLink.inReplyToEmailId ?? undefined,
        draftId: draftId ?? undefined,
        scheduledAt: scheduledAt ? scheduledAt.toISOString() : undefined,
      });
      if (!result.ok) {
        const friendly = friendlyError(result.error);
        setErrors(friendly.fields);
        setBanner(friendly.message);
        return;
      }
      autosave.forget();
      const { emailId, status } = result.data;
      const outcome = status === "scheduled" ? "scheduled" : status === "sent" ? "sent" : "queued";
      setFinished(outcome);
      toast.dismiss("draft-conflict");
      if (outcome === "scheduled" && scheduledAt) {
        toast.success(`Email scheduled for ${formatScheduled(scheduledAt, zone)}`, {
          duration: 8000,
          action: {
            label: "Undo",
            onClick: async () => {
              const canceled = await cancelScheduledAction(orgSlug, { emailId });
              if (canceled.ok) toast.success("Canceled. That email won't be sent.");
              else toast.error(friendlyError(canceled.error).message);
              router.refresh();
            },
          },
        });
      } else if (outcome === "sent") {
        toast.success(`Email sent to ${to[0]}${to.length > 1 ? ` and ${to.length - 1} more` : ""}`);
      } else {
        toast.success("Sending shortly", {
          description: "Resend is busy, so we'll deliver it in a moment.",
        });
      }
      onSent?.(emailId);
      if (!onSent && !inline) {
        router.push(
          outcome === "scheduled" ? `/${orgSlug}/scheduled` : `/${orgSlug}/activity/${emailId}`,
        );
      }
    } finally {
      setSending(false);
    }
  }

  async function discard() {
    const id = autosave.draftId();
    autosave.forget();
    if (id) {
      const result = await deleteDraftAction(orgSlug, { id });
      if (!result.ok) toast.error(friendlyError(result.error).message);
    }
    toast.success("Draft discarded");
    router.push(`/${orgSlug}`);
  }

  // Warn before closing the tab with unsaved changes.
  useEffect(() => {
    if (finished || !canSend) return;
    const handler = (event: BeforeUnloadEvent) => {
      if (
        autosave.state === "saving" ||
        autosave.state === "error" ||
        autosave.state === "conflict"
      ) {
        event.preventDefault();
      }
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [autosave.state, finished, canSend]);

  // ---- render ----

  const sendLabel = sending
    ? scheduledAt
      ? "Scheduling…"
      : "Sending…"
    : scheduledAt
      ? "Schedule"
      : "Send now";
  const sendDisabledReason = !canSend
    ? "Your role can't send email. Ask an Owner or Admin for access."
    : senders.length === 0
      ? "Create a sender first."
      : null;
  const sendButton = (
    <Button
      type="button"
      onClick={() => void submit()}
      disabled={!!sendDisabledReason || sending || !!finished}
      aria-keyshortcuts="Control+Enter Meta+Enter"
      className="font-bold"
    >
      {sending ? <Loader2 aria-hidden className="animate-spin" /> : <Send aria-hidden />}
      {sendLabel}
    </Button>
  );

  if (finished && inline) {
    return (
      <div
        data-slot="composer"
        className="rounded-xl bg-surface p-4 text-sm shadow-md"
        role="status"
      >
        {finished === "scheduled" && scheduledAt
          ? `Scheduled for ${formatScheduled(scheduledAt, zone)}.`
          : finished === "sent"
            ? "Sent."
            : "Sending shortly."}
      </div>
    );
  }

  const previewVisible = mode === "html" || showPreview;
  const saveText =
    autosave.state === "saving"
      ? "Saving…"
      : autosave.state === "error"
        ? "Couldn't save the draft"
        : autosave.state === "conflict"
          ? "Edited elsewhere"
          : autosave.savedAt && autosave.state === "saved"
            ? `Draft saved ${autosave.savedAt.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}`
            : "";

  return (
    <TooltipProvider>
      <div
        data-slot="composer"
        data-variant={variant}
        data-can-send={canSend}
        onKeyDown={(event) => {
          if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
            event.preventDefault();
            void submit();
          }
        }}
        onDragEnter={(event) => {
          if (!editable || !event.dataTransfer.types.includes("Files")) return;
          dragDepth.current += 1;
          setDragging(true);
        }}
        onDragLeave={() => {
          dragDepth.current = Math.max(0, dragDepth.current - 1);
          if (dragDepth.current === 0) setDragging(false);
        }}
        onDragOver={(event) => {
          if (editable && event.dataTransfer.types.includes("Files")) event.preventDefault();
        }}
        onDrop={(event) => {
          if (!editable) return;
          event.preventDefault();
          dragDepth.current = 0;
          setDragging(false);
          attachments.addFiles(Array.from(event.dataTransfer.files));
        }}
        className={cn(
          "relative grid gap-0 rounded-xl bg-surface shadow-md transition-shadow duration-300 ease-soft focus-within:shadow-glow",
          inline ? "p-3" : "p-4 min-[560px]:p-5",
        )}
      >
        {dragging ? (
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 z-10 grid place-items-center rounded-xl border-2 border-dashed border-accent bg-accent-soft/80 text-sm font-semibold"
          >
            Drop files to attach
          </div>
        ) : null}

        {!canSend ? (
          <p
            role="status"
            className="mb-3 rounded-lg bg-canvas-sunken px-3 py-2 text-sm text-ink-secondary"
          >
            Your role can read mail but not send it. Ask an Owner or Admin if you need to.
          </p>
        ) : null}

        <div className="flex items-center gap-2 border-b border-line py-1">
          <span className="w-11 shrink-0 text-[0.8125rem] text-ink-muted">From</span>
          <div className="min-w-0 flex-1">
            <SenderSelect
              senders={senders}
              value={senderId}
              onChange={changeSender}
              disabled={!editable}
              invalid={!!errors.senderId}
            />
          </div>
        </div>
        {errors.senderId ? (
          <p role="alert" className="pl-[3.25rem] text-xs text-danger-ink">
            {errors.senderId}
          </p>
        ) : sender && !sender.canReceiveReplies && sender.receivingNote ? (
          <p className="pl-[3.25rem] text-xs text-ink-muted">{sender.receivingNote}</p>
        ) : null}
        {senderInactive && sender ? (
          <p
            role="alert"
            className="mt-1 rounded-lg bg-warning-soft px-3 py-2 text-sm text-warning-ink"
          >
            {sender.address} can&apos;t send right now. {senderReason(sender)} Pick another sender
            to continue.
          </p>
        ) : null}

        <AddressField
          label="To"
          values={to}
          onChange={(v) => {
            setTo(v);
            setErrors((e) => ({ ...e, to: "" }));
          }}
          error={errors.to || null}
          disabled={!editable}
          placeholder="name@example.com"
          trailing={
            <>
              {!showCc ? (
                <Button type="button" variant="ghost" size="xs" onClick={() => setShowCc(true)}>
                  Cc
                </Button>
              ) : null}
              {!showBcc ? (
                <Button type="button" variant="ghost" size="xs" onClick={() => setShowBcc(true)}>
                  Bcc
                </Button>
              ) : null}
            </>
          }
        />
        {showCc ? (
          <AddressField
            label="Cc"
            values={cc}
            onChange={setCc}
            error={errors.cc || null}
            disabled={!editable}
          />
        ) : null}
        {showBcc ? (
          <AddressField
            label="Bcc"
            values={bcc}
            onChange={setBcc}
            error={errors.bcc || null}
            disabled={!editable}
          />
        ) : null}

        <div className="grid gap-1 border-b border-line">
          <div className="flex items-center gap-2 py-1">
            <label
              htmlFor="composer-subject"
              className="w-11 shrink-0 text-[0.8125rem] text-ink-muted"
            >
              Subject
            </label>
            <Input
              id="composer-subject"
              value={subject}
              maxLength={998}
              disabled={!editable}
              aria-invalid={!!errors.subject}
              onChange={(event) => {
                setSubject(event.target.value);
                setErrors((e) => ({ ...e, subject: "" }));
              }}
              className="h-8 border-transparent bg-transparent px-0 text-[0.9375rem] font-semibold shadow-none focus-visible:ring-0 dark:bg-transparent"
              placeholder="What's this about?"
            />
          </div>
          {errors.subject ? (
            <p role="alert" className="pl-[3.25rem] text-xs text-danger-ink">
              {errors.subject}
            </p>
          ) : null}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 pt-3">
          <Tabs value={mode} onValueChange={changeMode}>
            <TabsList aria-label="Editor mode">
              <TabsTrigger value="rich" disabled={!editable}>
                Rich text
              </TabsTrigger>
              <TabsTrigger value="html" disabled={!editable}>
                HTML
              </TabsTrigger>
              <span title="Templates are coming soon" className="inline-flex flex-1">
                <TabsTrigger value="template" disabled>
                  Template
                </TabsTrigger>
              </span>
            </TabsList>
          </Tabs>
          {previewVisible ? (
            <div className="flex items-center gap-1" role="group" aria-label="Preview options">
              <Button
                type="button"
                size="icon-sm"
                variant="ghost"
                aria-label="Desktop width"
                aria-pressed={previewWidth === "desktop"}
                onClick={() => setPreviewWidth("desktop")}
                className={cn(previewWidth === "desktop" && "bg-accent-soft")}
              >
                <Monitor aria-hidden />
              </Button>
              <Button
                type="button"
                size="icon-sm"
                variant="ghost"
                aria-label="Mobile width"
                aria-pressed={previewWidth === "mobile"}
                onClick={() => setPreviewWidth("mobile")}
                className={cn(previewWidth === "mobile" && "bg-accent-soft")}
              >
                <Smartphone aria-hidden />
              </Button>
              <Button
                type="button"
                size="icon-sm"
                variant="ghost"
                aria-label={previewDark ? "Light preview" : "Dark preview"}
                aria-pressed={previewDark}
                onClick={() => setPreviewDark((d) => !d)}
              >
                {previewDark ? <Sun aria-hidden /> : <Moon aria-hidden />}
              </Button>
            </div>
          ) : null}
          {mode === "rich" ? (
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={() => setShowPreview((v) => !v)}
              aria-pressed={showPreview}
            >
              {showPreview ? <EyeOff aria-hidden /> : <Eye aria-hidden />}
              {showPreview ? "Hide preview" : "Preview"}
            </Button>
          ) : null}
        </div>

        <div
          className={cn(
            "grid gap-4 py-3",
            previewVisible && "min-[900px]:grid-cols-2",
            inline ? "min-h-32" : "min-h-56",
          )}
        >
          <div className="min-w-0">
            <Suspense fallback={editorFallback}>
              {mode === "rich" ? (
                <RichEditor
                  key={`rich-${editorKey}`}
                  initialHtml={bodyHtml}
                  onChange={setBody}
                  disabled={!editable}
                />
              ) : (
                <HtmlEditor
                  key={`html-${editorKey}`}
                  value={bodyHtml}
                  onChange={setBody}
                  disabled={!editable}
                  className="h-full max-h-[32rem] rounded-lg bg-canvas-sunken"
                />
              )}
            </Suspense>
            {errors.html ? (
              <p role="alert" className="mt-2 text-xs text-danger-ink">
                {errors.html}
              </p>
            ) : null}
          </div>
          {previewVisible ? (
            <PreviewFrame
              html={isBodyBlank(bodyHtml) ? "" : bodyHtml}
              dark={previewDark}
              width={previewWidth}
              className="max-h-[32rem] min-h-64"
            />
          ) : null}
        </div>

        <AttachmentList
          items={attachments.items}
          onRemove={(key) => void attachments.remove(key)}
          disabled={!editable}
        />
        {errors.attachments ? (
          <p role="alert" className="text-xs text-danger-ink">
            {errors.attachments}
          </p>
        ) : null}

        {banner ? (
          <p
            role="alert"
            data-testid="composer-error"
            className="mt-3 rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger-ink"
          >
            {banner}
          </p>
        ) : null}
        {conflict ? (
          <div
            role="alert"
            className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-lg bg-warning-soft px-3 py-2 text-sm text-warning-ink"
          >
            <span>
              This draft was edited somewhere else, so your latest changes weren&apos;t saved.
            </span>
            <Button type="button" size="sm" variant="outline" onClick={() => void reloadLatest()}>
              Reload latest
            </Button>
          </div>
        ) : null}

        <div className="mt-3 flex flex-wrap items-center gap-1.5 border-t border-line pt-3">
          <AttachButton onFiles={attachments.addFiles} disabled={!editable} />
          <SchedulePicker
            value={scheduledAt}
            onChange={(value) => {
              setScheduledAt(value);
              setErrors((e) => ({ ...e, scheduledAt: "" }));
            }}
            timeZone={zone}
            disabled={!editable}
            error={errors.scheduledAt || null}
          />
          <span
            aria-live="polite"
            className={cn(
              "ml-1 min-w-0 truncate text-xs text-ink-muted",
              autosave.state === "error" && "text-danger-ink",
            )}
          >
            {saveText}
            {autosave.state === "error" ? (
              <button type="button" className="ml-1 underline" onClick={autosave.retry}>
                Retry
              </button>
            ) : null}
          </span>
          <div className="ml-auto flex items-center gap-2">
            {!inline && canSend ? (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => void discard()}
                disabled={sending || !!finished}
              >
                <Trash2 aria-hidden /> Discard
              </Button>
            ) : null}
            {sendDisabledReason ? (
              <Tooltip>
                <TooltipTrigger asChild>
                  <span tabIndex={0} className="inline-flex rounded-md" data-testid="send-wrapper">
                    {sendButton}
                  </span>
                </TooltipTrigger>
                <TooltipContent side="top">{sendDisabledReason}</TooltipContent>
              </Tooltip>
            ) : (
              sendButton
            )}
          </div>
        </div>
        <p className="mt-2 hidden text-right text-xs text-ink-faint min-[560px]:block">
          Ctrl or ⌘ + Enter sends
        </p>
      </div>
    </TooltipProvider>
  );
}
