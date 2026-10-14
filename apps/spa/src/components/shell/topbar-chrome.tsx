import { Link, useRouter, useRouterState } from "@tanstack/react-router";
import { Search } from "lucide-react";
import { useEffect, useId, useMemo, useRef, useState } from "react";

import { looksLikeId, useBreadcrumbLabel } from "@/components/app/breadcrumb-label";
import { buildCommandIndex, filterCommands } from "@/lib/command-index";
import { cn } from "@/lib/utils";

const labels: Record<string, string> = {
  "api-keys": "API keys",
  ai: "AI",
};

function label(segment: string) {
  if (labels[segment]) return labels[segment];
  const words = decodeURIComponent(segment).replace(/-/g, " ");
  return words.charAt(0).toUpperCase() + words.slice(1);
}

function Crumb({ segment, last }: { segment: string; last: boolean }) {
  const registered = useBreadcrumbLabel(segment);
  const text = registered ?? (looksLikeId(segment) ? "…" : label(segment));
  return (
    <span
      aria-current={last ? "page" : undefined}
      title={registered}
      className={cn("truncate", last && "font-semibold text-ink")}
    >
      {text}
    </span>
  );
}

export function Breadcrumbs({ orgName, orgSlug }: { orgName: string; orgSlug: string }) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const base = `/${orgSlug}`;
  const rest = pathname.startsWith(`${base}/`)
    ? pathname.slice(base.length + 1).split("/").filter(Boolean)
    : [];
  const crumbs = rest.length ? rest : ["overview"];

  return (
    <nav aria-label="Breadcrumb" className="min-w-0 flex-1 text-[0.8125rem] text-ink-muted">
      <ol className="flex min-w-0 items-center gap-1.5 overflow-hidden whitespace-nowrap">
        <li className="hidden min-w-0 shrink-[2] items-center gap-1.5 min-[420px]:flex">
          <Link
            to="/$orgSlug"
            params={{ orgSlug }}
            className="truncate rounded-sm hover:text-ink"
          >
            {orgName}
          </Link>
          <span aria-hidden>/</span>
        </li>
        {crumbs.map((segment, i) => {
          const last = i === crumbs.length - 1;
          return (
            <li
              key={`${segment}-${i}`}
              className={cn(
                "flex min-w-0 items-center gap-1.5",
                last ? "shrink-[6]" : "shrink",
                !last && "hidden sm:flex",
              )}
            >
              <Crumb segment={segment} last={last} />
              {!last ? <span aria-hidden>/</span> : null}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

/** ⌘K jump palette — workspace sections and settings. */
export function SearchPill({ orgSlug }: { orgSlug: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const titleId = useId();
  const listId = useId();

  const index = useMemo(() => buildCommandIndex(orgSlug), [orgSlug]);
  const hits = useMemo(() => filterCommands(index, query).slice(0, 12), [index, query]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    const el = dialogRef.current;
    if (!el) return;
    if (open && !el.open) {
      setQuery("");
      setActive(0);
      el.showModal();
      requestAnimationFrame(() => inputRef.current?.focus());
    }
    if (!open && el.open) el.close();
  }, [open]);

  useEffect(() => {
    setActive(0);
  }, [query]);

  function go(path: string) {
    setOpen(false);
    void router.navigate({ to: path });
  }

  return (
    <>
      <button
        type="button"
        aria-label="Search (Command K)"
        data-tour="command-palette"
        onClick={() => setOpen(true)}
        className="flex h-8 shrink-0 items-center gap-2 rounded-control bg-surface px-2.5 text-[0.8125rem] whitespace-nowrap text-ink-muted ring-1 ring-line transition-colors duration-150 outline-none hover:text-ink focus-visible:ring-2 focus-visible:ring-accent min-[1200px]:px-3.5"
      >
        <Search aria-hidden className="size-4" />
        <span className="hidden min-[1200px]:inline">Search…</span>
        <kbd className="hidden rounded-control bg-canvas-sunken px-1.5 py-px font-mono text-[0.6875rem] text-ink-muted min-[1200px]:inline">
          ⌘K
        </kbd>
      </button>
      <dialog
        ref={dialogRef}
        aria-labelledby={titleId}
        className="m-auto w-[min(100%,28rem)] rounded-xl border border-line bg-surface p-0 shadow-lg backdrop:bg-ink/40"
        onClose={() => setOpen(false)}
      >
        <div className="grid">
          <h2 id={titleId} className="sr-only">
            Jump to
          </h2>
          <div className="flex items-center gap-2 border-b border-line px-3">
            <Search aria-hidden className="size-4 shrink-0 text-ink-muted" />
            <input
              ref={inputRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Jump to a page…"
              aria-controls={listId}
              aria-autocomplete="list"
              className="h-11 w-full bg-transparent text-sm outline-none"
              onKeyDown={(e) => {
                if (e.key === "ArrowDown") {
                  e.preventDefault();
                  setActive((i) => Math.min(i + 1, Math.max(0, hits.length - 1)));
                } else if (e.key === "ArrowUp") {
                  e.preventDefault();
                  setActive((i) => Math.max(i - 1, 0));
                } else if (e.key === "Enter" && hits[active]) {
                  e.preventDefault();
                  go(hits[active]!.path);
                }
              }}
            />
          </div>
          <ul id={listId} role="listbox" className="max-h-72 overflow-y-auto p-1.5">
            {hits.length === 0 ? (
              <li className="px-3 py-6 text-center text-sm text-ink-muted">No matches.</li>
            ) : (
              hits.map((hit, i) => (
                <li key={hit.id} role="option" aria-selected={i === active}>
                  <button
                    type="button"
                    onClick={() => go(hit.path)}
                    onMouseEnter={() => setActive(i)}
                    className={cn(
                      "grid w-full gap-0.5 rounded-lg px-3 py-2 text-left",
                      i === active ? "bg-accent-soft" : "hover:bg-canvas-sunken",
                    )}
                  >
                    <span className="text-sm font-semibold">{hit.label}</span>
                    <span className="text-[0.75rem] text-ink-muted">{hit.group}</span>
                  </button>
                </li>
              ))
            )}
          </ul>
        </div>
      </dialog>
    </>
  );
}
