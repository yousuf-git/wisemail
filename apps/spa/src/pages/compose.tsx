import { useMutation, useQuery } from "@tanstack/react-query";
import { Link, useNavigate, useParams } from "@tanstack/react-router";
import { useMemo, useState } from "react";

import { sendEmail } from "@/lib/actions";
import { listSenders } from "@/lib/api";

function splitAddresses(raw: string): string[] {
  return raw
    .split(/[,;\s]+/)
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

export function ComposePage() {
  const { orgSlug } = useParams({ from: "/$orgSlug/compose" });
  const navigate = useNavigate();
  const senders = useQuery({
    queryKey: ["senders", orgSlug],
    queryFn: () => listSenders(orgSlug),
  });

  const activeSenders = useMemo(
    () => (senders.data ?? []).filter((s) => s.status === "active"),
    [senders.data],
  );
  const defaultSenderId =
    activeSenders.find((s) => s.isDefault)?.id ?? activeSenders[0]?.id ?? "";

  const [senderId, setSenderId] = useState(defaultSenderId);
  const [to, setTo] = useState("");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [error, setError] = useState<string | null>(null);

  // Keep select in sync when senders load.
  const effectiveSenderId = senderId || defaultSenderId;

  const send = useMutation({
    mutationFn: () =>
      sendEmail(orgSlug, {
        senderId: effectiveSenderId,
        to: splitAddresses(to),
        subject,
        text: body,
        html: `<p>${body
          .split("\n")
          .map((line) => line.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;"))
          .join("<br/>")}</p>`,
      }),
    onSuccess: async (result) => {
      if (!result.ok) {
        setError(result.error.message);
        return;
      }
      setError(null);
      await navigate({ to: "/$orgSlug/inbox", params: { orgSlug } });
    },
  });

  if (senders.isPending) {
    return <p className="text-sm text-ink-muted">Loading senders…</p>;
  }

  if (senders.isError) {
    return (
      <p role="alert" className="rounded-md bg-danger-soft px-3 py-2 text-sm text-danger-ink">
        Could not load senders. Check permission and API.
      </p>
    );
  }

  if (activeSenders.length === 0) {
    return (
      <section className="grid max-w-lg gap-3">
        <h1 className="text-xl font-semibold tracking-tight">Compose</h1>
        <p className="rounded-lg border border-dashed border-line bg-surface px-4 py-8 text-sm text-ink-muted">
          No active senders yet. Add one under Settings → Senders on the Next app for now.
        </p>
        <Link
          to="/$orgSlug/inbox"
          params={{ orgSlug }}
          className="text-sm font-medium text-accent-fill hover:underline"
        >
          Back to inbox
        </Link>
      </section>
    );
  }

  return (
    <section className="grid max-w-2xl gap-4">
      <header>
        <h1 className="text-xl font-semibold tracking-tight">Compose</h1>
        <p className="text-sm text-ink-muted">
          Sends through `compose.send` on Fastify. Rich editor ports later.
        </p>
      </header>
      <form
        className="grid gap-4 rounded-xl border border-line bg-surface p-5 shadow-sm"
        onSubmit={(e) => {
          e.preventDefault();
          setError(null);
          send.mutate();
        }}
        noValidate
      >
        {error ? (
          <p role="alert" className="rounded-md bg-danger-soft px-3 py-2 text-sm text-danger-ink">
            {error}
          </p>
        ) : null}
        <label className="grid gap-1.5 text-sm font-medium">
          From
          <select
            className="h-10 rounded-control border border-line-strong bg-canvas px-3"
            value={effectiveSenderId}
            onChange={(e) => setSenderId(e.target.value)}
          >
            {activeSenders.map((s) => (
              <option key={s.id} value={s.id}>
                {s.displayName ? `${s.displayName} <${s.address}>` : s.address}
              </option>
            ))}
          </select>
        </label>
        <label className="grid gap-1.5 text-sm font-medium">
          To
          <input
            className="h-10 rounded-control border border-line-strong bg-canvas px-3 outline-none focus:ring-2 focus:ring-accent"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            placeholder="you@example.com"
            required
          />
        </label>
        <label className="grid gap-1.5 text-sm font-medium">
          Subject
          <input
            className="h-10 rounded-control border border-line-strong bg-canvas px-3 outline-none focus:ring-2 focus:ring-accent"
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            required
          />
        </label>
        <label className="grid gap-1.5 text-sm font-medium">
          Message
          <textarea
            className="min-h-40 rounded-control border border-line-strong bg-canvas px-3 py-2 outline-none focus:ring-2 focus:ring-accent"
            value={body}
            onChange={(e) => setBody(e.target.value)}
            required
          />
        </label>
        <div className="flex flex-wrap gap-2">
          <button
            type="submit"
            disabled={send.isPending}
            className="h-10 rounded-control bg-accent-fill px-4 text-sm font-semibold text-accent-ink hover:bg-accent-fill-hover disabled:opacity-60"
          >
            {send.isPending ? "Sending…" : "Send"}
          </button>
          <Link
            to="/$orgSlug/inbox"
            params={{ orgSlug }}
            className="inline-flex h-10 items-center rounded-control border border-line px-4 text-sm font-medium text-ink-secondary hover:bg-canvas-sunken"
          >
            Cancel
          </Link>
        </div>
      </form>
    </section>
  );
}
