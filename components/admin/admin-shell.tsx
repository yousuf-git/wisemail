import { ArrowLeft, ShieldCheck } from "lucide-react";
import Link from "next/link";

import type { AdminActor } from "@/lib/admin/guard";
import { AdminNav } from "./admin-nav";

/**
 * The admin panel's own chrome, deliberately different from the workspace shell: a dark strip
 * says where you are ("Admin", cross-tenant, audited) and the sidebar links back to the app.
 */
export function AdminShell({
  admin,
  homePath,
  children,
}: {
  admin: AdminActor;
  homePath: string;
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-dvh bg-canvas">
      <div className="bg-ink px-4 py-1.5 text-center text-xs font-medium text-canvas">
        Wisemail Admin: data across every workspace. Changes are written to the audit log.
      </div>
      <div className="mx-auto grid w-full max-w-[1400px] grid-cols-1 gap-3.5 p-4 min-[900px]:grid-cols-[220px_minmax(0,1fr)] min-[900px]:p-3">
        <aside
          aria-label="Admin sidebar"
          className="grid min-w-0 grid-cols-1 content-start gap-3 rounded-xl bg-surface p-3 shadow-md min-[900px]:sticky min-[900px]:top-3 min-[900px]:h-[calc(100dvh-3.5rem)] min-[900px]:grid-rows-[auto_auto_1fr_auto]"
        >
          <div className="flex items-center gap-2 px-1.5 pt-0.5">
            <span className="grid size-8 place-items-center rounded-md bg-ink text-canvas">
              <ShieldCheck className="size-[18px]" aria-hidden />
            </span>
            <div className="grid leading-tight">
              <span className="text-[0.95rem] font-bold tracking-[-0.02em]">Wisemail</span>
              <span className="w-fit rounded-full bg-warning-soft px-2 py-px text-[0.6875rem] font-bold tracking-wide text-warning-ink uppercase">
                Admin
              </span>
            </div>
          </div>
          <AdminNav />
          <div className="hidden min-[900px]:block" />
          <div className="grid gap-2 border-t border-line pt-3">
            <Link
              href={homePath}
              className="flex items-center gap-2 rounded-md px-2 py-1.5 text-[0.84rem] font-medium text-ink-secondary outline-none hover:bg-canvas hover:text-ink focus-visible:ring-2 focus-visible:ring-accent"
            >
              <ArrowLeft className="size-4" aria-hidden />
              Back to app
            </Link>
            <p className="truncate px-2 text-xs text-ink-muted" title={admin.email}>
              {admin.name || admin.email}
            </p>
          </div>
        </aside>
        <main id="main" className="flex min-w-0 flex-col gap-3.5">
          {children}
        </main>
      </div>
    </div>
  );
}
