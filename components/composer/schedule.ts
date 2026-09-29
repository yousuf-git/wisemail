/** Wall-clock helpers for scheduling in the org's timezone. Pure, no dependencies. */

export const MIN_SCHEDULE_LEAD_MS = 60_000;

type Parts = { year: number; month: number; day: number; hour: number; minute: number };

function partsIn(date: Date, timeZone: string): Parts & { weekday: number } {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    weekday: "short",
  });
  const get: Record<string, string> = {};
  for (const p of fmt.formatToParts(date)) get[p.type] = p.value;
  const weekday = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(get.weekday!);
  return {
    year: Number(get.year),
    month: Number(get.month),
    day: Number(get.day),
    hour: Number(get.hour) % 24,
    minute: Number(get.minute),
    weekday,
  };
}

/** Offset of `timeZone` from UTC at `date`, in ms (positive east of UTC). */
function offsetAt(date: Date, timeZone: string): number {
  const p = partsIn(date, timeZone);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute);
  return asUtc - Math.floor(date.getTime() / 60_000) * 60_000;
}

/** The instant at which the wall clock in `timeZone` reads the given date and time. */
export function zonedToInstant(parts: Parts, timeZone: string): Date {
  const guess = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute);
  let instant = guess - offsetAt(new Date(guess), timeZone);
  // A second pass settles instants near a daylight-saving change.
  instant = guess - offsetAt(new Date(instant), timeZone);
  return new Date(instant);
}

/** `YYYY-MM-DDTHH:mm`, the value format of `<input type="datetime-local">`. */
export function toLocalInputValue(date: Date, timeZone: string): string {
  const p = partsIn(date, timeZone);
  const pad = (n: number, w = 2) => String(n).padStart(w, "0");
  return `${pad(p.year, 4)}-${pad(p.month)}-${pad(p.day)}T${pad(p.hour)}:${pad(p.minute)}`;
}

export function fromLocalInputValue(value: string, timeZone: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(value);
  if (!m) return null;
  const [, year, month, day, hour, minute] = m.map(Number) as [
    number,
    number,
    number,
    number,
    number,
    number,
  ];
  return zonedToInstant({ year, month, day, hour, minute }, timeZone);
}

export type QuickPick = { id: string; label: string; at: Date };

/** Next 9:00 tomorrow, 13:00 tomorrow, Monday 9:00, all on the org's wall clock. */
export function quickPicks(now: Date, timeZone: string): QuickPick[] {
  const today = partsIn(now, timeZone);
  const dayOffset = (days: number, hour: number) => {
    const base = new Date(Date.UTC(today.year, today.month - 1, today.day + days));
    return zonedToInstant(
      {
        year: base.getUTCFullYear(),
        month: base.getUTCMonth() + 1,
        day: base.getUTCDate(),
        hour,
        minute: 0,
      },
      timeZone,
    );
  };
  const picks: QuickPick[] = [];
  const laterToday = new Date(
    Math.ceil((now.getTime() + 60 * 60_000) / (15 * 60_000)) * 15 * 60_000,
  );
  picks.push({ id: "in-1h", label: "In about an hour", at: laterToday });
  picks.push({ id: "tomorrow-am", label: "Tomorrow morning", at: dayOffset(1, 9) });
  picks.push({ id: "tomorrow-pm", label: "Tomorrow afternoon", at: dayOffset(1, 13) });
  const untilMonday = (8 - today.weekday) % 7 || 7;
  picks.push({ id: "monday", label: "Monday morning", at: dayOffset(untilMonday, 9) });
  return picks;
}

export function formatScheduled(date: Date, timeZone: string): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone,
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  }).format(date);
}

export function isValidTimeZone(timeZone: string | undefined | null): timeZone is string {
  if (!timeZone) return false;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone });
    return true;
  } catch {
    return false;
  }
}
