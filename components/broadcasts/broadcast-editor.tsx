"use client";

import { Eye, Loader2, Monitor, Moon, Send, Smartphone, Sun, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { lazy, Suspense, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import {
  cancelBroadcastAction,
  createBroadcastAction,
  deleteBroadcastAction,
  refreshBroadcastAction,
  sendBroadcastTestAction,
  updateBroadcastAction,
} from "@/app/(app)/[orgSlug]/broadcasts/actions";
import { LiveRefresh } from "@/components/app/live-refresh";
import { StatusChip } from "@/components/app/status-chip";
import { ConfirmDeleteDialog } from "@/components/audience/confirm-delete-dialog";
import { ConnectionSelect, firstWritable } from "@/components/audience/connection-select";
import { audienceError, fieldErrorMap } from "@/components/audience/errors";
import { isBodyBlank, isLossyForRich } from "@/components/composer/compose-validation";
import { PreviewFrame } from "@/components/composer/preview-frame";
import { formatScheduled } from "@/components/composer/schedule";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { BroadcastDTO, BroadcastFormOptionsDTO, BroadcastStatus } from "@/lib/dto/audience";
import { previewMergeTags } from "@/lib/mail/template-vars";
import { cn } from "@/lib/utils";
import { BroadcastStats } from "./broadcast-stats";
import { SendDialog } from "./send-dialog";
import { broadcastStatusLabel, broadcastStatusState } from "./status";

const RichEditor = lazy(() => import("@/components/composer/rich-editor"));
const HtmlEditor = lazy(() => import("@/components/composer/html-editor"));

const NO_TOPIC = "__none";
const STARTER_HTML = `<p>Hi {{{FIRST_NAME|there}}},</p>
<p>Write your message here.</p>
<p style="color:#6b6b6b;font-size:12px">You are receiving this because you subscribed. <a href="{{{RESEND_UNSUBSCRIBE_URL}}}">Unsubscribe</a></p>`;
const FOOTER_HTML = `<p style="color:#6b6b6b;font-size:12px">Don't want these emails? <a href="{{{RESEND_UNSUBSCRIBE_URL}}}">Unsubscribe</a></p>`;
const FOOTER_TEXT = `<p>Don't want these emails? Unsubscribe: {{{RESEND_UNSUBSCRIBE_URL}}}</p>`;

const PENDING: BroadcastStatus[] = ["queued", "sending"];

type Fields = {
  connectionId: string;
  name: string;
  senderId: string;
  segmentId: string;
  topicId: string;
  subject: string;
  previewText: string;
  html: string;
  templateId: string;
};

const fieldsKey = (f: Fields) => JSON.stringify(f);

/**
 * Broadcast editor and detail (PRD §5.9, UC-23). A draft is edited here (every save goes to
 * Resend first); a sent or scheduled one is shown read-only with its results and the actions that
 * still apply: cancel a schedule, delete, or remove it from Wisemail.
 */
export function BroadcastEditor({
  orgSlug,
  broadcast,
  options,
  can,
  timeZone,
}: {
  orgSlug: string;
  /** `null` for a new broadcast. */
  broadcast: BroadcastDTO | null;
  options: BroadcastFormOptionsDTO;
  can: { create: boolean; send: boolean };
  timeZone: string;
}) {
  const router = useRouter();
  const isNew = broadcast === null;
  const isDraft = isNew || broadcast.status === "draft";

  const initial = useMemo<Fields>(
    () => ({
      connectionId: broadcast?.connectionId ?? firstWritable(options.connections),
      name: broadcast?.name === "Untitled broadcast" ? "" : (broadcast?.name ?? ""),
      senderId: broadcast?.senderId ?? "",
      segmentId: broadcast?.segmentId ?? "",
      topicId: broadcast?.topicId ?? "",
      subject: broadcast?.subject ?? "",
      previewText: broadcast?.previewText ?? "",
      html: broadcast?.html ?? STARTER_HTML,
      templateId: broadcast?.templateId ?? "",
    }),
    // The editor is remounted with a new key when a newer version arrives.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );
  const [fields, setFields] = useState<Fields>(initial);
  const [saved, setSaved] = useState(() => fieldsKey(initial));
  const [version, setVersion] = useState(broadcast?.version ?? 0);
  const [mode, setMode] = useState<"rich" | "html">(() =>
    !broadcast || isLossyForRich(broadcast.html) || /href=["']?\{\{\{/.test(broadcast.html)
      ? "html"
      : "rich",
  );
  const [editorKey, setEditorKey] = useState(0);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [banner, setBanner] = useState<string | null>(null);
  const [busy, setBusy] = useState<null | "save" | "test">(null);
  const [sending, setSending] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [canceling, setCanceling] = useState(false);
  const [width, setWidth] = useState<"desktop" | "mobile">("desktop");
  const [dark, setDark] = useState(false);

  const set = (patch: Partial<Fields>) => {
    setFields((f) => ({ ...f, ...patch }));
    setErrors((e) => Object.fromEntries(Object.entries(e).filter(([k]) => !(k in patch))));
  };
  const dirty = fieldsKey(fields) !== saved;
  const editable = isDraft && can.create && (isNew || broadcast.writable);

  const senders = options.senders.filter((s) => s.connectionId === fields.connectionId);
  const segments = options.segments.filter((s) => s.connectionId === fields.connectionId);
  const topics = options.topics.filter((t) => t.connectionId === fields.connectionId);
  const templates = options.templates.filter((t) => t.connectionId === fields.connectionId);
  const previewHtml = useMemo(
    () => previewMergeTags(isBodyBlank(fields.html) ? "" : fields.html),
    [fields.html],
  );

  // Sent and queued broadcasts move on their own; ask Resend until they settle.
  useEffect(() => {
    if (!broadcast) return;
    const overdue =
      broadcast.status === "scheduled" &&
      !!broadcast.scheduledAt &&
      new Date(broadcast.scheduledAt).getTime() <= Date.now();
    if (!(PENDING.includes(broadcast.status) || overdue)) return;
    let live = true;
    const tick = async () => {
      const result = await refreshBroadcastAction(orgSlug, { id: broadcast.id });
      if (live && result.ok && result.data.status !== broadcast.status) router.refresh();
    };
    void tick();
    const timer = setInterval(() => void tick(), 8000);
    return () => {
      live = false;
      clearInterval(timer);
    };
  }, [broadcast, orgSlug, router]);

  function validate(): Record<string, string> {
    const local: Record<string, string> = {};
    if (!fields.name.trim()) local.name = "Give the broadcast a name.";
    if (!fields.connectionId) local.connectionId = "Choose an account.";
    if (!fields.senderId) local.senderId = "Choose who it comes from.";
    if (!fields.segmentId) local.segmentId = "Choose who receives it.";
    if (!fields.subject.trim()) local.subject = "Add a subject.";
    if (isBodyBlank(fields.html)) local.html = "Write the message.";
    return local;
  }

  /** Saves the draft; resolves with the broadcast id, or null when something needs fixing. */
  async function save(): Promise<string | null> {
    setBanner(null);
    const local = validate();
    setErrors(local);
    if (Object.keys(local).length) {
      setBanner("Fix the highlighted fields, then save again.");
      return null;
    }
    const body = {
      name: fields.name,
      segmentId: fields.segmentId,
      senderId: fields.senderId,
      subject: fields.subject,
      previewText: fields.previewText,
      topicId: fields.topicId || null,
      html: fields.html,
      templateId: fields.templateId || null,
    };
    setBusy("save");
    const result = broadcast
      ? await updateBroadcastAction(orgSlug, { id: broadcast.id, version, ...body })
      : await createBroadcastAction(orgSlug, { connectionId: fields.connectionId, ...body });
    setBusy(null);
    if (!result.ok) {
      setErrors(fieldErrorMap(result.error.fieldErrors));
      setBanner(audienceError(result.error));
      if (result.error.code === "conflict") {
        toast.error("This draft was edited somewhere else", {
          description: "Reload to get the latest version.",
          action: { label: "Reload", onClick: () => router.refresh() },
        });
      }
      return null;
    }
    setVersion(result.data.version);
    setSaved(fieldsKey(fields));
    if (!broadcast) {
      toast.success("Draft saved");
      router.replace(`/${orgSlug}/broadcasts/${result.data.id}`);
    } else {
      toast.success("Draft saved");
      router.refresh();
    }
    return result.data.id;
  }

  async function sendTest() {
    const id = dirty || isNew ? await save() : broadcast!.id;
    if (!id) return;
    setBusy("test");
    const result = await sendBroadcastTestAction(orgSlug, { id });
    setBusy(null);
    if (!result.ok) return void setBanner(audienceError(result.error));
    toast.success(`Test sent to ${result.data.to}`);
  }

  async function openSend() {
    const id = dirty || isNew ? await save() : broadcast!.id;
    if (id && !broadcast) return; // a new draft navigates to its own page; send from there
    if (id) setSending(true);
  }

  function useTemplate(id: string) {
    const template = templates.find((t) => t.id === id);
    if (!template) return;
    if (
      !isBodyBlank(fields.html) &&
      fields.html !== STARTER_HTML &&
      !window.confirm("Replace the current message with this template?")
    )
      return;
    set({
      html: template.html,
      templateId: template.id,
      ...(fields.subject.trim() ? {} : { subject: template.subject }),
    });
    setMode("html");
    setEditorKey((k) => k + 1);
    toast.success(`Started from ${template.name}`);
  }

  function addFooter() {
    const footer = mode === "html" ? FOOTER_HTML : FOOTER_TEXT;
    set({ html: `${fields.html.trim()}\n${footer}` });
    setEditorKey((k) => k + 1);
  }

  const busyIcon = <Loader2 aria-hidden className="animate-spin" />;
  const hasUnsubscribe = /RESEND_UNSUBSCRIBE_URL|unsubscribe/i.test(fields.html);
  const deletable = broadcast
    ? ["draft", "scheduled", "canceled"].includes(broadcast.status)
    : false;

  return (
    <div className="grid gap-4">
      {broadcast && !isDraft ? (
        <LiveRefresh topics={["broadcasts", `broadcast:${broadcast.id}`, "emails"]} />
      ) : null}
      <div className="flex flex-wrap items-center gap-2">
        {broadcast ? (
          <StatusChip state={broadcastStatusState(broadcast.status)}>
            {broadcastStatusLabel(broadcast.status)}
          </StatusChip>
        ) : null}
        {broadcast?.status === "scheduled" && broadcast.scheduledAt ? (
          <span className="text-sm text-ink-secondary">
            Goes out {formatScheduled(new Date(broadcast.scheduledAt), timeZone)}
          </span>
        ) : null}
        {broadcast?.sentAt && broadcast.status !== "scheduled" ? (
          <span className="text-sm text-ink-secondary">
            Sent{" "}
            {new Date(broadcast.sentAt).toLocaleString([], {
              dateStyle: "medium",
              timeStyle: "short",
            })}
          </span>
        ) : null}
        {isDraft && !isNew && dirty ? (
          <span className="text-xs text-ink-muted">Unsaved changes</span>
        ) : null}
        <div className="ml-auto flex flex-wrap items-center gap-2">
          {broadcast && can.send && broadcast.writable && broadcast.status === "scheduled" ? (
            <Button type="button" variant="outline" onClick={() => setCanceling(true)}>
              Cancel schedule
            </Button>
          ) : null}
          {broadcast && (can.create || can.send) ? (
            <Button
              type="button"
              variant="ghost"
              className="text-danger-ink"
              onClick={() => setDeleting(true)}
              disabled={deletable && !broadcast.writable}
            >
              <Trash2 aria-hidden /> {deletable ? "Delete" : "Remove from Wisemail"}
            </Button>
          ) : null}
          {editable ? (
            <>
              <Button type="button" variant="outline" disabled={!!busy} onClick={() => void save()}>
                {busy === "save" ? busyIcon : null}
                Save draft
              </Button>
              {can.send ? (
                <>
                  <Button
                    type="button"
                    variant="outline"
                    disabled={!!busy}
                    onClick={() => void sendTest()}
                  >
                    {busy === "test" ? busyIcon : null}
                    Send test to me
                  </Button>
                  <Button
                    type="button"
                    className="font-bold"
                    disabled={!!busy || isNew}
                    onClick={() => void openSend()}
                    title={isNew ? "Save the draft first" : undefined}
                  >
                    <Send aria-hidden /> Send or schedule…
                  </Button>
                </>
              ) : null}
            </>
          ) : null}
        </div>
      </div>

      {broadcast && broadcast.status === "draft" && broadcast.warnings.length > 0 && !dirty ? (
        <ul className="grid gap-1.5" aria-label="Things to check">
          {broadcast.warnings.map((w) => (
            <li
              key={w}
              role="status"
              className="rounded-lg bg-warning-soft px-3 py-2 text-sm text-warning-ink"
            >
              {w}
            </li>
          ))}
        </ul>
      ) : null}
      {!editable && isDraft ? (
        <p
          role="status"
          className="rounded-xl bg-canvas-sunken px-4 py-3 text-sm text-ink-secondary"
        >
          {can.create
            ? "This account isn't accepting changes right now, so the draft is view-only."
            : "Your role can view broadcasts but not change them."}
        </p>
      ) : null}
      {!isDraft ? (
        <p
          role="status"
          className="rounded-xl bg-canvas-sunken px-4 py-3 text-sm text-ink-secondary"
        >
          {broadcast.status === "scheduled"
            ? "This broadcast is scheduled, so it can't be edited. Cancel the schedule and start a new draft to change it."
            : broadcast.status === "canceled"
              ? "This broadcast was canceled, so it can't be edited or sent. Start a new draft to send it."
              : "This broadcast has been handed to Resend and can't be edited."}
        </p>
      ) : null}
      {banner ? (
        <p
          role="alert"
          data-testid="broadcast-error"
          className="rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger-ink"
        >
          {banner}
        </p>
      ) : null}

      {broadcast &&
      broadcast.stats &&
      ["sent", "sending", "queued", "failed"].includes(broadcast.status) ? (
        <BroadcastStats stats={broadcast.stats} />
      ) : null}

      <div className="grid gap-4 min-[1000px]:grid-cols-2">
        <div className="grid content-start gap-4 rounded-xl bg-surface p-4 shadow-md min-[560px]:p-5">
          {isNew && options.connections.length > 1 ? (
            <ConnectionSelect
              id="broadcast-connection"
              connections={options.connections}
              value={fields.connectionId}
              onChange={(id) =>
                set({ connectionId: id, senderId: "", segmentId: "", topicId: "", templateId: "" })
              }
            />
          ) : null}
          <div className="grid gap-1.5">
            <Label htmlFor="broadcast-name">Name</Label>
            <Input
              id="broadcast-name"
              value={fields.name}
              maxLength={150}
              disabled={!editable}
              aria-invalid={!!errors.name}
              onChange={(e) => set({ name: e.target.value })}
              placeholder="October newsletter"
            />
            <p className="text-xs text-ink-muted">Only you and your team see this.</p>
            {errors.name ? (
              <p role="alert" className="text-xs text-danger-ink">
                {errors.name}
              </p>
            ) : null}
          </div>
          <div className="grid gap-4">
            <div className="grid gap-1.5">
              <Label htmlFor="broadcast-sender">From</Label>
              <Select
                value={fields.senderId}
                onValueChange={(v) => set({ senderId: v })}
                disabled={!editable}
              >
                <SelectTrigger
                  id="broadcast-sender"
                  className="w-full"
                  aria-invalid={!!errors.senderId}
                >
                  <SelectValue
                    placeholder={
                      broadcast?.from ||
                      (senders.length ? "Choose a sender" : "No senders on this account")
                    }
                  />
                </SelectTrigger>
                <SelectContent>
                  {senders.map((s) => (
                    <SelectItem key={s.id} value={s.id} disabled={!!s.problem}>
                      {s.displayName ? `${s.displayName} <${s.address}>` : s.address}
                      {s.problem ? " (can't send)" : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {errors.senderId ? (
                <p role="alert" className="text-xs text-danger-ink">
                  {errors.senderId}
                </p>
              ) : null}
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="broadcast-segment">To</Label>
              <Select
                value={fields.segmentId}
                onValueChange={(v) => set({ segmentId: v })}
                disabled={!editable}
              >
                <SelectTrigger
                  id="broadcast-segment"
                  className="w-full"
                  aria-invalid={!!errors.segmentId}
                >
                  <SelectValue
                    placeholder={
                      segments.length ? "Choose a segment" : "No segments on this account"
                    }
                  />
                </SelectTrigger>
                <SelectContent>
                  {segments.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.name} ({s.contactCount.toLocaleString()})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {errors.segmentId ? (
                <p role="alert" className="text-xs text-danger-ink">
                  {errors.segmentId}
                </p>
              ) : null}
            </div>
          </div>
          {topics.length > 0 ? (
            <div className="grid gap-1.5">
              <Label htmlFor="broadcast-topic">
                Topic <span className="font-normal text-ink-muted">(optional)</span>
              </Label>
              <Select
                value={fields.topicId || NO_TOPIC}
                onValueChange={(v) => set({ topicId: v === NO_TOPIC ? "" : v })}
                disabled={!editable}
              >
                <SelectTrigger id="broadcast-topic" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NO_TOPIC}>Everyone in the segment</SelectItem>
                  {topics.map((t) => (
                    <SelectItem key={t.id} value={t.id}>
                      Only people subscribed to {t.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ) : null}
          <div className="grid gap-1.5">
            <Label htmlFor="broadcast-subject">Subject</Label>
            <Input
              id="broadcast-subject"
              value={fields.subject}
              maxLength={998}
              disabled={!editable}
              aria-invalid={!!errors.subject}
              onChange={(e) => set({ subject: e.target.value })}
              placeholder="What's new this month"
            />
            {errors.subject ? (
              <p role="alert" className="text-xs text-danger-ink">
                {errors.subject}
              </p>
            ) : null}
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="broadcast-preview-text">
              Preview text <span className="font-normal text-ink-muted">(optional)</span>
            </Label>
            <Input
              id="broadcast-preview-text"
              value={fields.previewText}
              maxLength={200}
              disabled={!editable}
              onChange={(e) => set({ previewText: e.target.value })}
              placeholder="Shown next to the subject in the inbox"
            />
          </div>

          <div className="grid gap-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-sm leading-none font-medium">Message</span>
              {editable ? (
                <div className="flex flex-wrap items-center gap-2">
                  {templates.length > 0 ? (
                    <Select value="" onValueChange={useTemplate}>
                      <SelectTrigger size="sm" aria-label="Start from a template" className="w-52">
                        <SelectValue placeholder="Start from a template" />
                      </SelectTrigger>
                      <SelectContent>
                        {templates.map((t) => (
                          <SelectItem key={t.id} value={t.id}>
                            {t.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  ) : null}
                  <Tabs
                    value={mode}
                    onValueChange={(next) => {
                      if (next === mode) return;
                      if (
                        next === "rich" &&
                        (isLossyForRich(fields.html) || /href=["']?\{\{\{/.test(fields.html)) &&
                        !window.confirm(
                          "Rich text keeps simple formatting only. Custom HTML and the unsubscribe link may be simplified. Switch anyway?",
                        )
                      )
                        return;
                      setMode(next as "rich" | "html");
                      setEditorKey((k) => k + 1);
                    }}
                  >
                    <TabsList aria-label="Editor mode">
                      <TabsTrigger value="rich">Rich text</TabsTrigger>
                      <TabsTrigger value="html">HTML</TabsTrigger>
                    </TabsList>
                  </Tabs>
                </div>
              ) : null}
            </div>
            <Suspense fallback={<Skeleton className="h-64 w-full rounded-lg" />}>
              {mode === "rich" ? (
                <RichEditor
                  key={`rich-${editorKey}`}
                  initialHtml={fields.html}
                  onChange={(html) => set({ html })}
                  disabled={!editable}
                />
              ) : (
                <HtmlEditor
                  key={`html-${editorKey}`}
                  value={fields.html}
                  onChange={(html) => set({ html })}
                  disabled={!editable}
                  className={cn(
                    "h-72 max-h-[32rem] rounded-lg bg-canvas-sunken",
                    errors.html && "ring-2 ring-danger",
                  )}
                />
              )}
            </Suspense>
            {errors.html ? (
              <p role="alert" className="text-xs text-danger-ink">
                {errors.html}
              </p>
            ) : null}
            {editable && !hasUnsubscribe ? (
              <p
                className="flex flex-wrap items-center gap-2 rounded-lg bg-warning-soft px-3 py-2 text-sm text-warning-ink"
                data-testid="unsubscribe-warning"
              >
                <span>
                  No unsubscribe link yet. Resend fills in {"{{{RESEND_UNSUBSCRIBE_URL}}}"} for each
                  person.
                </span>
                <Button type="button" size="xs" variant="outline" onClick={addFooter}>
                  Add unsubscribe footer
                </Button>
              </p>
            ) : null}
          </div>
        </div>

        <section
          aria-label="Preview"
          className="grid content-start gap-2 rounded-xl bg-surface p-4 shadow-md min-[560px]:p-5"
        >
          <div className="flex items-center justify-between gap-2">
            <h2 className="flex items-center gap-1.5 text-lg font-semibold tracking-[-0.01em]">
              <Eye aria-hidden className="size-4 text-ink-muted" /> Preview
            </h2>
            <div className="flex items-center gap-1" role="group" aria-label="Preview options">
              <Button
                type="button"
                size="icon-sm"
                variant="ghost"
                aria-label="Desktop width"
                aria-pressed={width === "desktop"}
                onClick={() => setWidth("desktop")}
                className={cn(width === "desktop" && "bg-accent-soft")}
              >
                <Monitor aria-hidden />
              </Button>
              <Button
                type="button"
                size="icon-sm"
                variant="ghost"
                aria-label="Mobile width"
                aria-pressed={width === "mobile"}
                onClick={() => setWidth("mobile")}
                className={cn(width === "mobile" && "bg-accent-soft")}
              >
                <Smartphone aria-hidden />
              </Button>
              <Button
                type="button"
                size="icon-sm"
                variant="ghost"
                aria-label={dark ? "Light preview" : "Dark preview"}
                aria-pressed={dark}
                onClick={() => setDark((d) => !d)}
              >
                {dark ? <Sun aria-hidden /> : <Moon aria-hidden />}
              </Button>
            </div>
          </div>
          {fields.subject ? (
            <p className="truncate text-sm">
              <span className="text-ink-muted">Subject: </span>
              <span className="font-semibold">{fields.subject}</span>
            </p>
          ) : null}
          <p className="text-xs text-ink-muted">
            Names and links use placeholders here; Resend fills them in for each person.
          </p>
          <PreviewFrame
            html={previewHtml}
            dark={dark}
            width={width}
            title="Broadcast preview"
            className="max-h-[36rem] min-h-72"
          />
        </section>
      </div>

      {sending && broadcast ? (
        <SendDialog
          orgSlug={orgSlug}
          broadcast={{
            id: broadcast.id,
            name: fields.name || broadcast.name,
            subject: fields.subject,
            segmentName: segments.find((s) => s.id === fields.segmentId)?.name ?? null,
          }}
          warnings={broadcast.warnings}
          timeZone={timeZone}
          onClose={() => setSending(false)}
          onSent={(result) => {
            setSending(false);
            toast.success(
              result.status === "scheduled"
                ? `Scheduled for ${formatScheduled(new Date(result.scheduledAt!), timeZone)}`
                : "On its way",
            );
            router.refresh();
          }}
        />
      ) : null}

      {broadcast ? (
        <>
          <ConfirmDeleteDialog
            open={canceling}
            onOpenChange={setCanceling}
            title="Cancel this scheduled broadcast?"
            confirmLabel="Cancel broadcast"
            onConfirm={async () => {
              const result = await cancelBroadcastAction(orgSlug, { id: broadcast.id });
              if (!result.ok) return audienceError(result.error);
              toast.success("Canceled. It won't be sent.");
              router.refresh();
              return null;
            }}
          >
            <p>Resend won&apos;t send it. Nothing has gone out yet.</p>
          </ConfirmDeleteDialog>
          <ConfirmDeleteDialog
            open={deleting}
            onOpenChange={setDeleting}
            title={
              deletable ? `Delete ${broadcast.name}?` : `Remove ${broadcast.name} from Wisemail?`
            }
            confirmLabel={deletable ? "Delete broadcast" : "Remove from Wisemail"}
            onConfirm={async () => {
              const result = await deleteBroadcastAction(orgSlug, { id: broadcast.id });
              if (!result.ok) return audienceError(result.error);
              toast.success(
                result.data.removedInResend ? "Broadcast deleted" : "Removed from Wisemail",
              );
              router.push(`/${orgSlug}/broadcasts`);
              return null;
            }}
          >
            {deletable ? (
              <p>
                This also deletes the{" "}
                {broadcast.status === "scheduled"
                  ? "scheduled broadcast (it won't be sent)"
                  : "broadcast"}{" "}
                in Resend ({broadcast.connectionName}). It can&apos;t be undone.
              </p>
            ) : (
              <>
                <p>
                  Resend doesn&apos;t allow deleting a broadcast that has been sent, so it stays
                  there. This only removes it from Wisemail.
                </p>
                <p>Its emails stay in your activity log.</p>
              </>
            )}
          </ConfirmDeleteDialog>
        </>
      ) : null}
    </div>
  );
}
