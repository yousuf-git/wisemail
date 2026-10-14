import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { Link, useParams } from "@tanstack/react-router";
import { Plus, Search, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { AudienceNav } from "@/components/audience/audience-nav";
import {
  ResourceEmpty,
  ResourceError,
  ResourcePage,
  ResourcePending,
} from "@/components/resource-page";
import { createContact } from "@/lib/actions";
import { getAudienceOptions, listContacts } from "@/lib/api";

type Filters = {
  q: string;
  connectionId: string;
  segmentId: string;
  topicId: string;
  status: "" | "subscribed" | "unsubscribed";
};

const EMPTY: Filters = {
  q: "",
  connectionId: "",
  segmentId: "",
  topicId: "",
  status: "",
};

function useDebounced<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(id);
  }, [value, delay]);
  return debounced;
}

export function ContactsPage() {
  const { orgSlug } = useParams({ from: "/$orgSlug/audience/contacts" });
  const queryClient = useQueryClient();
  const [filters, setFilters] = useState<Filters>(EMPTY);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const debouncedQ = useDebounced(filters.q, 250);
  const applied = { ...filters, q: debouncedQ };

  const options = useQuery({
    queryKey: ["audience-options", orgSlug],
    queryFn: () => getAudienceOptions(orgSlug),
  });

  const list = useInfiniteQuery({
    queryKey: ["contacts", orgSlug, applied],
    queryFn: ({ pageParam }) =>
      listContacts(orgSlug, {
        q: applied.q || undefined,
        connectionId: applied.connectionId || undefined,
        segmentId: applied.segmentId || undefined,
        topicId: applied.topicId || undefined,
        status: applied.status || undefined,
        cursor: pageParam,
      }),
    initialPageParam: null as string | null,
    getNextPageParam: (last) => last.nextCursor,
  });

  const rows = useMemo(() => list.data?.pages.flatMap((p) => p.items) ?? [], [list.data]);
  const writable = (options.data?.connections ?? []).filter((c) => c.writable);

  const create = useMutation({
    mutationFn: (input: {
      connectionId: string;
      email: string;
      firstName?: string;
      lastName?: string;
    }) => createContact(orgSlug, input),
    onSuccess: async (result) => {
      if (!result.ok) {
        setError(result.error.message);
        return;
      }
      setError(null);
      setCreating(false);
      await queryClient.invalidateQueries({ queryKey: ["contacts", orgSlug] });
    },
  });

  const filteredSegments = (options.data?.segments ?? []).filter(
    (s) => !applied.connectionId || s.connectionId === applied.connectionId,
  );
  const filteredTopics = (options.data?.topics ?? []).filter(
    (t) => !applied.connectionId || t.connectionId === applied.connectionId,
  );

  return (
    <ResourcePage
      title="Contacts"
      description="Everyone in your Resend accounts, with their segments and topic choices."
    >
      <AudienceNav orgSlug={orgSlug} />

      <div className="flex flex-wrap items-center gap-2">
        <label className="relative min-w-[12rem] flex-1">
          <Search
            aria-hidden
            className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-ink-muted"
          />
          <input
            value={filters.q}
            onChange={(e) => setFilters((f) => ({ ...f, q: e.target.value }))}
            placeholder="Search name or email…"
            className="h-9 w-full rounded-control border border-line bg-surface pr-8 pl-8 text-sm outline-none focus:ring-2 focus:ring-accent"
          />
          {filters.q ? (
            <button
              type="button"
              aria-label="Clear search"
              onClick={() => setFilters((f) => ({ ...f, q: "" }))}
              className="absolute top-1/2 right-2 -translate-y-1/2 text-ink-muted hover:text-ink"
            >
              <X className="size-3.5" />
            </button>
          ) : null}
        </label>
        <select
          value={filters.connectionId}
          onChange={(e) =>
            setFilters((f) => ({ ...f, connectionId: e.target.value, segmentId: "", topicId: "" }))
          }
          className="h-9 rounded-control border border-line bg-surface px-2 text-xs"
          aria-label="Connection"
        >
          <option value="">All connections</option>
          {(options.data?.connections ?? []).map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        <select
          value={filters.segmentId}
          onChange={(e) => setFilters((f) => ({ ...f, segmentId: e.target.value }))}
          className="h-9 rounded-control border border-line bg-surface px-2 text-xs"
          aria-label="Segment"
        >
          <option value="">All segments</option>
          {filteredSegments.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
        <select
          value={filters.topicId}
          onChange={(e) => setFilters((f) => ({ ...f, topicId: e.target.value }))}
          className="h-9 rounded-control border border-line bg-surface px-2 text-xs"
          aria-label="Topic"
        >
          <option value="">All topics</option>
          {filteredTopics.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </select>
        <select
          value={filters.status}
          onChange={(e) =>
            setFilters((f) => ({
              ...f,
              status: e.target.value as Filters["status"],
            }))
          }
          className="h-9 rounded-control border border-line bg-surface px-2 text-xs"
          aria-label="Status"
        >
          <option value="">Any status</option>
          <option value="subscribed">Subscribed</option>
          <option value="unsubscribed">Unsubscribed</option>
        </select>
        {writable.length > 0 ? (
          <button
            type="button"
            onClick={() => setCreating(true)}
            className="inline-flex h-9 items-center gap-1.5 rounded-control bg-accent-fill px-3 text-xs font-semibold text-accent-ink"
          >
            <Plus className="size-3.5" aria-hidden /> Add contact
          </button>
        ) : null}
      </div>

      {error ? (
        <p role="alert" className="rounded-md bg-danger-soft px-3 py-2 text-sm text-danger-ink">
          {error}
        </p>
      ) : null}

      {creating ? (
        <CreateContactForm
          connections={writable}
          busy={create.isPending}
          onCancel={() => setCreating(false)}
          onSubmit={(input) => {
            setError(null);
            create.mutate(input);
          }}
        />
      ) : null}

      {list.isPending ? (
        <ResourcePending />
      ) : list.isError ? (
        <ResourceError message="Could not load contacts." />
      ) : rows.length === 0 ? (
        <ResourceEmpty>
          {Object.values(applied).some(Boolean)
            ? "No contacts match these filters."
            : "No contacts synced yet."}
        </ResourceEmpty>
      ) : (
        <div className="overflow-hidden rounded-lg border border-line bg-surface">
          <ul className="divide-y divide-line">
            {rows.map((row) => {
              const name = [row.firstName, row.lastName].filter(Boolean).join(" ");
              return (
                <li key={row.id}>
                  <Link
                    to="/$orgSlug/audience/contacts/$contactId"
                    params={{ orgSlug, contactId: row.id }}
                    className="flex items-baseline justify-between gap-3 px-4 py-3 hover:bg-canvas-sunken"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{name || row.email}</p>
                      <p className="truncate text-xs text-ink-muted">
                        {row.email}
                        {name ? ` · ${row.connectionName}` : null}
                        {row.unsubscribed ? " · unsubscribed" : null}
                      </p>
                    </div>
                    <time className="shrink-0 text-xs text-ink-faint">
                      {new Date(row.createdAt).toLocaleDateString()}
                    </time>
                  </Link>
                </li>
              );
            })}
          </ul>
          {list.hasNextPage ? (
            <div className="border-t border-line p-2">
              <button
                type="button"
                disabled={list.isFetchingNextPage}
                onClick={() => void list.fetchNextPage()}
                className="h-9 w-full rounded-control text-sm font-medium text-ink-secondary hover:bg-canvas-sunken disabled:opacity-50"
              >
                {list.isFetchingNextPage ? "Loading…" : "Load more"}
              </button>
            </div>
          ) : null}
        </div>
      )}
    </ResourcePage>
  );
}

function CreateContactForm({
  connections,
  busy,
  onCancel,
  onSubmit,
}: {
  connections: { id: string; name: string }[];
  busy: boolean;
  onCancel: () => void;
  onSubmit: (input: {
    connectionId: string;
    email: string;
    firstName?: string;
    lastName?: string;
  }) => void;
}) {
  const [connectionId, setConnectionId] = useState(connections[0]?.id ?? "");
  const [email, setEmail] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");

  return (
    <form
      className="grid gap-3 rounded-lg border border-line bg-surface p-4"
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit({
          connectionId,
          email,
          firstName: firstName || undefined,
          lastName: lastName || undefined,
        });
      }}
    >
      <h2 className="text-sm font-semibold">New contact</h2>
      {connections.length > 1 ? (
        <label className="grid gap-1 text-xs font-medium">
          Connection
          <select
            required
            value={connectionId}
            onChange={(e) => setConnectionId(e.target.value)}
            className="h-9 rounded-control border border-line bg-canvas px-2 text-sm"
          >
            {connections.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
      ) : null}
      <label className="grid gap-1 text-xs font-medium">
        Email
        <input
          required
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="h-9 rounded-control border border-line bg-canvas px-3 text-sm"
        />
      </label>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="grid gap-1 text-xs font-medium">
          First name
          <input
            value={firstName}
            onChange={(e) => setFirstName(e.target.value)}
            className="h-9 rounded-control border border-line bg-canvas px-3 text-sm"
          />
        </label>
        <label className="grid gap-1 text-xs font-medium">
          Last name
          <input
            value={lastName}
            onChange={(e) => setLastName(e.target.value)}
            className="h-9 rounded-control border border-line bg-canvas px-3 text-sm"
          />
        </label>
      </div>
      <div className="flex gap-2">
        <button
          type="submit"
          disabled={busy || !connectionId}
          className="h-9 rounded-control bg-accent-fill px-4 text-sm font-semibold text-accent-ink disabled:opacity-50"
        >
          {busy ? "Creating…" : "Create"}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="h-9 rounded-control border border-line px-3 text-sm font-medium"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
