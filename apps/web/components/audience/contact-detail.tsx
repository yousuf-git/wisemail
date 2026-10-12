"use client";

import { Pencil, Trash2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

import {
  deleteContactAction,
  setContactSegmentsAction,
  setContactTopicsAction,
  updateContactAction,
} from "@/app/(app)/[orgSlug]/audience/actions";
import { LiveRefresh } from "@/components/app/live-refresh";
import { PageHeader } from "@/components/app/page-header";
import { StatusChip } from "@/components/app/status-chip";
import { relativeTime, useNow } from "@/components/inbox/format";
import { statusLabel, statusState } from "@/components/activity/status";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import type { EmailStatus } from "@/lib/db/models/emails";
import type { ContactDetailDTO } from "@/lib/dto/audience";
import { ConfirmDeleteDialog } from "./confirm-delete-dialog";
import { ContactEditDialog } from "./contact-edit-dialog";
import { audienceError } from "./errors";

type Can = { update: boolean; unsubscribe: boolean; delete: boolean; activity: boolean };

function Card({
  title,
  children,
  action,
}: {
  title: string;
  children: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <section className="grid content-start gap-3 rounded-xl bg-surface p-4 shadow-md min-[560px]:p-5">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-lg font-semibold tracking-[-0.01em]">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}

/** One contact (PRD §5.9): properties, segments, topic choices, engagement and recent mail. */
export function ContactDetail({
  orgSlug,
  contact,
  can,
}: {
  orgSlug: string;
  contact: ContactDetailDTO;
  can: Can;
}) {
  const router = useRouter();
  const now = useNow();
  const [editing, setEditing] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [segmentIds, setSegmentIds] = useState(() => contact.segments.map((s) => s.id));
  const editable = can.update && contact.writable;
  const segmentsDirty =
    segmentIds.length !== contact.segments.length ||
    segmentIds.some((id) => !contact.segments.some((s) => s.id === id));

  const name = [contact.firstName, contact.lastName].filter(Boolean).join(" ");
  const canToggleSubscription =
    contact.writable && (contact.unsubscribed ? can.update : can.unsubscribe);

  async function run<T>(
    key: string,
    action: () => Promise<
      { ok: true; data: T } | { ok: false; error: Parameters<typeof audienceError>[0] }
    >,
    success: string,
  ) {
    setBusy(key);
    const result = await action();
    setBusy(null);
    if (!result.ok) {
      toast.error(audienceError(result.error));
      router.refresh();
      return false;
    }
    toast.success(success);
    router.refresh();
    return true;
  }

  return (
    <div className="grid gap-4">
      <LiveRefresh topics={["contacts", "segments", "topics", "contact_properties"]} />
      <PageHeader
        title={contact.email}
        description={
          <>
            {name ? `${name} · ` : ""}
            {contact.connectionName}
          </>
        }
        actions={
          <>
            {editable ? (
              <Button type="button" variant="outline" onClick={() => setEditing(true)}>
                <Pencil aria-hidden /> Edit
              </Button>
            ) : null}
            {canToggleSubscription ? (
              <Button
                type="button"
                variant="outline"
                disabled={busy === "unsub"}
                onClick={() =>
                  void run(
                    "unsub",
                    () =>
                      updateContactAction(orgSlug, {
                        id: contact.id,
                        unsubscribed: !contact.unsubscribed,
                      }),
                    contact.unsubscribed ? "Resubscribed" : "Unsubscribed",
                  )
                }
              >
                {contact.unsubscribed ? "Resubscribe" : "Unsubscribe"}
              </Button>
            ) : null}
            {can.delete && contact.writable ? (
              <Button
                type="button"
                variant="ghost"
                className="text-danger-ink"
                onClick={() => setDeleting(true)}
              >
                <Trash2 aria-hidden /> Delete
              </Button>
            ) : null}
          </>
        }
      />

      {!contact.writable ? (
        <p role="status" className="rounded-xl bg-warning-soft px-4 py-3 text-sm text-warning-ink">
          {contact.connectionName} isn&apos;t accepting changes right now (read-only or needs
          attention), so this contact can only be viewed.
        </p>
      ) : null}

      <div className="grid gap-4 min-[900px]:grid-cols-2">
        <Card title="Details">
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
            <dt className="text-ink-muted">Status</dt>
            <dd>
              <StatusChip state={contact.unsubscribed ? "neutral" : "success"}>
                {contact.unsubscribed ? "Unsubscribed" : "Subscribed"}
              </StatusChip>
            </dd>
            <dt className="text-ink-muted">Added</dt>
            <dd>{new Date(contact.createdAt).toLocaleDateString()}</dd>
            {contact.options.properties.map((p) => (
              <div key={p.id} className="contents">
                <dt className="text-ink-muted">{p.key}</dt>
                <dd className="min-w-0 break-words">
                  {contact.properties[p.key] ?? (
                    <span className="text-ink-muted">
                      Not set{p.fallbackValue !== null ? ` (default ${p.fallbackValue})` : ""}
                    </span>
                  )}
                </dd>
              </div>
            ))}
          </dl>
        </Card>

        <Card title="Engagement">
          <dl className="grid grid-cols-2 gap-3 text-sm min-[560px]:grid-cols-4">
            {(
              [
                ["Sent", contact.engagement.sent],
                ["Opened", contact.engagement.opened],
                ["Clicked", contact.engagement.clicked],
                ["Bounced", contact.engagement.bounced],
              ] as const
            ).map(([label, value]) => (
              <div key={label} className="rounded-lg bg-canvas-sunken px-3 py-2">
                <dt className="text-xs text-ink-muted">{label}</dt>
                <dd className="text-xl font-bold tabular-nums">{value}</dd>
              </div>
            ))}
          </dl>
          <p className="text-xs text-ink-muted">
            {contact.engagement.lastOpenedAt
              ? `Last opened ${new Date(contact.engagement.lastOpenedAt).toLocaleDateString()}.`
              : "Counts fill in as Resend reports opens and clicks."}
          </p>
        </Card>

        <Card
          title="Segments"
          action={
            editable && segmentsDirty ? (
              <Button
                type="button"
                size="sm"
                disabled={busy === "segments"}
                onClick={() =>
                  void run(
                    "segments",
                    () => setContactSegmentsAction(orgSlug, { id: contact.id, segmentIds }),
                    "Segments saved",
                  )
                }
              >
                {busy === "segments" ? "Saving…" : "Save segments"}
              </Button>
            ) : null
          }
        >
          {contact.options.segments.length === 0 ? (
            <p className="text-sm text-ink-muted">This account has no segments yet.</p>
          ) : (
            <ul className="grid gap-1.5">
              {contact.options.segments.map((s) => (
                <li key={s.id}>
                  <label className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={segmentIds.includes(s.id)}
                      disabled={!editable}
                      onChange={(e) =>
                        setSegmentIds((ids) =>
                          e.target.checked ? [...ids, s.id] : ids.filter((x) => x !== s.id),
                        )
                      }
                      className="size-4 accent-[var(--accent)]"
                    />
                    {s.name}
                  </label>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card title="Topics">
          {contact.topics.length === 0 ? (
            <p className="text-sm text-ink-muted">This account has no topics yet.</p>
          ) : (
            <ul className="grid gap-2">
              {contact.topics.map((t) => (
                <li key={t.topicId} className="flex items-center justify-between gap-3 text-sm">
                  <span>
                    {t.name}
                    {t.isDefault ? (
                      <span className="ml-1.5 text-xs text-ink-muted">(default)</span>
                    ) : null}
                  </span>
                  <span className="flex items-center gap-2">
                    <span className="text-xs text-ink-muted">
                      {t.subscription === "opt_in" ? "Subscribed" : "Opted out"}
                    </span>
                    <Switch
                      aria-label={`${t.name}: subscribed`}
                      checked={t.subscription === "opt_in"}
                      disabled={!editable || busy === t.topicId}
                      onCheckedChange={(checked) =>
                        void run(
                          t.topicId,
                          () =>
                            setContactTopicsAction(orgSlug, {
                              id: contact.id,
                              subscriptions: [
                                {
                                  topicId: t.topicId,
                                  subscription: checked ? "opt_in" : "opt_out",
                                },
                              ],
                            }),
                          checked ? `Subscribed to ${t.name}` : `Opted out of ${t.name}`,
                        )
                      }
                    />
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <Card title="Recent emails">
        {contact.recentEmails.length === 0 ? (
          <p className="text-sm text-ink-muted">
            Nothing sent to this address through Wisemail yet.
          </p>
        ) : (
          <ul className="grid gap-0.5">
            {contact.recentEmails.map((e) => {
              const row = (
                <>
                  <span className="min-w-0 truncate text-[13.5px] font-medium">
                    {e.subject || "(no subject)"}
                  </span>
                  <StatusChip state={statusState(e.status as EmailStatus)}>
                    {statusLabel(e.status as EmailStatus)}
                  </StatusChip>
                  <time dateTime={e.at} className="text-xs text-ink-muted tabular-nums">
                    {now ? relativeTime(e.at, now) : e.at.slice(0, 10)}
                  </time>
                </>
              );
              return (
                <li key={e.id}>
                  {can.activity ? (
                    <Link
                      href={`/${orgSlug}/activity/${e.id}`}
                      className="grid grid-cols-[minmax(0,1fr)_auto_5rem] items-center gap-3 rounded-lg px-2 py-2 outline-none hover:bg-canvas focus-visible:ring-2 focus-visible:ring-accent"
                    >
                      {row}
                    </Link>
                  ) : (
                    <div className="grid grid-cols-[minmax(0,1fr)_auto_5rem] items-center gap-3 px-2 py-2">
                      {row}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </Card>

      {editing ? (
        <ContactEditDialog
          orgSlug={orgSlug}
          contact={contact}
          open
          onOpenChange={(o) => !o && setEditing(false)}
        />
      ) : null}
      <ConfirmDeleteDialog
        open={deleting}
        onOpenChange={setDeleting}
        title={`Delete ${contact.email}?`}
        confirmLabel="Delete contact"
        onConfirm={async () => {
          const result = await deleteContactAction(orgSlug, { id: contact.id });
          if (!result.ok) return audienceError(result.error);
          toast.success("Contact deleted");
          router.push(`/${orgSlug}/audience/contacts`);
          return null;
        }}
      >
        <p>
          This also deletes the contact in Resend ({contact.connectionName}). It can&apos;t be
          undone.
        </p>
        <p>Emails already sent to this address stay in your activity log.</p>
      </ConfirmDeleteDialog>
    </div>
  );
}
