import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate, useParams } from "@tanstack/react-router";
import { useMemo, useState } from "react";

import { updateGeneralSettings } from "@/lib/actions";
import { getGeneralSettings } from "@/lib/api";

function timeZones(current: string): string[] {
  let zones: string[] = [];
  try {
    zones = Intl.supportedValuesOf("timeZone");
  } catch {
    /* older engines */
  }
  return [...new Set(["UTC", current, ...zones])].sort();
}

export function SettingsGeneralPage() {
  const { orgSlug } = useParams({ from: "/$orgSlug/settings/general" });
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const settings = useQuery({
    queryKey: ["settings", "general", orgSlug],
    queryFn: () => getGeneralSettings(orgSlug),
  });

  if (settings.isPending) {
    return <p className="text-sm text-ink-muted">Loading settings…</p>;
  }
  if (settings.isError || !settings.data) {
    return (
      <p role="alert" className="rounded-md bg-danger-soft px-3 py-2 text-sm text-danger-ink">
        Could not load general settings.
      </p>
    );
  }

  return (
    <GeneralForm
      orgSlug={orgSlug}
      initial={settings.data}
      onSaved={async (next) => {
        await queryClient.invalidateQueries({ queryKey: ["settings", "general"] });
        if (next.slug !== orgSlug) {
          await navigate({
            to: "/$orgSlug/settings/general",
            params: { orgSlug: next.slug },
          });
        }
      }}
    />
  );
}

function GeneralForm({
  orgSlug,
  initial,
  onSaved,
}: {
  orgSlug: string;
  initial: { name: string; slug: string; timezone: string };
  onSaved: (next: { name: string; slug: string; timezone: string }) => Promise<void>;
}) {
  const [name, setName] = useState(initial.name);
  const [slug, setSlug] = useState(initial.slug);
  const [timezone, setTimezone] = useState(initial.timezone);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({});
  const zones = useMemo(() => timeZones(initial.timezone), [initial.timezone]);
  const slugChanged = slug !== initial.slug;

  const save = useMutation({
    mutationFn: () => updateGeneralSettings(orgSlug, { name, slug, timezone }),
    onSuccess: async (result) => {
      if (!result.ok) {
        setFieldErrors(result.error.fieldErrors ?? {});
        setError(result.error.message);
        return;
      }
      setError(null);
      setFieldErrors({});
      await onSaved(result.data);
    },
  });

  return (
    <section className="grid max-w-xl gap-4">
      <header>
        <h1 className="text-xl font-semibold tracking-tight">General</h1>
        <p className="text-sm text-ink-muted">
          Workspace name, address, and time zone for digests and daily numbers.
        </p>
      </header>
      <form
        className="grid gap-4 rounded-xl border border-line bg-surface p-5 shadow-sm"
        onSubmit={(e) => {
          e.preventDefault();
          setError(null);
          setFieldErrors({});
          save.mutate();
        }}
        noValidate
      >
        {error ? (
          <p role="alert" className="rounded-md bg-danger-soft px-3 py-2 text-sm text-danger-ink">
            {error}
          </p>
        ) : null}
        <label className="grid gap-1.5 text-sm font-medium">
          Workspace name
          <input
            className="h-10 rounded-control border border-line-strong bg-canvas px-3 outline-none focus:ring-2 focus:ring-accent"
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={60}
          />
          {fieldErrors.name?.[0] ? (
            <span className="text-[0.8125rem] font-normal text-danger-ink">{fieldErrors.name[0]}</span>
          ) : null}
        </label>
        <label className="grid gap-1.5 text-sm font-medium">
          Address
          <span className="flex items-center gap-2">
            <span className="text-ink-muted">/</span>
            <input
              className="h-10 w-full rounded-control border border-line-strong bg-canvas px-3 outline-none focus:ring-2 focus:ring-accent"
              value={slug}
              onChange={(e) => setSlug(e.target.value.toLowerCase())}
              maxLength={40}
            />
          </span>
          <span className="text-[0.8125rem] font-normal text-ink-muted">
            {slugChanged
              ? "Changing the address breaks old bookmarks. You will land on the new address after saving."
              : "Lowercase letters, numbers and dashes."}
          </span>
          {fieldErrors.slug?.[0] ? (
            <span className="text-[0.8125rem] font-normal text-danger-ink">{fieldErrors.slug[0]}</span>
          ) : null}
        </label>
        <label className="grid gap-1.5 text-sm font-medium">
          Time zone
          <select
            className="h-10 rounded-control border border-line-strong bg-canvas px-3 outline-none focus:ring-2 focus:ring-accent"
            value={timezone}
            onChange={(e) => setTimezone(e.target.value)}
          >
            {zones.map((z) => (
              <option key={z} value={z}>
                {z}
              </option>
            ))}
          </select>
          {fieldErrors.timezone?.[0] ? (
            <span className="text-[0.8125rem] font-normal text-danger-ink">
              {fieldErrors.timezone[0]}
            </span>
          ) : null}
        </label>
        <button
          type="submit"
          disabled={save.isPending}
          className="h-10 rounded-control bg-accent-fill text-sm font-semibold text-accent-ink hover:bg-accent-fill-hover disabled:opacity-60"
        >
          {save.isPending ? "Saving…" : "Save changes"}
        </button>
      </form>
    </section>
  );
}
