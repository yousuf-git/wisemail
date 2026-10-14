import { useEffect, useId, useRef } from "react";

/**
 * Native `<dialog>` shell used across the SPA (avoids a heavy modal library).
 * Call sites own open/close state; this syncs `showModal` / `close`.
 */
export function DialogShell({
  open,
  onClose,
  title,
  description,
  children,
  className = "m-auto w-[min(100%,28rem)] rounded-xl border border-line bg-surface p-0 shadow-lg backdrop:bg-ink/40",
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children: React.ReactNode;
  className?: string;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const descId = useId();

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (open && !el.open) el.showModal();
    if (!open && el.open) el.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      aria-describedby={description ? descId : undefined}
      className={className}
      onClose={onClose}
    >
      <div className="grid gap-3 p-5">
        <div className="grid gap-1">
          <h2 id={titleId} className="text-base font-semibold">
            {title}
          </h2>
          {description ? (
            <p id={descId} className="text-sm text-ink-muted">
              {description}
            </p>
          ) : null}
        </div>
        {children}
      </div>
    </dialog>
  );
}
