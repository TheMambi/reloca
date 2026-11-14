// What the active move seeds into other tables: checklist wording that names
// the two cities, and due dates set a fixed number of days from the move date.
// Pure, so the seeders and the move-date actions share one definition.

import { addDaysIso } from "@/lib/dates";
import type { AddressChangeTarget } from "@/schemas/transitions";

/** Replace {origin} and {destination} in checklist seed text with city names. */
export function fillSeedText(
  text: string,
  names: { originName: string; destinationName: string },
): string {
  return text
    .replaceAll("{origin}", names.originName)
    .replaceAll("{destination}", names.destinationName);
}

// Lead-day defaults for address-change targets. Convention: lead_days is the
// number of days BEFORE move_date that the change should be due. A NEGATIVE
// value means "due AFTER move_date" — used for post-move statutory items
// (e.g. CO DMV: 10 days post-move). due_date = move_date - lead_days.
export const ADDRESS_LEAD_DAYS: Record<AddressChangeTarget["kind"], number> = {
  usps: 14,
  bank: 30,
  subscription: 30,
  employer: 30,
  voter_reg: 30,
  dmv: -10,                  // post-move: move_date - (-10) = move_date + 10
  auto_insurance: 30,
  health_insurance: 30,
  custom: 14,                // safe default
};

/** The due date a row seeded `offsetDays` from the move date carries. */
export function seededDueDate(
  moveDate: string | null,
  offsetDays: number,
): string | null {
  return moveDate ? addDaysIso(moveDate, offsetDays) : null;
}

/**
 * Due-date changes after the move date goes from `oldDate` to `newDate`.
 * Only a row that still sits on its seeded date follows the move. A date the
 * user set by hand, or a row with no seeded offset, stays where it is.
 */
export function shiftedDueDates<T extends { id: string; due_date: string | null }>(
  rows: T[],
  offsetOf: (row: T) => number | null,
  oldDate: string | null,
  newDate: string | null,
): { id: string; due_date: string | null }[] {
  if (oldDate === newDate) return [];
  const changes: { id: string; due_date: string | null }[] = [];
  for (const row of rows) {
    const offset = offsetOf(row);
    if (offset === null) continue;
    if (row.due_date !== seededDueDate(oldDate, offset)) continue;
    changes.push({ id: row.id, due_date: seededDueDate(newDate, offset) });
  }
  return changes;
}
