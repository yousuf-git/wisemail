import { useParams } from "@tanstack/react-router";

/** Unported org screens — shell + nav work; page body lands in later M7 slices. */
export function PlaceholderPage() {
  const { orgSlug, _splat } = useParams({ from: "/$orgSlug/$" });
  return (
    <section className="rounded-lg border border-dashed border-line bg-surface px-4 py-10 text-center">
      <h1 className="text-lg font-semibold tracking-tight">Coming to the SPA</h1>
      <p className="mt-2 text-sm text-ink-muted">
        <code className="text-ink">/{orgSlug}/{_splat}</code> is still on Next during the migration.
      </p>
    </section>
  );
}
