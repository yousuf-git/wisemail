"use client";

import { useInfiniteQuery, useQueryClient, type InfiniteData } from "@tanstack/react-query";
import { Plus, Search, Upload, X } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";

import { EmptyState } from "@/components/app/empty-state";
import { StatusChip } from "@/components/app/status-chip";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import type { AudienceOptionsDTO, ContactRowDTO } from "@/lib/dto/audience";
import type { Page } from "@/lib/dto/mail";
import { useLiveTopics } from "@/lib/realtime/live-context";
import { useLiveFallbackInterval } from "@/lib/realtime/use-live-query";
import {
  contactsKey,
  EMPTY_CONTACT_FILTERS,
  fetchContacts,
  hasContactFilters,
  type ContactFilters,
} from "./api";
import { ContactDialog } from "./contact-dialog";
import { ImportDialog } from "./import-dialog";

const ALL = "__all";

function FilterSelect({
  label,
  value,
  onChange,
  options,
  allLabel,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: { value: string; label: string }[];
  allLabel: string;
}) {
  return (
    <Select value={value || ALL} onValueChange={(v) => onChange(v === ALL ? "" : v)}>
      <SelectTrigger size="sm" aria-label={label} className="min-w-[8.5rem] bg-surface">
        <SelectValue />
      </SelectTrigger>
      <SelectContent position="popper">
        <SelectItem value={ALL}>{allLabel}</SelectItem>
        {options.map((o) => (
          <SelectItem key={o.value} value={o.value}>
            {o.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

export type ContactsViewProps = {
  orgSlug: string;
  options: AudienceOptionsDTO;
  /** Filters from the page URL (for example `?segmentId=` from the Segments page). */
  initialFilters?: ContactFilters;
  initialPage: Page<ContactRowDTO> | null;
  can: { create: boolean; import: boolean };
};

/**
 * Contacts across connections (PRD §5.9): search, filters for connection, segment, topic and
 * status, pages loading as you scroll, and the entry points for adding and importing.
 */
export function ContactsView({
  orgSlug,
  options,
  initialPage,
  initialFilters = EMPTY_CONTACT_FILTERS,
  can,
}: ContactsViewProps) {
  const [filters, setFilters] = useState<ContactFilters>(initialFilters);
  const [applied, setApplied] = useState<ContactFilters>(initialFilters);
  const [creating, setCreating] = useState(false);
  const [importing, setImporting] = useState(false);
  const sentinel = useRef<HTMLDivElement>(null);
  const queryClient = useQueryClient();

  useEffect(() => {
    const id = setTimeout(() => setApplied(filters), filters.q === applied.q ? 0 : 250);
    return () => clearTimeout(id);
  }, [filters, applied.q]);

  const sameAsInitial = JSON.stringify(applied) === JSON.stringify(initialFilters);
  const list = useInfiniteQuery({
    queryKey: contactsKey(orgSlug, applied),
    queryFn: ({ pageParam }) => fetchContacts(orgSlug, applied, pageParam),
    initialPageParam: null as string | null,
    getNextPageParam: (last: Page<ContactRowDTO>) => last.nextCursor,
    initialData:
      sameAsInitial && initialPage
        ? ({ pages: [initialPage], pageParams: [null] } satisfies InfiniteData<
            Page<ContactRowDTO>,
            string | null
          >)
        : undefined,
    refetchInterval: useLiveFallbackInterval(),
  });
  useLiveTopics(["contacts", "segments"], () => {
    void queryClient.invalidateQueries({ queryKey: ["contacts", orgSlug] });
  });
  const rows = useMemo(() => list.data?.pages.flatMap((p) => p.items) ?? [], [list.data]);

  const { hasNextPage, isFetchingNextPage, fetchNextPage } = list;
  useEffect(() => {
    const node = sentinel.current;
    if (!node || !hasNextPage) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting) && !isFetchingNextPage) void fetchNextPage();
      },
      { rootMargin: "320px" },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [hasNextPage, isFetchingNextPage, fetchNextPage, rows.length]);

  const set = (patch: Partial<ContactFilters>) => setFilters((f) => ({ ...f, ...patch }));
  const clear = () => {
    setFilters(EMPTY_CONTACT_FILTERS);
    setApplied(EMPTY_CONTACT_FILTERS);
  };
  const segments = options.segments.filter(
    (s) => !filters.connectionId || s.connectionId === filters.connectionId,
  );
  const topics = options.topics.filter(
    (t) => !filters.connectionId || t.connectionId === filters.connectionId,
  );
  const writable = options.connections.some((c) => c.writable);
  const hasConnections = options.connections.length > 0;

  if (!hasConnections) {
    return (
      <EmptyState title="Connect Resend to see your contacts" mood="idle">
        Contacts, segments and topics come from your connected Resend accounts.{" "}
        <Link
          className="font-semibold text-accent-fill underline"
          href={`/${orgSlug}/settings/connections`}
        >
          Open Connections
        </Link>
        .
      </EmptyState>
    );
  }

  return (
    <div className="grid gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div role="search" className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-[14rem] flex-1 md:w-72 md:flex-none">
            <Search
              aria-hidden
              className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-ink-muted"
            />
            <Input
              type="search"
              value={filters.q}
              onChange={(event) => set({ q: event.target.value })}
              placeholder="Search name or email"
              aria-label="Search contacts"
              className="h-8 bg-surface pr-3 pl-8 [&::-webkit-search-cancel-button]:hidden"
            />
          </div>
          {options.connections.length > 1 ? (
            <FilterSelect
              label="Account"
              value={filters.connectionId}
              onChange={(connectionId) => set({ connectionId, segmentId: "", topicId: "" })}
              options={options.connections.map((c) => ({ value: c.id, label: c.name }))}
              allLabel="All accounts"
            />
          ) : null}
          {segments.length > 0 ? (
            <FilterSelect
              label="Segment"
              value={filters.segmentId}
              onChange={(segmentId) => set({ segmentId })}
              options={segments.map((s) => ({ value: s.id, label: s.name }))}
              allLabel="Any segment"
            />
          ) : null}
          {topics.length > 0 ? (
            <FilterSelect
              label="Topic"
              value={filters.topicId}
              onChange={(topicId) => set({ topicId })}
              options={topics.map((t) => ({ value: t.id, label: t.name }))}
              allLabel="Any topic"
            />
          ) : null}
          <FilterSelect
            label="Status"
            value={filters.status}
            onChange={(status) => set({ status: status as ContactFilters["status"] })}
            options={[
              { value: "subscribed", label: "Subscribed" },
              { value: "unsubscribed", label: "Unsubscribed" },
            ]}
            allLabel="Any status"
          />
          {hasContactFilters(filters) ? (
            <Button type="button" variant="ghost" size="sm" onClick={clear}>
              <X aria-hidden /> Clear
            </Button>
          ) : null}
        </div>
        <div className="flex items-center gap-2">
          {can.import ? (
            <Button
              type="button"
              variant="outline"
              onClick={() => setImporting(true)}
              disabled={!writable}
            >
              <Upload aria-hidden /> Import CSV
            </Button>
          ) : null}
          {can.create ? (
            <Button
              type="button"
              onClick={() => setCreating(true)}
              disabled={!writable}
              className="font-bold"
            >
              <Plus aria-hidden /> New contact
            </Button>
          ) : null}
        </div>
      </div>

      <section aria-label="Contacts" className="rounded-xl bg-surface p-1.5 shadow-md">
        <div
          aria-hidden
          className="hidden grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)_minmax(0,1fr)_7.5rem] gap-x-3 px-3 py-2 text-[11px] font-semibold tracking-[0.06em] text-ink-muted uppercase md:grid"
        >
          <span>Contact</span>
          <span>Account</span>
          <span>Segments</span>
          <span className="text-right">Status</span>
        </div>
        {list.isPending ? (
          <ul className="grid gap-1 p-1.5" aria-busy="true" aria-label="Loading contacts">
            {Array.from({ length: 6 }, (_, i) => (
              <li key={i}>
                <Skeleton className="h-11 w-full" />
              </li>
            ))}
          </ul>
        ) : list.isError && rows.length === 0 ? (
          <p role="alert" className="p-4 text-sm text-ink-muted">
            We couldn&apos;t load your contacts. Try again in a moment.
          </p>
        ) : rows.length === 0 ? (
          <div className="p-3">
            {hasContactFilters(applied) ? (
              <EmptyState
                mood="detective"
                mascotSize={112}
                title="No contacts match these filters"
                action={
                  <Button type="button" variant="outline" onClick={clear}>
                    Clear filters
                  </Button>
                }
              >
                Try a shorter search, or another segment.
              </EmptyState>
            ) : (
              <EmptyState
                mood="happy"
                mascotSize={112}
                title="No contacts yet"
                action={
                  can.import && writable ? (
                    <Button type="button" onClick={() => setImporting(true)} className="font-bold">
                      <Upload aria-hidden /> Import a CSV
                    </Button>
                  ) : null
                }
              >
                Contacts appear here once Resend has synced them. You can also import a CSV or add
                someone by hand.
              </EmptyState>
            )}
          </div>
        ) : (
          <>
            <ul role="list" className="grid gap-0.5">
              {rows.map((row) => (
                <ContactRow key={row.id} orgSlug={orgSlug} row={row} options={options} />
              ))}
            </ul>
            <div ref={sentinel} aria-hidden className="h-px" />
            {isFetchingNextPage ? (
              <p role="status" className="p-3 text-center text-xs text-ink-muted">
                Loading more…
              </p>
            ) : null}
          </>
        )}
      </section>

      {creating ? (
        <ContactDialog
          orgSlug={orgSlug}
          options={options}
          open
          onOpenChange={(open) => !open && setCreating(false)}
        />
      ) : null}
      {importing ? (
        <ImportDialog
          orgSlug={orgSlug}
          options={options}
          open
          onOpenChange={(open) => !open && setImporting(false)}
        />
      ) : null}
    </div>
  );
}

function ContactRow({
  orgSlug,
  row,
  options,
}: {
  orgSlug: string;
  row: ContactRowDTO;
  options: AudienceOptionsDTO;
}) {
  const names = row.segmentIds
    .map((id) => options.segments.find((s) => s.id === id)?.name)
    .filter((n): n is string => !!n);
  const name = [row.firstName, row.lastName].filter(Boolean).join(" ");
  return (
    <li data-testid="contact-row">
      <Link
        href={`/${orgSlug}/audience/contacts/${row.id}`}
        className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1 rounded-lg px-3 py-2.5 transition-colors duration-150 outline-none hover:bg-canvas focus-visible:ring-2 focus-visible:ring-accent md:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)_minmax(0,1fr)_7.5rem] md:gap-y-0"
      >
        <span className="order-1 min-w-0">
          <span className="block truncate text-[13.5px] font-semibold">{row.email}</span>
          {name ? <span className="block truncate text-xs text-ink-muted">{name}</span> : null}
        </span>
        <span className="order-2 justify-self-end md:order-4">
          <StatusChip state={row.unsubscribed ? "neutral" : "success"}>
            {row.unsubscribed ? "Unsubscribed" : "Subscribed"}
          </StatusChip>
        </span>
        <span className="order-3 col-span-2 truncate text-[13px] text-ink-muted md:order-2 md:col-span-1">
          {row.connectionName}
        </span>
        <span className="order-4 col-span-2 truncate text-[13px] text-ink-muted md:order-3 md:col-span-1">
          {names.length
            ? names.slice(0, 2).join(", ") + (names.length > 2 ? ` +${names.length - 2}` : "")
            : "No segments"}
        </span>
      </Link>
    </li>
  );
}
