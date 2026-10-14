import { Link } from "@tanstack/react-router";
import { Lock } from "lucide-react";
import { useEffect, useState } from "react";

import { callOrgAction, type NotificationPrefs } from "@/lib/api";

const DIGEST_HOUR = 8;

const PREFERENCE_TYPES = [
  "inbound_received",
  "reply_opened",
  "complaint",
  "bounce",
  "incident_opened",
  "incident_resolved",
  "connection_attention",
  "domain_changed",
] as const;

type PreferenceType = (typeof PREFERENCE_TYPES)[number];

const PREFERENCE_INFO: Record<
  PreferenceType,
  { label: string; hint: string; group: "Mail" | "Health" }
> = {
  inbound_received: {
    label: "New inbound email",
    hint: "Someone wrote to one of your addresses.",
    group: "Mail",
  },
  reply_opened: {
    label: "Reply opened",
    hint: "Someone opened an email you sent.",
    group: "Mail",
  },
  bounce: {
    label: "Bounces",
    hint: "One notification per bounced email. Can get busy, so it starts off.",
    group: "Mail",
  },
  complaint: {
    label: "Spam complaints",
    hint: "A recipient marked an email as spam.",
    group: "Mail",
  },
  incident_opened: {
    label: "Alert fired",
    hint: "One of your alert rules found a problem.",
    group: "Health",
  },
  incident_resolved: {
    label: "Alert resolved",
    hint: "The problem cleared on its own.",
    group: "Health",
  },
  connection_attention: {
    label: "Connection needs attention",
    hint: "A Resend key was revoked or a webhook can't be registered.",
    group: "Health",
  },
  domain_changed: {
    label: "Domain status changed",
    hint: "Resend verified a domain or flagged a problem with it.",
    group: "Health",
  },
};

const GROUPS = ["Mail", "Health"] as const;

type Channels = NotificationPrefs["channels"];

export function PreferencesForm({
  orgSlug,
  initial,
  onSaved,
}: {
  orgSlug: string;
  initial: NotificationPrefs;
  onSaved?: () => void;
}) {
  const [channels, setChannels] = useState<Channels>(initial.channels);
  const [quiet, setQuiet] = useState(initial.quietHours);
  const [digest, setDigest] = useState(initial.digest);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedNote, setSavedNote] = useState(false);

  useEffect(() => {
    setChannels(initial.channels);
    setQuiet(initial.quietHours);
    setDigest(initial.digest);
  }, [initial]);

  const set = (type: PreferenceType, channel: "inApp" | "email", value: boolean) =>
    setChannels((c) => ({ ...c, [type]: { ...c[type]!, [channel]: value } }));

  async function save(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    setSavedNote(false);
    const result = await callOrgAction("settings.notifications.update", orgSlug, {
      channels,
      quietHours: quiet,
      digest,
    });
    setSaving(false);
    if (!result.ok) {
      const fields = result.error.fieldErrors;
      setError(fields?.["quietHours.start"]?.[0] ?? result.error.message);
      return;
    }
    setSavedNote(true);
    onSaved?.();
  }

  return (
    <form onSubmit={save} className="grid gap-6" noValidate data-testid="notification-preferences">
      {error ? (
        <p role="alert" className="rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger-ink">
          {error}
        </p>
      ) : null}
      {savedNote ? (
        <p role="status" className="rounded-lg bg-success-soft px-3 py-2 text-sm text-success-ink">
          Notification settings saved
        </p>
      ) : null}

      {GROUPS.map((group) => (
        <section key={group} aria-labelledby={`prefs-${group}`} className="grid gap-2">
          <h2 id={`prefs-${group}`} className="text-base font-semibold">
            {group}
          </h2>
          <div className="overflow-hidden rounded-xl bg-surface shadow-md">
            <div className="grid grid-cols-[minmax(0,1fr)_4.5rem_4.5rem] gap-x-3 border-b border-line bg-canvas-sunken px-4 py-2 text-xs font-semibold text-ink-muted">
              <span>Tell me about</span>
              <span className="text-center">In the app</span>
              <span className="text-center">By email</span>
            </div>
            <ul>
              {PREFERENCE_TYPES.filter((t) => PREFERENCE_INFO[t].group === group).map((type) => (
                <li
                  key={type}
                  className="grid grid-cols-[minmax(0,1fr)_4.5rem_4.5rem] items-center gap-x-3 border-b border-line px-4 py-3 last:border-b-0"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-semibold">{PREFERENCE_INFO[type].label}</p>
                    <p className="text-[0.8125rem] text-ink-muted">{PREFERENCE_INFO[type].hint}</p>
                  </div>
                  {(["inApp", "email"] as const).map((channel) => (
                    <div key={channel} className="grid place-items-center">
                      <input
                        type="checkbox"
                        role="switch"
                        checked={channels[type]?.[channel] ?? false}
                        onChange={(e) => set(type, channel, e.target.checked)}
                        aria-label={`${PREFERENCE_INFO[type].label}, ${channel === "inApp" ? "in the app" : "by email"}`}
                        className="size-4 accent-accent"
                      />
                    </div>
                  ))}
                </li>
              ))}
            </ul>
          </div>
        </section>
      ))}

      <section aria-labelledby="quiet-h" className="grid gap-2">
        <h2 id="quiet-h" className="text-base font-semibold">
          Quiet hours
        </h2>
        <div className="grid gap-3 rounded-xl bg-surface p-4 shadow-md">
          <label className="flex items-center justify-between gap-3">
            <span className="grid">
              <span className="text-sm font-semibold">Hold emails overnight</span>
              <span className="text-[0.8125rem] text-ink-muted">
                Emails wait until quiet hours end. In-app notifications still arrive. Times are in{" "}
                {initial.orgTimezone}.
              </span>
            </span>
            <input
              type="checkbox"
              role="switch"
              checked={quiet !== null}
              onChange={(e) =>
                setQuiet(
                  e.target.checked
                    ? { start: "22:00", end: "07:00", timezone: initial.orgTimezone }
                    : null,
                )
              }
              aria-label="Hold emails during quiet hours"
              className="size-4 accent-accent"
            />
          </label>
          {quiet ? (
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <label className="flex items-center gap-2">
                From
                <input
                  type="time"
                  value={quiet.start}
                  onChange={(e) => setQuiet({ ...quiet, start: e.target.value })}
                  className="h-9 w-32 rounded-md border border-line-strong bg-surface px-2.5 text-sm outline-none focus-visible:ring-2 focus-visible:ring-accent"
                />
              </label>
              <label className="flex items-center gap-2">
                to
                <input
                  type="time"
                  value={quiet.end}
                  onChange={(e) => setQuiet({ ...quiet, end: e.target.value })}
                  className="h-9 w-32 rounded-md border border-line-strong bg-surface px-2.5 text-sm outline-none focus-visible:ring-2 focus-visible:ring-accent"
                />
              </label>
            </div>
          ) : null}
        </div>
      </section>

      <section aria-labelledby="digest-h" className="grid gap-2">
        <h2 id="digest-h" className="flex items-center gap-2 text-base font-semibold">
          Daily digest
          {initial.digestAllowed ? null : <Lock aria-hidden className="size-3.5 text-ink-muted" />}
        </h2>
        <div className="flex items-center justify-between gap-3 rounded-xl bg-surface p-4 shadow-md">
          <span className="grid">
            <span className="text-sm font-semibold">Email me a summary each morning</span>
            <span className="text-[0.8125rem] text-ink-muted">
              {initial.digestAllowed ? (
                `Sent around ${String(DIGEST_HOUR).padStart(2, "0")}:00 ${initial.orgTimezone}: last 24 hours of mail, alerts and unread items.`
              ) : (
                <>
                  Digests are on Pro and above. You&apos;re on {initial.planLabel}.{" "}
                  <Link
                    to="/$orgSlug/settings/billing"
                    params={{ orgSlug }}
                    className="font-semibold text-ink underline underline-offset-4"
                  >
                    See plans
                  </Link>
                </>
              )}
            </span>
          </span>
          <input
            type="checkbox"
            role="switch"
            checked={digest === "daily"}
            onChange={(e) => setDigest(e.target.checked ? "daily" : "none")}
            disabled={!initial.digestAllowed}
            aria-label="Daily digest"
            className="size-4 accent-accent"
          />
        </div>
      </section>

      <div>
        <button
          type="submit"
          disabled={saving}
          className="h-10 rounded-control bg-accent-fill px-5 text-sm font-bold text-accent-ink hover:bg-accent-fill-hover disabled:opacity-50"
        >
          {saving ? "Saving…" : "Save changes"}
        </button>
      </div>
    </form>
  );
}
