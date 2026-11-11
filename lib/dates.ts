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

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const DAY_MS = 86_400_000;

export function isValidIsoDate(value: string | null | undefined): value is string {
  if (!value || !DATE_RE.test(value)) return false;
  return !Number.isNaN(new Date(`${value}T00:00:00.000Z`).getTime());
}

/** Today as YYYY-MM-DD in UTC — the server-side "today". */
export function todayUtcIso(): string {
  return new Date().toISOString().slice(0, 10);
}

/** Today as YYYY-MM-DD in the runtime's local timezone — the client "today". */
export function todayLocalIso(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
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
 * Days until a target date measured from `todayIso` (defaults to UTC today).
 * Positive = upcoming, 0 = today, negative = already passed, null = no/bad date.
 */
export function daysUntilIso(
  targetIso: string | null | undefined,
  todayIso: string = todayUtcIso(),
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
