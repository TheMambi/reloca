import "server-only";
import { z } from "zod";
import { friendlyDbError } from "@/lib/supabase/server";

/** What every server action answers with: the data, or one plain sentence. */
export type ActionResult<T extends object = object> = ({ ok: true } & T) | { ok: false; error: string };

export const INVALID_INPUT = "Those details don't look right. Check them and try again.";

/** A failure whose message is already written for the person using the app. */
export class ActionFailure extends Error {}

/** For `if (error) throw dbFailure(...)`: logs the database text, carries the plain sentence. */
export function dbFailure(
  context: string,
  error: { message?: string | null } | null | undefined,
): ActionFailure {
  return new ActionFailure(friendlyDbError(context, error));
}

/**
 * Runs the body of a server action and turns every way it can fail into
 * `{ ok: false, error }`. A thrown error would reach the browser as database
 * wording in development and as a framework sentence in production. Arguments
 * are parsed inside the body, so a refused argument ends here as well.
 */
export async function runAction<T extends object | void>(
  context: string,
  body: () => Promise<T>,
): Promise<ActionResult<T extends object ? T : object>> {
  type Result = ActionResult<T extends object ? T : object>;
  try {
    const value = await body();
    return { ok: true, ...(value ?? {}) } as Result;
  } catch (err) {
    if (err instanceof z.ZodError) return { ok: false, error: INVALID_INPUT };
    if (err instanceof ActionFailure) return { ok: false, error: err.message };
    return { ok: false, error: friendlyDbError(context, err as Error) };
  }
}
