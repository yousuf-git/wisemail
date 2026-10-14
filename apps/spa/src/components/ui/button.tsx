import { cn } from "@/lib/utils";

const variants = {
  primary:
    "bg-accent-fill text-accent-ink hover:bg-accent-fill-hover disabled:opacity-50",
  outline:
    "border border-line bg-surface text-ink hover:bg-canvas-sunken disabled:opacity-50",
  ghost: "text-ink-secondary hover:bg-canvas-sunken hover:text-ink disabled:opacity-50",
  danger: "bg-danger text-white hover:opacity-90 disabled:opacity-50",
} as const;

const sizes = {
  sm: "h-8 px-2.5 text-xs",
  md: "h-9 px-3 text-sm",
  lg: "h-11 px-4 text-sm",
} as const;

/** Thin button primitive — SPA uses this instead of a full shadcn kit. */
export function Button({
  variant = "primary",
  size = "md",
  className,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: keyof typeof variants;
  size?: keyof typeof sizes;
}) {
  return (
    <button
      type="button"
      className={cn(
        "inline-flex items-center justify-center gap-1.5 rounded-control font-semibold transition-colors outline-none focus-visible:ring-2 focus-visible:ring-accent",
        variants[variant],
        sizes[size],
        className,
      )}
      {...props}
    />
  );
}
