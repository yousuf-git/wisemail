import { Eye } from "lucide-react";
import { useState } from "react";

import { callUserAction } from "@/lib/api";
import { authClient } from "@/lib/auth/client";

/**
 * Persistent notice while a platform admin is impersonating a user (Better Auth sets
 * `session.impersonatedBy`). Floats above the page so it cannot be scrolled away.
 */
export function ImpersonationBanner() {
  const session = authClient.useSession();
  const [busy, setBusy] = useState(false);
  const impersonatedBy = (
    session.data?.session as { impersonatedBy?: string | null } | undefined
  )?.impersonatedBy;
  if (!session.data?.user || !impersonatedBy) return null;

  const who = session.data.user.name || session.data.user.email;
  const targetUserId = session.data.user.id;

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
      <button
        type="button"
        disabled={busy}
        className="rounded-full bg-glow px-3.5 py-1 text-sm font-semibold whitespace-nowrap text-ink outline-none hover:brightness-95 focus-visible:ring-2 focus-visible:ring-canvas disabled:opacity-60"
        onClick={async () => {
          setBusy(true);
          try {
            const result = await callUserAction<{ targetUserId: string }>(
              "impersonation.stop",
              {},
            );
            if (!result.ok) {
              setBusy(false);
              return;
            }
            await session.refetch();
            window.location.assign(`/admin/users/${targetUserId}`);
          } catch {
            setBusy(false);
          }
        }}
      >
        {busy ? "Stopping…" : "Stop"}
      </button>
    </div>
  );
}
