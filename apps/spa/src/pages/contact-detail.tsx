import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate, useParams } from "@tanstack/react-router";
import { useEffect, useState } from "react";

import { BreadcrumbLabel } from "@/components/app/breadcrumb-label";
import { AudienceNav } from "@/components/audience/audience-nav";
import {
  ResourceError,
  ResourcePage,
  ResourcePending,
} from "@/components/resource-page";
import {
  deleteContact,
  setContactSegments,
  setContactTopics,
  updateContact,
} from "@/lib/actions";
import { getContact } from "@/lib/api";

export function ContactDetailPage() {
  const { orgSlug } = useParams({ from: "/$orgSlug" });
  const { contactId } = useParams({ strict: false }) as { contactId: string };
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [unsubscribed, setUnsubscribed] = useState(false);
  const [segmentIds, setSegmentIds] = useState<string[]>([]);
  const [topicSubs, setTopicSubs] = useState<
    Record<string, "opt_in" | "opt_out">
  >({});

  const contact = useQuery({
    queryKey: ["contact", orgSlug, contactId],
    queryFn: () => getContact(orgSlug, contactId),
  });

  useEffect(() => {
    if (!contact.data) return;
    setFirstName(contact.data.firstName);
    setLastName(contact.data.lastName);
    setUnsubscribed(contact.data.unsubscribed);
    setSegmentIds(contact.data.segments.map((s) => s.id));
    const subs: Record<string, "opt_in" | "opt_out"> = {};
    for (const t of contact.data.topics) subs[t.topicId] = t.subscription;
    for (const t of contact.data.options.topics) {
      if (!subs[t.id]) subs[t.id] = t.defaultSubscription;
    }
    setTopicSubs(subs);
  }, [contact.data]);

  const save = useMutation({
    mutationFn: async () => {
      const updated = await updateContact(orgSlug, {
        id: contactId,
        firstName,
        lastName,
        unsubscribed,
      });
      if (!updated.ok) return updated;
      if (contact.data?.writable) {
        const segs = await setContactSegments(orgSlug, contactId, segmentIds);
        if (!segs.ok) return segs;
        const topics = await setContactTopics(
          orgSlug,
          contactId,
          Object.entries(topicSubs).map(([topicId, subscription]) => ({
            topicId,
            subscription,
          })),
        );
        if (!topics.ok) return topics;
      }
      return updated;
    },
    onSuccess: async (result) => {
      if (!result.ok) {
        setError(result.error.message);
        return;
      }
      setError(null);
      await queryClient.invalidateQueries({ queryKey: ["contact", orgSlug, contactId] });
      await queryClient.invalidateQueries({ queryKey: ["contacts", orgSlug] });
    },
  });

  const remove = useMutation({
    mutationFn: () => deleteContact(orgSlug, contactId),
    onSuccess: async (result) => {
      if (!result.ok) {
        setError(result.error.message);
        return;
      }
      await queryClient.invalidateQueries({ queryKey: ["contacts", orgSlug] });
      await navigate({ to: "/$orgSlug/audience/contacts", params: { orgSlug } });
    },
  });

  const data = contact.data;

  return (
    <ResourcePage
      title={
        data
          ? [data.firstName, data.lastName].filter(Boolean).join(" ") || data.email
          : "Contact"
      }
      description={data ? `${data.email} · ${data.connectionName}` : "`GET /api/v1/contacts/:id`"}
    >
      {data ? <BreadcrumbLabel segment={contactId} label={data.email} /> : null}
      <AudienceNav orgSlug={orgSlug} />
      <Link
        to="/$orgSlug/audience/contacts"
        params={{ orgSlug }}
        className="text-sm font-medium text-accent-fill hover:underline"
      >
        ← Contacts
      </Link>

      {error ? (
        <p role="alert" className="rounded-md bg-danger-soft px-3 py-2 text-sm text-danger-ink">
          {error}
        </p>
      ) : null}

      {contact.isPending ? (
        <ResourcePending />
      ) : contact.isError || !data ? (
        <ResourceError message="Could not load this contact." />
      ) : (
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_280px]">
          <form
            className="grid gap-3 rounded-lg border border-line bg-surface p-4"
            onSubmit={(e) => {
              e.preventDefault();
              setError(null);
              save.mutate();
            }}
          >
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="grid gap-1 text-xs font-medium">
                First name
                <input
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                  disabled={!data.writable}
                  className="h-9 rounded-control border border-line bg-canvas px-3 text-sm disabled:opacity-60"
                />
              </label>
              <label className="grid gap-1 text-xs font-medium">
                Last name
                <input
                  value={lastName}
                  onChange={(e) => setLastName(e.target.value)}
                  disabled={!data.writable}
                  className="h-9 rounded-control border border-line bg-canvas px-3 text-sm disabled:opacity-60"
                />
              </label>
            </div>
            <label className="inline-flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={unsubscribed}
                onChange={(e) => setUnsubscribed(e.target.checked)}
                className="size-4 rounded border-line"
              />
              Unsubscribed
            </label>

            {data.options.segments.length > 0 ? (
              <fieldset className="grid gap-2">
                <legend className="text-xs font-semibold uppercase tracking-wide text-ink-muted">
                  Segments
                </legend>
                {data.options.segments.map((s) => (
                  <label key={s.id} className="inline-flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={segmentIds.includes(s.id)}
                      disabled={!data.writable}
                      onChange={(e) => {
                        setSegmentIds((prev) =>
                          e.target.checked
                            ? [...prev, s.id]
                            : prev.filter((id) => id !== s.id),
                        );
                      }}
                      className="size-4 rounded border-line"
                    />
                    {s.name}
                  </label>
                ))}
              </fieldset>
            ) : null}

            {data.options.topics.length > 0 ? (
              <fieldset className="grid gap-2">
                <legend className="text-xs font-semibold uppercase tracking-wide text-ink-muted">
                  Topics
                </legend>
                {data.options.topics.map((t) => (
                  <label
                    key={t.id}
                    className="flex flex-wrap items-center justify-between gap-2 text-sm"
                  >
                    <span>{t.name}</span>
                    <select
                      value={topicSubs[t.id] ?? t.defaultSubscription}
                      disabled={!data.writable}
                      onChange={(e) =>
                        setTopicSubs((prev) => ({
                          ...prev,
                          [t.id]: e.target.value as "opt_in" | "opt_out",
                        }))
                      }
                      className="h-8 rounded-control border border-line bg-canvas px-2 text-xs disabled:opacity-60"
                    >
                      <option value="opt_in">Opt in</option>
                      <option value="opt_out">Opt out</option>
                    </select>
                  </label>
                ))}
              </fieldset>
            ) : null}

            {Object.keys(data.properties).length > 0 ? (
              <div className="grid gap-1">
                <p className="text-xs font-semibold uppercase tracking-wide text-ink-muted">
                  Properties
                </p>
                <dl className="grid gap-1 text-sm">
                  {Object.entries(data.properties).map(([key, value]) => (
                    <div key={key} className="flex justify-between gap-3">
                      <dt className="text-ink-muted">{key}</dt>
                      <dd className="font-medium">{String(value)}</dd>
                    </div>
                  ))}
                </dl>
              </div>
            ) : null}

            <div className="flex flex-wrap gap-2">
              {data.writable ? (
                <button
                  type="submit"
                  disabled={save.isPending}
                  className="h-9 rounded-control bg-accent-fill px-4 text-sm font-semibold text-accent-ink disabled:opacity-50"
                >
                  {save.isPending ? "Saving…" : "Save"}
                </button>
              ) : (
                <p className="text-xs text-ink-muted">
                  This connection is read-only right now.
                </p>
              )}
              {data.writable ? (
                <button
                  type="button"
                  disabled={remove.isPending}
                  onClick={() => {
                    if (window.confirm(`Delete ${data.email}?`)) remove.mutate();
                  }}
                  className="h-9 rounded-control border border-line px-3 text-sm font-medium text-danger-ink hover:bg-danger-soft disabled:opacity-50"
                >
                  Delete
                </button>
              ) : null}
            </div>
          </form>

          <aside className="grid gap-3 self-start">
            <div className="rounded-lg border border-line bg-surface p-4">
              <h2 className="text-xs font-semibold uppercase tracking-wide text-ink-muted">
                Engagement
              </h2>
              <dl className="mt-2 grid grid-cols-2 gap-2 text-sm">
                <div>
                  <dt className="text-ink-muted">Sent</dt>
                  <dd className="font-semibold">{data.engagement.sent}</dd>
                </div>
                <div>
                  <dt className="text-ink-muted">Opened</dt>
                  <dd className="font-semibold">{data.engagement.opened}</dd>
                </div>
                <div>
                  <dt className="text-ink-muted">Clicked</dt>
                  <dd className="font-semibold">{data.engagement.clicked}</dd>
                </div>
                <div>
                  <dt className="text-ink-muted">Bounced</dt>
                  <dd className="font-semibold">{data.engagement.bounced}</dd>
                </div>
              </dl>
            </div>
            {data.recentEmails.length > 0 ? (
              <div className="rounded-lg border border-line bg-surface p-4">
                <h2 className="text-xs font-semibold uppercase tracking-wide text-ink-muted">
                  Recent mail
                </h2>
                <ul className="mt-2 grid gap-2">
                  {data.recentEmails.map((m) => (
                    <li key={m.id} className="text-sm">
                      <p className="truncate font-medium">{m.subject || "(no subject)"}</p>
                      <p className="text-xs text-ink-muted">
                        {m.direction} · {m.status} ·{" "}
                        {new Date(m.at).toLocaleDateString()}
                      </p>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </aside>
        </div>
      )}
    </ResourcePage>
  );
}
