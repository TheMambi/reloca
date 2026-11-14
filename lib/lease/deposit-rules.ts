// How long a landlord has to return or itemize the security deposit, by state.
//
// Only Colorado is listed: it is the one figure this project already carried.
// A state is added here only with a citation to its statute. For every other
// state the app shows no deadline and asks the user to check their state's
// rule, because a wrong legal date is worse than none.

import { getCities } from "@/lib/data/cities";
import { US_STATES } from "@/lib/lease/us-states";

const DEPOSIT_RETURN_DAYS: Record<string, number> = {
  CO: 60,
};

const STATE_NAMES = new Map(US_STATES.map((s) => [s.code, s.name]));

/** Days after move-out, or null when the state is unknown or not listed. */
export function depositReturnDays(stateCode: string | null): number | null {
  return stateCode ? (DEPOSIT_RETURN_DAYS[stateCode] ?? null) : null;
}

/**
 * State of the leased home, read from the lease's free-text city line
 * ("Sacramento, CA 95816"). Falls back to the city registry for a bare city
 * name ("Denver"). Null when neither names a state.
 */
export function leaseStateCode(cityLine: string): string | null {
  const codes = [...cityLine.matchAll(/\b([A-Z]{2})\b/g)]
    .map((m) => m[1])
    .filter((code) => STATE_NAMES.has(code));
  if (codes.length > 0) return codes[codes.length - 1];
  const name = cityLine.split(",")[0].trim().toLowerCase();
  return getCities().find((c) => c.displayName.toLowerCase() === name)?.stateCode ?? null;
}

export function stateName(stateCode: string): string {
  return STATE_NAMES.get(stateCode) ?? stateCode;
}
