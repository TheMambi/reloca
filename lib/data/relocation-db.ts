import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import { createClient, requireUserId } from "@/lib/supabase/server";
import { RelocationSchema } from "@/schemas";
import type { Relocation } from "@/schemas";
import { cityName, cityCode } from "./cities";

/**
 * Cookie that persists the *viewed* relocation across plain `<Link>` navigation
 * (Wave D, D.1). The `?relocation=` URL param is still the deep-linkable source
 * of truth and overrides this; the cookie only kicks in once the param is
 * dropped by a sidebar/drawer link. Written by the `setViewingRelocation`
 * server action; cleared when the user views the active move (so "active" stays
 * the clean default) and when a relocation is promoted or deleted.
 */
export const VIEWING_COOKIE = "reloca_viewing";

/** All relocations for the single user, oldest first. */
export async function getRelocations(): Promise<Relocation[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("relocations")
    .select("*")
    .eq("user_id", requireUserId())
    .order("created_at", { ascending: true });

  if (error) throw error;
  return (data ?? []).map((row) => RelocationSchema.parse(row));
}

/**
 * The active move — the single relocation with is_active_move = true. Drives the
 * execution tiles + the move context. `cache()` dedupes the read across the many
 * server components that resolve the context within one request.
 */
export const getActiveRelocation = cache(
  async (): Promise<Relocation | null> => {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("relocations")
      .select("*")
      .eq("user_id", requireUserId())
      .eq("is_active_move", true)
      .maybeSingle();

    if (error) throw error;
    return data ? RelocationSchema.parse(data) : null;
  },
);

/**
 * The move context every chrome surface needs: move date + origin/destination
 * display names and route codes — the values that were previously read from
 * `NEXT_PUBLIC_MOVE_DATE` + hardcoded "Denver"/"Long Beach"/"DEN"/"LGB" literals.
 */
export interface MoveContext {
  moveDate: string | null;
  originSlug: string;
  destinationSlug: string;
  originName: string;
  destinationName: string;
  originCode: string;
  destinationCode: string;
}

const FALLBACK_ORIGIN = "denver";
const FALLBACK_DESTINATION = "long-beach";

/**
 * Pure derivation (testable without the DB). Resolves the active relocation to a
 * MoveContext, falling back to the legacy env date + denver→long-beach defaults
 * so the app renders identically whether or not a relocation has been seeded
 * (the B.3 cutover must preserve current behavior; AD-028). Once a relocation is
 * seeded with move_date = the current env value, this returns byte-identical
 * values to the pre-cutover env/literal reads.
 */
export function deriveMoveContext(
  active: Relocation | null,
  envMoveDate: string | null,
): MoveContext {
  const originSlug = active?.origin_slug ?? FALLBACK_ORIGIN;
  const destinationSlug = active?.destination_slug ?? FALLBACK_DESTINATION;
  const moveDate = active?.move_date ?? envMoveDate ?? null;

  return {
    moveDate,
    originSlug,
    destinationSlug,
    originName: cityName(originSlug),
    destinationName: cityName(destinationSlug),
    originCode: cityCode(originSlug),
    destinationCode: cityCode(destinationSlug),
  };
}

/** Request-cached move context for server components + actions. */
export const getActiveMoveContext = cache(async (): Promise<MoveContext> => {
  const active = await getActiveRelocation();
  return deriveMoveContext(active, process.env.NEXT_PUBLIC_MOVE_DATE ?? null);
});

/**
 * Resolve the relocation a reference-driven view should render (Wave C). The
 * global switcher writes `?relocation=<id>`; reference pages pass that id here.
 * Falls back to the active move, then the first relocation — so a stale/absent
 * id never leaves a page without a context. Pure (testable without the DB).
 */
export function resolveViewingRelocation(
  relocations: Relocation[],
  relocationId: string | null | undefined,
): Relocation | null {
  if (relocationId) {
    const match = relocations.find((r) => r.id === relocationId);
    if (match) return match;
  }
  return relocations.find((r) => r.is_active_move) ?? relocations[0] ?? null;
}

/**
 * Effective viewing id, in precedence order: the explicit `?relocation=` param
 * wins (deep-linkable, overrides everything), else the persisted cookie. Pure
 * so the precedence is unit-testable without a request context. A null result
 * lets `resolveViewingRelocation` fall through to the active move → first.
 */
export function pickViewingId(
  paramId: string | null | undefined,
  cookieId: string | null | undefined,
): string | null {
  return paramId ?? cookieId ?? null;
}

/** Read the persisted viewing cookie, tolerating a non-request context. */
async function readViewingCookie(): Promise<string | null> {
  try {
    const store = await cookies();
    return store.get(VIEWING_COOKIE)?.value ?? null;
  } catch {
    // cookies() throws outside a request (e.g. a test importing this module);
    // treat it as "no persisted view" rather than failing the resolve.
    return null;
  }
}

/**
 * Server resolver for a reference page. Resolves the relocation a view should
 * render in precedence order: `?relocation=` param → `reloca_viewing` cookie →
 * active move → first relocation. Reading the cookie here is what makes a
 * switch survive plain sidebar/drawer navigation (which drops the param)
 * without rewriting every `<Link>`. Returns the resolved relocation plus the
 * active one so a view can tell whether it's a comparison.
 */
export async function getViewingRelocation(
  relocationId: string | null | undefined,
): Promise<{ viewing: Relocation | null; active: Relocation | null }> {
  const [relocations, cookieId] = await Promise.all([
    getRelocations(),
    readViewingCookie(),
  ]);
  const active = relocations.find((r) => r.is_active_move) ?? null;
  const viewing = resolveViewingRelocation(
    relocations,
    pickViewingId(relocationId, cookieId),
  );
  return { viewing, active };
}

/**
 * The move context for an arbitrary relocation (the viewing one), with the same
 * shape as `getActiveMoveContext`. Reference tiles use this so switching the
 * relocation recomputes their origin/destination.
 *
 * A real relocation carries its OWN (possibly null) move date — the env-date
 * fallback only kicks in when there's no relocation at all (so the env fallback
 * never leaks the active move's date onto a date-less comparison relocation).
 */
export function moveContextFor(relocation: Relocation | null): MoveContext {
  const envFallback = relocation
    ? null
    : process.env.NEXT_PUBLIC_MOVE_DATE ?? null;
  return deriveMoveContext(relocation, envFallback);
}

/** Display-ready relocation for the client switcher (names + codes resolved). */
export interface RelocationOption {
  id: string;
  label: string;
  originSlug: string;
  destinationSlug: string;
  originName: string;
  destinationName: string;
  originCode: string;
  destinationCode: string;
  moveDate: string | null;
  isActive: boolean;
}

/** Resolve a relocation's slugs to display names + route codes for the UI. */
export function toRelocationOption(r: Relocation): RelocationOption {
  return {
    id: r.id,
    label: r.label,
    originSlug: r.origin_slug,
    destinationSlug: r.destination_slug,
    originName: cityName(r.origin_slug),
    destinationName: cityName(r.destination_slug),
    originCode: cityCode(r.origin_slug),
    destinationCode: cityCode(r.destination_slug),
    moveDate: r.move_date,
    isActive: r.is_active_move,
  };
}
