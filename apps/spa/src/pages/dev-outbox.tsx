import { useQuery } from "@tanstack/react-query";

import { apiUrl } from "@/lib/api-base";

type OutboxRow = {
  id: string;
  kind: string;
  to: string;
  subject: string;
  link: string | null;
  code?: string | null;
  sentAt: string;
  html?: string;
};

export function DevOutboxPage() {
  const outbox = useQuery({
    queryKey: ["dev-outbox"],
    queryFn: async () => {
      const res = await fetch(apiUrl("/api/dev/outbox"), { credentials: "include" });
      if (!res.ok) throw new Error(res.status === 404 ? "Dev outbox is off." : `HTTP ${res.status}`);
      return (await res.json()) as { items: OutboxRow[] };
    },
    refetchInterval: 5_000,
  });

  return (
    <main className="mx-auto grid w-full max-w-3xl gap-4 px-4 py-10">
      <h1 className="text-2xl font-bold">Dev outbox</h1>
      <p className="text-ink-muted">
        System email in fake mode ends up here instead of a real inbox. Newest first.
      </p>
      {outbox.isPending ? (
        <p className="text-sm text-ink-muted">Loading…</p>
      ) : outbox.isError ? (
        <p role="alert" className="rounded-xl bg-danger-soft px-4 py-3 text-sm text-danger-ink">
          {outbox.error.message}
        </p>
      ) : outbox.data.items.length === 0 ? (
        <p className="rounded-xl bg-surface p-6 shadow-md">Nothing sent yet.</p>
      ) : (
        <ul className="grid gap-3">
          {outbox.data.items.map((row) => (
            <li
              key={row.id}
              data-testid="outbox-row"
              data-kind={row.kind}
              className="grid gap-2 rounded-xl bg-surface p-4 shadow-md"
            >
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <p className="font-semibold">{row.subject}</p>
                <time className="text-xs text-ink-muted" dateTime={row.sentAt}>
                  {row.sentAt}
                </time>
              </div>
              <p className="text-sm text-ink-muted">
                {row.kind} to {row.to}
              </p>
              {row.code ? (
                <p className="text-sm text-ink-secondary">
                  Code:{" "}
                  <span data-testid="outbox-code" className="font-mono text-base font-semibold">
                    {row.code}
                  </span>
                </p>
              ) : null}
              {row.link ? (
                <a
                  href={row.link}
                  className="text-sm font-semibold text-accent-fill hover:underline"
                  data-testid="outbox-link"
                >
                  Open link
                </a>
              ) : null}
              {row.html ? (
                <details>
                  <summary className="cursor-pointer text-xs font-semibold text-ink-muted">
                    HTML preview
                  </summary>
                  <iframe
                    title={row.subject}
                    srcDoc={row.html}
                    className="mt-2 h-64 w-full rounded-lg border border-line bg-canvas"
                  />
                </details>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
