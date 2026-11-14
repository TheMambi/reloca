// Shared date-only helpers + the single countdown vocabulary (Wave 1, AD-039).
//
// Every surface that says anything about the move date — top-strip editor,
// dashboard hero, At-a-Glance, map tile — derives its words and tone from
// `countdownPhrase` / `countdownTone` so the app can never disagree with
// itself about whether the move already happened ("T-MINUS +3d" was semantic
// nonsense). Pure module: no DB, no React, safe in server and client code.
//
// Date-only ISO strings (YYYY-MM-DD) are treated as UTC-midnight throughout so
// arithmetic is stable across timezones (repo-wide convention; see
// decision-deadline-tracker's formatCellDate).
//
// "Today" has one definition, `todayInZoneIso()`: the calendar day in the
// household's configured time zone. Nothing else may derive today from
// `new Date()`, and nothing else may convert for the date picker.

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const DAY_MS = 86_400_000;

export function isValidIsoDate(value: string | null | undefined): value is string {
  if (!value || !DATE_RE.test(value)) return false;
  return !Number.isNaN(new Date(`${value}T00:00:00.000Z`).getTime());
}

/**
 * The household's time zone (IANA name). "Today" is the calendar day there,
 * on the server and in the browser alike, whatever zone either runs in. The
 * NEXT_PUBLIC_ prefix is what lets the browser read the same setting; a time
 * zone is not a secret.
 */
export const HOUSEHOLD_TIME_ZONE =
  process.env.NEXT_PUBLIC_RELOCA_TIME_ZONE || "America/Denver";

/** The calendar day (YYYY-MM-DD) an instant falls on in a time zone. */
export function isoDateInZone(
  instant: Date,
  timeZone: string = HOUSEHOLD_TIME_ZONE,
): string {
  let parts: Intl.DateTimeFormatPart[];
  try {
    parts = new Intl.DateTimeFormat("en-US", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).formatToParts(instant);
  } catch {
    throw new Error(
      `NEXT_PUBLIC_RELOCA_TIME_ZONE must be an IANA time zone such as America/Los_Angeles, got "${timeZone}".`,
    );
  }
  const part = (type: string) => parts.find((p) => p.type === type)!.value;
  return `${part("year")}-${part("month")}-${part("day")}`;
}

/** Today as YYYY-MM-DD in the household's time zone: the one "today". */
export function todayInZoneIso(): string {
  return isoDateInZone(new Date());
}

/**
 * The date picker (react-day-picker) works in the browser's local time: it
 * highlights and returns local-midnight dates. This pair is the only bridge
 * between it and date-only ISO strings, so the day shown is the day saved.
 */
export function isoToPickerDate(iso: string): Date {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d);
}

export function pickerDateToIso(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/** Date-only offset in UTC: addDaysIso("2027-09-30", -60) → "2027-08-01". */
export function addDaysIso(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Whole days from `fromIso` to `toIso` (negative when `toIso` is earlier). */
export function daysBetweenIso(fromIso: string, toIso: string): number {
  const from = new Date(`${fromIso}T00:00:00.000Z`).getTime();
  const to = new Date(`${toIso}T00:00:00.000Z`).getTime();
  return Math.round((to - from) / DAY_MS);
}

/**
 * Days until a target date measured from `todayIso` (defaults to today in the
 * household's time zone).
 * Positive = upcoming, 0 = today, negative = already passed, null = no/bad date.
 */
export function daysUntilIso(
  targetIso: string | null | undefined,
  todayIso: string = todayInZoneIso(),
): number | null {
  if (!isValidIsoDate(targetIso)) return null;
  return daysBetweenIso(todayIso, targetIso);
}

export type CountdownTone = "default" | "ok" | "warn" | "danger";

/**
 * Tone ramp for the move countdown (Wave D, D.4): neutral far out, amber
 * inside 60 days, red inside 14, and green once the move day has passed
 * (you made it). No new colour tokens.
 */
export function countdownTone(days: number | null): CountdownTone {
  if (days === null) return "default";
  if (days < 0) return "ok"; // moved — past move day
  if (days === 0) return "warn"; // moving today
  if (days <= 14) return "danger";
  if (days <= 60) return "warn";
  return "default";
}

/** Plain-English countdown phrasing shared by every move-date surface. */
export function countdownPhrase(
  days: number | null,
): { lead: string; count: number | null; trail: string } {
  if (days === null) return { lead: "Set your move date", count: null, trail: "" };
  if (days === 0) return { lead: "Moving", count: null, trail: "today" };
  if (days < 0) {
    const n = Math.abs(days);
    return { lead: "Moved", count: n, trail: n === 1 ? "day ago" : "days ago" };
  }
  return { lead: "Moving in", count: days, trail: days === 1 ? "day" : "days" };
}

/**
 * Compact mono-cell variant of the same vocabulary, for tiles where the
 * countdown is a small instrument value rather than a sentence.
 * "T-12" · "Today" · "3d ago" · "—".
 */
export function countdownCell(days: number | null): string {
  if (days === null) return "—";
  if (days === 0) return "Today";
  if (days < 0) return `${Math.abs(days)}d ago`;
  return `T-${days}`;
}
