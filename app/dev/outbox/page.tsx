import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { notFound } from "next/navigation";

import { OUTBOX_DIR, getOutbox, systemEmailIsFake } from "@/lib/services/system-email";
import { env } from "@/lib/env";

export const dynamic = "force-dynamic";
export const metadata = { title: "Dev outbox" };

type Row = {
  id: string;
  kind: string;
  to: string;
  subject: string;
  link: string | null;
  sentAt: string;
  html?: string;
};

/**
 * Dev-only inbox for system email in fake mode: lists what `system-email` "sent", newest first,
 * with the message's link and a preview. Files on disk are the source (they survive server
 * restarts and are shared between server bundles); the in-memory outbox fills any gap.
 */
async function loadRows(): Promise<Row[]> {
  const rows = new Map<string, Row>();
  try {
    for (const name of await readdir(OUTBOX_DIR)) {
      if (!name.endsWith(".json")) continue;
      const meta = JSON.parse(await readFile(path.join(OUTBOX_DIR, name), "utf8")) as Row & {
        file: string;
      };
      const html = await readFile(path.join(OUTBOX_DIR, meta.file), "utf8").catch(() => undefined);
      rows.set(meta.id, { ...meta, html });
    }
  } catch {}
  for (const m of getOutbox()) if (!rows.has(m.id)) rows.set(m.id, m);
  return [...rows.values()].sort((a, b) => b.sentAt.localeCompare(a.sentAt)).slice(0, 200);
}

export default async function DevOutboxPage() {
  if (env.NODE_ENV === "production" || !systemEmailIsFake()) notFound();
  const rows = await loadRows();
  return (
    <main className="mx-auto grid w-full max-w-3xl gap-4 px-4 py-10">
      <h1 className="text-2xl font-bold">Dev outbox</h1>
      <p className="text-ink-muted">
        System email in fake mode ends up here instead of a real inbox. Newest first.
      </p>
      {rows.length === 0 ? (
        <p className="rounded-xl bg-surface p-6 shadow-md">Nothing sent yet.</p>
      ) : (
        <ul className="grid gap-3">
          {rows.map((row) => (
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
              {row.link ? (
                <a
                  href={row.link}
                  data-testid="outbox-link"
                  className="font-mono text-[0.8125rem] break-all text-accent hover:underline"
                >
                  {row.link}
                </a>
              ) : null}
              {row.html ? (
                <details>
                  <summary className="cursor-pointer text-sm text-ink-secondary">Preview</summary>
                  <iframe
                    title={`Preview of ${row.subject}`}
                    sandbox=""
                    srcDoc={row.html}
                    className="mt-2 h-[520px] w-full rounded-md border border-line bg-white"
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
