"use client";

import { CalendarClock, ChevronDown, X } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import {
  MIN_SCHEDULE_LEAD_MS,
  formatScheduled,
  fromLocalInputValue,
  quickPicks,
  toLocalInputValue,
} from "./schedule";

/** Schedule menu (quick picks or a date and time in the org's timezone) plus the chosen time. */
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
  const [open, setOpen] = useState(false);
  const [local, setLocal] = useState("");
  const [localError, setLocalError] = useState<string | null>(null);

  function openCustom() {
    const base = value ?? new Date(Date.now() + 60 * 60_000);
    setLocal(toLocalInputValue(base, timeZone));
    setLocalError(null);
    setOpen(true);
  }

  function apply() {
    const at = fromLocalInputValue(local, timeZone);
    if (!at) return setLocalError("Pick a date and a time.");
    if (at.getTime() < Date.now() + MIN_SCHEDULE_LEAD_MS) {
      return setLocalError("Pick a time at least a minute from now.");
    }
    onChange(at);
    setOpen(false);
  }

  return (
    <>
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
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={disabled}
            aria-invalid={!!error}
          >
            <CalendarClock aria-hidden />
            {value ? "Change time" : "Schedule"}
            <ChevronDown aria-hidden className="size-3 opacity-60" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-64 rounded-lg shadow-lg">
          {quickPicks(new Date(), timeZone).map((pick) => (
            <DropdownMenuItem key={pick.id} onSelect={() => onChange(pick.at)}>
              <span className="flex w-full items-baseline justify-between gap-3">
                {pick.label}
                <span className="text-xs text-ink-muted">{formatScheduled(pick.at, timeZone)}</span>
              </span>
            </DropdownMenuItem>
          ))}
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={openCustom}>Pick date and time…</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      {error ? (
        <span role="alert" className="text-xs text-danger-ink">
          {error}
        </span>
      ) : null}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-xl">Schedule send</DialogTitle>
            <DialogDescription>Times are in {timeZone.replace(/_/g, " ")}.</DialogDescription>
          </DialogHeader>
          <Input
            type="datetime-local"
            aria-label="Send date and time"
            value={local}
            onChange={(event) => setLocal(event.target.value)}
            aria-invalid={!!localError}
          />
          {localError ? (
            <p role="alert" className="text-sm text-danger-ink">
              {localError}
            </p>
          ) : null}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="button" className="font-bold" onClick={apply}>
              Schedule
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
