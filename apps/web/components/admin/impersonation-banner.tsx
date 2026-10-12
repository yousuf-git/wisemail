import { Eye } from "lucide-react";

import { stopImpersonationAction } from "@/components/admin/impersonation-actions";
import { getSession } from "@/lib/dal";

/**
 * Persistent notice while a platform admin is impersonating a user (Better Auth sets
 * `session.impersonatedBy`). Floats above the page so it cannot be scrolled away or hidden by
 * the workspace shell, and works without JavaScript (the button is a plain form).
 */
export async function ImpersonationBanner() {
  const session = await getSession();
  const impersonatedBy = (session?.session as { impersonatedBy?: string | null } | undefined)
    ?.impersonatedBy;
  if (!session || !impersonatedBy) return null;
  const who = session.user.name || session.user.email;
  return (
    <div
      role="status"
      data-testid="impersonation-banner"
      className="fixed inset-x-3 bottom-3 z-[60] mx-auto flex w-fit max-w-[calc(100%-1.5rem)] items-center gap-3 rounded-full bg-ink py-1.5 pr-1.5 pl-4 text-sm text-canvas shadow-lg"
    >
      <Eye className="size-4 shrink-0 text-glow" aria-hidden />
      <span className="min-w-0 truncate">
        Viewing as <strong className="font-semibold">{who}</strong>
      </span>
      <form action={stopImpersonationAction}>
        <button
          type="submit"
          className="rounded-full bg-glow px-3.5 py-1 text-sm font-semibold whitespace-nowrap text-ink outline-none hover:brightness-95 focus-visible:ring-2 focus-visible:ring-canvas"
        >
          Stop
        </button>
      </form>
    </div>
  );
}
