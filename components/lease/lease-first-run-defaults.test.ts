// Run: npx tsx components/lease/lease-first-run-defaults.test.ts
//
// Outside the demo the lease setup form must not start with anyone's details:
// a person who fills in half of it would save the sample household's rest.
import assert from "node:assert/strict";
import { CreateLeaseTermsInput } from "@/schemas/lease";
import { FIRST_RUN_BLANK, FIRST_RUN_DEFAULTS } from "./lease-first-run-defaults";

const { pet_rent_monthly, parking_monthly, decision, residents, ...rest } = FIRST_RUN_BLANK;
for (const [field, value] of Object.entries(rest)) {
  assert.ok(value === "" || value === null || (Array.isArray(value) && value.length === 0), `${field} starts empty`);
}
assert.deepEqual(residents, [{ name: "", email: "", isPrimary: true }], "one empty resident row");
assert.equal(pet_rent_monthly, 0);
assert.equal(parking_monthly, 0);
assert.equal(decision, "undecided", "no decision is made for the household");
assert.deepEqual(Object.keys(FIRST_RUN_BLANK).sort(), Object.keys(FIRST_RUN_DEFAULTS).sort(), "the same fields as the sample");
assert.equal(CreateLeaseTermsInput.safeParse(FIRST_RUN_BLANK).success, false, "the server refuses the form as it starts");

console.log("lease-first-run-defaults: the form starts empty outside the demo.");
