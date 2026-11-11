// Script-style assertions for journey-phase derivation (AD-039).
// Run via: `npx tsx lib/journey.test.ts`

import assert from "node:assert/strict";
import { deriveJourneyPhase, journeyPhaseName } from "./journey";

// Fresh start: nothing decided, nothing sent, move date ahead.
assert.equal(
  deriveJourneyPhase({
    today: "2027-06-13",
    moveDate: "2027-10-27",
    noticeSent: false,
    decision: "undecided",
  }),
  "foundations",
);

// No lease tracked at all.
assert.equal(
  deriveJourneyPhase({
    today: "2027-06-13",
    moveDate: null,
    noticeSent: false,
    decision: null,
  }),
  "foundations",
);

// Decision made (any non-undecided) but notice not yet out → design.
assert.equal(
  deriveJourneyPhase({
    today: "2027-08-13",
    moveDate: "2027-10-27",
    noticeSent: false,
    decision: "vacate",
  }),
  "design",
);
assert.equal(
  deriveJourneyPhase({
    today: "2027-08-13",
    moveDate: "2027-10-27",
    noticeSent: false,
    decision: "renew",
  }),
  "design",
);

// Notice sent → execute (regardless of decision value).
assert.equal(
  deriveJourneyPhase({
    today: "2027-09-13",
    moveDate: "2027-10-27",
    noticeSent: true,
    decision: "vacate",
  }),
  "execute",
);

// Move day itself and beyond → settle, even with notice sent.
assert.equal(
  deriveJourneyPhase({
    today: "2027-10-27",
    moveDate: "2027-10-27",
    noticeSent: true,
    decision: "vacate",
  }),
  "settle",
);
assert.equal(
  deriveJourneyPhase({
    today: "2027-12-14",
    moveDate: "2027-10-27",
    noticeSent: true,
    decision: "vacate",
  }),
  "settle",
);

// No move date → can't settle; falls through to execution state.
assert.equal(
  deriveJourneyPhase({
    today: "2027-12-14",
    moveDate: null,
    noticeSent: true,
    decision: "vacate",
  }),
  "execute",
);

assert.equal(journeyPhaseName("settle"), "Settle");
assert.equal(journeyPhaseName("foundations"), "Foundations");

console.log("lib/journey.test.ts — all assertions passed");
