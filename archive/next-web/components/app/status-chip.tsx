import { cn } from "@/lib/utils";

/** Email-state semantics from FED §2.2. */
export type StatusState = "success" | "info" | "engaged" | "warning" | "danger" | "neutral";

const styles: Record<StatusState, string> = {
  success: "bg-success-soft text-success-ink",
  info: "bg-info-soft text-info-ink",
  engaged: "bg-engaged-soft text-engaged-ink",
  warning: "bg-warning-soft text-warning-ink",
  danger: "bg-danger-soft text-danger-ink",
  neutral: "bg-neutral-soft text-neutral-ink",
};

/** Pill with a soft background, ink text and a 6px solid dot. State is never color-only: it always carries a label. */
export function StatusChip({
  state,
  children,
  className,
  ...props
}: React.ComponentProps<"span"> & { state: StatusState }) {
  return (
    <span
      data-slot="status-chip"
      data-state={state}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-[3px] text-xs font-semibold whitespace-nowrap transition-colors duration-200",
        styles[state],
        className,
      )}
      {...props}
    >
      <i aria-hidden className="size-1.5 rounded-full bg-current" />
      {children}
    </span>
  );
}
