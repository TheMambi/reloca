import type { LeaseTerms } from "@/schemas/lease";

/**
 * Render a 60-day notice-to-vacate from `LeaseTerms` + a chosen move-out date.
 *
 * Pure: no React, no DOM, no env. Server- and test-safe.
 *
 * Returns subject + plaintext + markdown bodies. The plaintext body is what
 * actually gets shoved into the `mailto:` link; markdown is identical for now
 * (we keep the field so a future Wave can switch to a Resend-rendered email).
 */
export function renderNoticeTemplate(
  lease: Pick<
    LeaseTerms,
    "unit_address" | "city" | "landlord_display_name" | "residents"
  >,
  moveOutDate: string,
): { subject: string; plaintext: string; markdown: string } {
  const residents = lease.residents.map((r) => r.name).join(", ");
  const moveOutFormatted = formatLongDate(moveOutDate);
  const subject = `60-Day Notice to Vacate — Unit ${unitNumber(lease.unit_address)}, ${streetOnly(lease.unit_address)}`;
  const plaintext = [
    `Hello ${lease.landlord_display_name ?? "Landlord"},`,
    "",
    "This email serves as written 60-day notice to vacate per our lease.",
    "",
    `  Unit:       ${lease.unit_address}, ${lease.city}`,
    `  Last day:   ${moveOutFormatted}`,
    `  Residents:  ${residents}`,
    "",
    "We will return keys and provide a forwarding address by the move-out date.",
    "Please confirm receipt of this notice and let us know the move-out",
    "inspection process.",
    "",
    "Thank you,",
    ...lease.residents.map((r) => r.name),
  ].join("\n");
  return { subject, plaintext, markdown: plaintext };
}

// "Monday, October 26, 2026" — UTC throughout to keep date-only ISO strings stable
// across TZs (matches the `formatCellDate` convention in decision-deadline-tracker).
function formatLongDate(iso: string): string {
  const d = new Date(iso + "T00:00:00.000Z");
  return d.toLocaleDateString("en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
    timeZone: "UTC",
  });
}

// "100 Sample Street, Unit 204" → "204"
function unitNumber(address: string): string {
  const match = address.match(/Unit\s+(\S+)/i);
  return match ? match[1] : "—";
}

// "100 Sample Street, Unit 204" → "100 Sample Street"
function streetOnly(address: string): string {
  const idx = address.toLowerCase().indexOf(", unit");
  return idx >= 0 ? address.slice(0, idx) : address;
}
