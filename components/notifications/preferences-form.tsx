"use client";

import { Lock } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { updateNotificationPreferencesAction } from "@/app/(app)/[orgSlug]/settings/notifications/actions";
import { FormAlert } from "@/components/auth/auth-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import type { NotificationPreferencesDTO } from "@/lib/dto/notification";
import {
  DIGEST_HOUR,
  PREFERENCE_INFO,
  PREFERENCE_TYPES,
  type PreferenceType,
} from "@/lib/notifications/types";

const GROUPS = ["Mail", "Health"] as const;

/** UC-19: per-type channels, quiet hours and the daily digest (org time zone). */
export function PreferencesForm({
  orgSlug,
  initial,
}: {
  orgSlug: string;
  initial: NotificationPreferencesDTO;
}) {
  const [channels, setChannels] = useState(initial.channels);
  const [quiet, setQuiet] = useState(initial.quietHours);
  const [digest, setDigest] = useState(initial.digest);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const set = (type: PreferenceType, channel: "inApp" | "email", value: boolean) =>
    setChannels((c) => ({ ...c, [type]: { ...c[type]!, [channel]: value } }));

  async function save(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    const result = await updateNotificationPreferencesAction(orgSlug, {
      channels,
      quietHours: quiet,
      digest,
    });
    setSaving(false);
    if (!result.ok) {
      setError(result.error.fieldErrors?.["quietHours.start"]?.[0] ?? result.error.message);
      return;
    }
    toast.success("Notification settings saved");
  }

  return (
    <form onSubmit={save} className="grid gap-6" noValidate data-testid="notification-preferences">
      <FormAlert>{error}</FormAlert>

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
                      <Switch
                        checked={channels[type]?.[channel] ?? false}
                        onCheckedChange={(v) => set(type, channel, v)}
                        aria-label={`${PREFERENCE_INFO[type].label}, ${channel === "inApp" ? "in the app" : "by email"}`}
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
            <Switch
              checked={quiet !== null}
              onCheckedChange={(v) =>
                setQuiet(v ? { start: "22:00", end: "07:00", timezone: initial.orgTimezone } : null)
              }
              aria-label="Hold emails during quiet hours"
            />
          </label>
          {quiet ? (
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <label className="flex items-center gap-2">
                From
                <Input
                  type="time"
                  value={quiet.start}
                  onChange={(e) => setQuiet({ ...quiet, start: e.target.value })}
                  className="w-32"
                />
              </label>
              <label className="flex items-center gap-2">
                to
                <Input
                  type="time"
                  value={quiet.end}
                  onChange={(e) => setQuiet({ ...quiet, end: e.target.value })}
                  className="w-32"
                />
              </label>
            </div>
          ) : null}
        </div>
      </section>

      <section aria-labelledby="digest-h" className="grid gap-2">
        <h2 id="digest-h" className="flex items-center gap-2 text-base font-semibold">
          Daily digest
          {initial.digestAllowed ? null : <Lock aria-hidden className="size-3.5 text-ink-faint" />}
        </h2>
        <div className="flex items-center justify-between gap-3 rounded-xl bg-surface p-4 shadow-md">
          <span className="grid">
            <span className="text-sm font-semibold">Email me a summary each morning</span>
            <span className="text-[0.8125rem] text-ink-muted">
              {initial.digestAllowed
                ? `Sent around ${String(DIGEST_HOUR).padStart(2, "0")}:00 ${initial.orgTimezone}: last 24 hours of mail, alerts and unread items.`
                : `Digests are on Pro and above. You're on ${initial.planLabel}.`}
            </span>
          </span>
          <Switch
            checked={digest === "daily"}
            onCheckedChange={(v) => setDigest(v ? "daily" : "none")}
            disabled={!initial.digestAllowed}
            aria-label="Daily digest"
          />
        </div>
      </section>

      <div>
        <Button type="submit" size="lg" className="font-bold" disabled={saving}>
          {saving ? "Saving…" : "Save changes"}
        </Button>
      </div>
    </form>
  );
}
