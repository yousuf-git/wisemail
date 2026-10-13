import { CalendarClock, X } from "lucide-react";
import { useRef, useState } from "react";

import {
  MIN_SCHEDULE_LEAD_MS,
  formatScheduled,
  fromLocalInputValue,
  quickPicks,
  toLocalInputValue,
} from "./schedule";

/** Schedule menu (quick picks or a date/time in the org timezone) plus the chosen time. */
export function SchedulePicker({
  value,
  onChange,
  timeZone,
  disabled,
  error,
}: {
  value: Date | null;
  onChange: (value: Date | null) => void;
  timeZone: string;
  disabled?: boolean;
  error?: string | null;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [local, setLocal] = useState("");
  const [localError, setLocalError] = useState<string | null>(null);

  function openCustom() {
    const base = value ?? new Date(Date.now() + 60 * 60_000);
    setLocal(toLocalInputValue(base, timeZone));
    setLocalError(null);
    setMenuOpen(false);
    dialogRef.current?.showModal();
  }

  function apply() {
    const at = fromLocalInputValue(local, timeZone);
    if (!at) return setLocalError("Pick a date and a time.");
    if (at.getTime() < Date.now() + MIN_SCHEDULE_LEAD_MS) {
      return setLocalError("Pick a time at least a minute from now.");
    }
    onChange(at);
    dialogRef.current?.close();
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      {value ? (
        <span
          className="inline-flex items-center gap-1 rounded-full bg-accent-soft py-1 pr-1 pl-3 text-[0.8125rem] font-semibold text-ink"
          data-testid="scheduled-chip"
        >
          <CalendarClock aria-hidden className="size-3.5" />
          {formatScheduled(value, timeZone)}
          <button
            type="button"
            aria-label="Send now instead"
            disabled={disabled}
            onClick={() => onChange(null)}
            className="grid size-5 place-items-center rounded-full outline-none hover:bg-line-strong/60 focus-visible:ring-2 focus-visible:ring-accent"
          >
            <X aria-hidden className="size-3" />
          </button>
        </span>
      ) : null}
      <div className="relative">
        <button
          type="button"
          disabled={disabled}
          aria-expanded={menuOpen}
          aria-haspopup="menu"
          aria-invalid={!!error || undefined}
          onClick={() => setMenuOpen((o) => !o)}
          className="inline-flex h-8 items-center gap-1.5 rounded-control px-2.5 text-xs font-medium text-ink-secondary hover:bg-canvas-sunken disabled:opacity-50"
        >
          <CalendarClock className="size-3.5" aria-hidden />
          {value ? "Change time" : "Schedule"}
        </button>
        {menuOpen ? (
          <>
            <button
              type="button"
              className="fixed inset-0 z-10 cursor-default"
              aria-label="Close schedule menu"
              onClick={() => setMenuOpen(false)}
            />
            <ul
              role="menu"
              className="absolute top-full left-0 z-20 mt-1 w-64 rounded-lg border border-line bg-surface py-1 shadow-lg"
            >
              {quickPicks(new Date(), timeZone).map((pick) => (
                <li key={pick.id} role="none">
                  <button
                    type="button"
                    role="menuitem"
                    className="flex w-full items-baseline justify-between gap-3 px-3 py-2 text-left text-sm hover:bg-canvas-sunken"
                    onClick={() => {
                      onChange(pick.at);
                      setMenuOpen(false);
                    }}
                  >
                    {pick.label}
                    <span className="text-xs text-ink-muted">
                      {formatScheduled(pick.at, timeZone)}
                    </span>
                  </button>
                </li>
              ))}
              <li role="none" className="border-t border-line">
                <button
                  type="button"
                  role="menuitem"
                  className="w-full px-3 py-2 text-left text-sm hover:bg-canvas-sunken"
                  onClick={openCustom}
                >
                  Pick date and time…
                </button>
              </li>
            </ul>
          </>
        ) : null}
      </div>
      {error ? (
        <span role="alert" className="text-xs text-danger-ink">
          {error}
        </span>
      ) : null}
      <dialog
        ref={dialogRef}
        className="w-full max-w-sm rounded-xl border border-line bg-surface p-0 text-ink shadow-lg backdrop:bg-ink/40"
        onClose={() => setLocalError(null)}
      >
        <form
          method="dialog"
          className="grid gap-3 p-4"
          onSubmit={(e) => {
            e.preventDefault();
            apply();
          }}
        >
          <div>
            <h2 className="text-sm font-semibold">Pick date and time</h2>
            <p className="mt-1 text-xs text-ink-muted">Times use the workspace timezone ({timeZone}).</p>
          </div>
          <input
            type="datetime-local"
            value={local}
            onChange={(e) => setLocal(e.target.value)}
            className="h-10 rounded-control border border-line bg-canvas px-3 text-sm"
          />
          {localError ? (
            <p role="alert" className="text-xs text-danger-ink">
              {localError}
            </p>
          ) : null}
          <div className="flex justify-end gap-2">
            <button
              type="button"
              className="h-9 rounded-control px-3 text-sm font-medium hover:bg-canvas-sunken"
              onClick={() => dialogRef.current?.close()}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="h-9 rounded-control bg-accent-fill px-3 text-sm font-semibold text-accent-ink"
            >
              Schedule
            </button>
          </div>
        </form>
      </dialog>
    </div>
  );
}
