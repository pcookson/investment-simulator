// -----------------------------------------------------------------------------
// lib/dates.ts — Eastern Time utilities for trade execution date logic
// -----------------------------------------------------------------------------

const ET_LOCALE = "en-US";
const ET_TZ = "America/New_York";

// Orders submitted before 3:30 PM ET on a weekday execute that day.
// Orders submitted at/after 3:30 PM ET, or on a weekend, execute the next weekday.
const CUTOFF_HOUR = 15; // 15:00 = 3 PM
const CUTOFF_MINUTE = 30; // :30 → cutoff is 3:30 PM ET

/**
 * Given a UTC Date (typically a trade's submitted_at), return the YYYY-MM-DD
 * string of the trading day on which the order will execute.
 *
 * NOTE: Does not account for market holidays (V1 scope).
 */
export function getExecutionDate(utcDate: Date): string {
  // Extract ET date/time components
  const etParts = new Intl.DateTimeFormat(ET_LOCALE, {
    timeZone: ET_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(utcDate);

  const get = (type: string) =>
    parseInt(etParts.find((p) => p.type === type)!.value, 10);

  const year = get("year");
  const month = get("month"); // 1-based
  const day = get("day");
  const hour = get("hour");
  const minute = get("minute");

  // Day of week in ET: construct a local Date from ET year/month/day
  const etLocalDate = new Date(year, month - 1, day);
  const dow = etLocalDate.getDay(); // 0 = Sun, 6 = Sat

  const isPastCutoff =
    hour > CUTOFF_HOUR || (hour === CUTOFF_HOUR && minute >= CUTOFF_MINUTE);

  // Weekday + before cutoff → execute today
  if (dow >= 1 && dow <= 5 && !isPastCutoff) {
    return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  }

  // Otherwise roll forward to the next weekday
  const candidate = new Date(year, month - 1, day);
  candidate.setDate(candidate.getDate() + 1);
  while (candidate.getDay() === 0 || candidate.getDay() === 6) {
    candidate.setDate(candidate.getDate() + 1);
  }

  const ny = candidate.getFullYear();
  const nm = String(candidate.getMonth() + 1).padStart(2, "0");
  const nd = String(candidate.getDate()).padStart(2, "0");
  return `${ny}-${nm}-${nd}`;
}

/** Format YYYY-MM-DD as "Mon D, YYYY" for display (e.g. "Mar 5, 2026"). */
export function formatExecutionDate(ymd: string): string {
  const [year, month, day] = ymd.split("-").map(Number);
  const d = new Date(year, month - 1, day);
  return d.toLocaleDateString(ET_LOCALE, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

/**
 * Returns today's date in Eastern Time as "YYYY-MM-DD".
 * Used by the cron job to determine the trading date and snapshot date.
 */
export function getTodayET(): string {
  const parts = new Intl.DateTimeFormat(ET_LOCALE, {
    timeZone: ET_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const y = parts.find((p) => p.type === "year")!.value;
  const m = parts.find((p) => p.type === "month")!.value;
  const d = parts.find((p) => p.type === "day")!.value;
  return `${y}-${m}-${d}`;
}

/**
 * Returns the UTC ISO timestamp for today's 3:30 PM ET cutoff.
 *
 * Orders with submitted_at BEFORE this timestamp execute on today's cron run.
 * Handles EST (UTC-5) and EDT (UTC-4) automatically via the Intl API.
 *
 * Technique: derive the current ET↔UTC offset from the wall-clock difference,
 * then apply it to the constructed "today 15:30 local" Date.
 */
export function getCutoffISO(): string {
  const now = new Date();

  // Parse the ET wall clock time as if it were the server's local time.
  // On a UTC server: if it is 22:05 UTC (EST, UTC-5), toLocaleString returns
  // "3/2/2026, 5:05:00 PM" which new Date() parses as 17:05 UTC.
  // The difference (22:05 - 17:05 = 5 h) is the ET→UTC offset.
  const etAsLocal = new Date(
    now.toLocaleString(ET_LOCALE, { timeZone: ET_TZ })
  );
  const offsetMs = now.getTime() - etAsLocal.getTime();

  // Today's date components in ET
  const parts = new Intl.DateTimeFormat(ET_LOCALE, {
    timeZone: ET_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const year = parseInt(parts.find((p) => p.type === "year")!.value, 10);
  const month = parseInt(parts.find((p) => p.type === "month")!.value, 10);
  const day = parseInt(parts.find((p) => p.type === "day")!.value, 10);

  // "Today 3:30 PM" as a local Date (on a UTC server this is treated as UTC)
  const cutoffLocal = new Date(
    year,
    month - 1,
    day,
    CUTOFF_HOUR,
    CUTOFF_MINUTE,
    0,
    0
  );

  // Shift by the ET offset to obtain the correct UTC instant
  return new Date(cutoffLocal.getTime() + offsetMs).toISOString();
}

/** Format an ISO timestamp as "Mar 5 at 2:30 PM ET" for display. */
export function formatSubmittedAt(iso: string): string {
  const d = new Date(iso);
  const datePart = d.toLocaleDateString(ET_LOCALE, {
    timeZone: ET_TZ,
    month: "short",
    day: "numeric",
  });
  const timePart = d.toLocaleTimeString(ET_LOCALE, {
    timeZone: ET_TZ,
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
  return `${datePart} at ${timePart} ET`;
}
