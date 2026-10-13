/** Shared loading / error / empty chrome for list pages (composition over boolean props). */

export function ResourcePage({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="grid gap-3">
      <header>
        <h1 className="text-xl font-semibold tracking-tight">{title}</h1>
        {description ? <p className="text-sm text-ink-muted">{description}</p> : null}
      </header>
      {children}
    </section>
  );
}

export function ResourcePending() {
  return <p className="text-sm text-ink-muted">Loading…</p>;
}

export function ResourceError({ message }: { message: string }) {
  return (
    <p role="alert" className="rounded-md bg-danger-soft px-3 py-2 text-sm text-danger-ink">
      {message}
    </p>
  );
}

export function ResourceEmpty({ children }: { children: React.ReactNode }) {
  return (
    <p className="rounded-lg border border-dashed border-line bg-surface px-4 py-8 text-center text-sm text-ink-muted">
      {children}
    </p>
  );
}
