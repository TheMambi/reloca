// Script-style assertions for `renderNoticeTemplate`.
// Run via: `npx tsx components/lease/notice-template.test.ts`
//
// We don't have Vitest/Jest in this project; this file is a self-contained
// node script that exits non-zero on assertion failure.

import assert from "node:assert/strict";
import { renderNoticeTemplate } from "./notice-template";

// Fictional fixture household.
const lease = {
  unit_address: "100 Sample Street, Unit 204",
  city: "Denver, CO 80000",
  landlord_display_name: "Juniper Court Leasing",
  residents: [
    { name: "Sam Rivera", isPrimary: true },
    { name: "Alex Chen", isPrimary: false },
  ],
};

const out = renderNoticeTemplate(lease, "2027-10-25");

assert.equal(
  out.subject,
  "60-Day Notice to Vacate — Unit 204, 100 Sample Street",
  "subject formatting",
);
assert(
  out.plaintext.includes("Sam Rivera, Alex Chen"),
  "comma-joined residents present",
);
assert(
  out.plaintext.includes("Monday, October 25, 2027"),
  "long-form move-out date present",
);
assert(
  out.plaintext.includes("Hello Juniper Court Leasing"),
  "greeting uses landlord_display_name",
);
assert(
  out.plaintext.endsWith("Alex Chen"),
  "signature ends with last resident",
);
assert.equal(out.markdown, out.plaintext, "markdown mirrors plaintext for now");

// Edge case: null landlord_display_name falls back to "Landlord".
const fallback = renderNoticeTemplate(
  { ...lease, landlord_display_name: null },
  "2027-10-25",
);
assert(
  fallback.plaintext.startsWith("Hello Landlord,"),
  "null landlord falls back to 'Landlord'",
);

// Edge case: address with no "Unit X" segment — subject shows em-dash placeholder.
const noUnit = renderNoticeTemplate(
  { ...lease, unit_address: "200 Main Street" },
  "2027-10-25",
);
assert.equal(
  noUnit.subject,
  "60-Day Notice to Vacate — Unit —, 200 Main Street",
  "subject handles address without Unit",
);

console.log("notice-template.test.ts ✅");
