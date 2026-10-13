import { Link, useRouterState } from "@tanstack/react-router";
import {
  Activity,
  ArrowLeft,
  Building2,
  LayoutDashboard,
  Settings2,
  ShieldCheck,
  Tags,
  Users,
} from "lucide-react";

import type { AdminActor } from "@/lib/admin-api";
import { cn } from "@/lib/utils";

const ITEMS = [
  { to: "/admin", label: "Overview", icon: LayoutDashboard, exact: true },
  { to: "/admin/users", label: "Users", icon: Users },
  { to: "/admin/organizations", label: "Organizations", icon: Building2 },
  { to: "/admin/pricing", label: "Pricing", icon: Tags },
  { to: "/admin/settings", label: "Platform", icon: Settings2 },
  { to: "/admin/health", label: "System health", icon: Activity },
] as const;

export function AdminShell({
  admin,
  children,
}: {
  admin: AdminActor;
  children: React.ReactNode;
}) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  return (
    <div className="min-h-dvh bg-canvas text-ink">
      <div className="bg-ink px-4 py-1.5 text-center text-xs font-medium text-canvas">
        Wisemail Admin: data across every workspace. Changes are written to the audit log.
      </div>
      <div className="mx-auto grid w-full max-w-[1400px] grid-cols-1 gap-3.5 p-4 min-[900px]:grid-cols-[220px_minmax(0,1fr)]">
        <aside
          aria-label="Admin sidebar"
          className="grid content-start gap-3 rounded-xl bg-surface p-3 shadow-md min-[900px]:sticky min-[900px]:top-3 min-[900px]:h-[calc(100dvh-3.5rem)]"
        >
          <div className="flex items-center gap-2 px-1.5">
            <span className="grid size-8 place-items-center rounded-md bg-ink text-canvas">
              <ShieldCheck className="size-[18px]" aria-hidden />
            </span>
            <div className="grid leading-tight">
              <span className="text-[0.95rem] font-bold tracking-tight">Wisemail</span>
              <span className="w-fit rounded-full bg-warning-soft px-2 py-px text-[0.6875rem] font-bold tracking-wide text-warning-ink uppercase">
                Admin
              </span>
            </div>
          </div>
          <nav aria-label="Admin" className="flex flex-wrap gap-1 min-[900px]:grid min-[900px]:gap-0.5">
            {ITEMS.map(({ to, label, icon: Icon, ...rest }) => {
              const active =
                "exact" in rest && rest.exact ? pathname === to : pathname.startsWith(to);
              return (
                <Link
                  key={to}
                  to={to}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "flex items-center gap-2.5 rounded-[10px] px-2.5 py-1.5 text-[0.84rem] font-medium text-ink-secondary hover:bg-canvas hover:text-ink",
                    active && "bg-accent-soft font-semibold text-ink",
                  )}
                >
                  <Icon className={cn("size-[18px]", active && "text-accent-fill")} aria-hidden />
                  {label}
                </Link>
              );
            })}
          </nav>
          <div className="mt-auto grid gap-2 border-t border-line pt-3">
            <Link
              to="/"
              className="flex items-center gap-2 rounded-md px-2 py-1.5 text-[0.84rem] font-medium text-ink-secondary hover:bg-canvas hover:text-ink"
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
