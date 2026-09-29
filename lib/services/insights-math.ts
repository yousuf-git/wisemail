/**
 * Pure insight math (no database, no server-only): counters, rates, deltas and time-zone day
 * bucketing. Kept apart from `insights.ts` so it is unit-tested and usable in client code.
 *
 * Rate definitions (Resend's own): delivered, bounced = over sent; opened, clicked (unique)
 * = over delivered; complained = over delivered. Opens are pixel-based estimates.
 */

export const COUNT_KEYS = [
  "sent",
  "delivered",
  "delayed",
  "opened",
  "clicked",
  "bouncedHard",
  "bouncedSoft",
  "bounced",
  "complained",
  "failed",
  "suppressed",
  "received",
  "replied",
] as const;
export type CountKey = (typeof COUNT_KEYS)[number];
export type Counts = Record<CountKey, number>;

export const emptyCounts = (): Counts =>
  Object.fromEntries(COUNT_KEYS.map((k) => [k, 0])) as Counts;

/** Maps a `metric_rollups.counts` document to insight counts (`opened` = unique opens). */
export function countsFromRollup(counts: Record<string, number | undefined> = {}): Counts {
  const hard = counts.bounced_hard ?? 0;
  const soft = counts.bounced_soft ?? 0;
  return {
    sent: counts.sent ?? 0,
    delivered: counts.delivered ?? 0,
    delayed: counts.delivery_delayed ?? 0,
    opened: counts.opened_unique ?? 0,
    clicked: counts.clicked_unique ?? 0,
    bouncedHard: hard,
    bouncedSoft: soft,
    bounced: hard + soft,
    complained: counts.complained ?? 0,
    failed: counts.failed ?? 0,
    suppressed: counts.suppressed ?? 0,
    received: counts.received ?? 0,
    replied: counts.replied ?? 0,
  };
}

export function addCounts(a: Counts, b: Counts): Counts {
  const out = emptyCounts();
  for (const k of COUNT_KEYS) out[k] = a[k] + b[k];
  return out;
}

export type RateKey = "delivered" | "opened" | "clicked" | "bounced" | "complained";
/** Percentages (0-100), or null when the denominator is zero. */
export type Rates = Record<RateKey, number | null>;

const pct = (part: number, whole: number) => (whole > 0 ? (part / whole) * 100 : null);

export function computeRates(c: Counts): Rates {
  return {
    delivered: pct(c.delivered, c.sent),
    opened: pct(c.opened, c.delivered),
    clicked: pct(c.clicked, c.delivered),
    bounced: pct(c.bounced, c.sent),
    complained: pct(c.complained, c.delivered),
  };
}

/**
 * Change versus the previous period: percentage change for counts (null when the previous
 * period had none), percentage-point difference for rates (null when either side has no rate).
 * Rounded to one decimal.
 */
export function countDelta(current: number, previous: number): number | null {
  if (previous <= 0) return null;
  return round1(((current - previous) / previous) * 100);
}

export function rateDelta(current: number | null, previous: number | null): number | null {
  if (current === null || previous === null) return null;
  return round1(current - previous);
}

export const round1 = (n: number) => Math.round(n * 10) / 10;

export type Deltas = {
  /** Percent change of sent volume. */
  sent: number | null;
  received: number | null;
  /** Percentage points, per rate. */
  rates: Record<RateKey, number | null>;
};

export function computeDeltas(current: Counts, previous: Counts): Deltas {
  const cr = computeRates(current);
  const pr = computeRates(previous);
  return {
    sent: countDelta(current.sent, previous.sent),
    received: countDelta(current.received, previous.received),
    rates: {
      delivered: rateDelta(cr.delivered, pr.delivered),
      opened: rateDelta(cr.opened, pr.opened),
      clicked: rateDelta(cr.clicked, pr.clicked),
      bounced: rateDelta(cr.bounced, pr.bounced),
      complained: rateDelta(cr.complained, pr.complained),
    },
  };
}

/* Time zones ---------------------------------------------------------------------------- */

const formatters = new Map<string, Intl.DateTimeFormat>();
function parts(at: Date, timeZone: string) {
  let f = formatters.get(timeZone);
  if (!f) {
    f = new Intl.DateTimeFormat("en-CA", {
      timeZone,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
    formatters.set(timeZone, f);
  }
  const map: Record<string, number> = {};
  for (const p of f.formatToParts(at)) if (p.type !== "literal") map[p.type] = Number(p.value);
  return map as Record<"year" | "month" | "day" | "hour" | "minute" | "second", number>;
}

export function isValidTimeZone(timeZone: string): boolean {
  try {
    new Intl.DateTimeFormat("en", { timeZone });
    return true;
  } catch {
    return false;
  }
}

/** Local calendar date `YYYY-MM-DD` of an instant in `timeZone`. */
export function dayKey(at: Date, timeZone: string): string {
  const p = parts(at, timeZone);
  return `${p.year}-${String(p.month).padStart(2, "0")}-${String(p.day).padStart(2, "0")}`;
}

/** Offset (ms) of `timeZone` from UTC at an instant: local wall time minus UTC. */
function offsetMs(at: Date, timeZone: string): number {
  const p = parts(at, timeZone);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return asUtc - Math.floor(at.getTime() / 1000) * 1000;
}

/** The instant at which local date `key` starts in `timeZone` (handles DST). */
export function zonedMidnight(key: string, timeZone: string): Date {
  const [y, m, d] = key.split("-").map(Number) as [number, number, number];
  const utc = Date.UTC(y, m - 1, d);
  let guess = utc - offsetMs(new Date(utc), timeZone);
  guess = utc - offsetMs(new Date(guess), timeZone);
  return new Date(guess);
}

export function addDays(key: string, days: number): string {
  const [y, m, d] = key.split("-").map(Number) as [number, number, number];
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

/** The last `days` local dates ending with the date of `now`, oldest first. */
export function lastDayKeys(now: Date, timeZone: string, days: number): string[] {
  const today = dayKey(now, timeZone);
  return Array.from({ length: days }, (_, i) => addDays(today, i - (days - 1)));
}
