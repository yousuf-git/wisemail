import { useQuery } from "@tanstack/react-query";

import { getCatalog } from "@/lib/api";

/** Lazy-loaded home page (code-split via router `PAGE_MODULES`). */
export function HomePage() {
  const catalog = useQuery({
    queryKey: ["catalog"],
    queryFn: getCatalog,
  });

  return (
    <section style={{ maxWidth: "40rem" }}>
      <h1 style={{ margin: "0 0 0.5rem", fontSize: "1.75rem", letterSpacing: "-0.03em" }}>
        Wisemail
      </h1>
      <p style={{ margin: "0 0 1.25rem", opacity: 0.75 }}>
        SPA shell (M7). Reads go through TanStack Query (request dedupe); mutations will use
        Fastify `/api/v1/actions/:id`.
      </p>
      {catalog.isPending ? (
        <p>Loading catalog…</p>
      ) : catalog.isError ? (
        <p role="alert">Catalog unreachable — start the API (`pnpm --filter @wisemail/api dev`) and refresh.</p>
      ) : (
        <p>
          Catalog OK
          {typeof catalog.data === "object" && catalog.data && "plans" in catalog.data
            ? ` · ${(catalog.data as { plans?: unknown[] }).plans?.length ?? 0} plans`
            : null}
        </p>
      )}
    </section>
  );
}
