/**
 * Awaits a server action from the browser. A call that never got an answer
 * (offline, or turned away for sending too many requests) rejects instead of
 * returning a result, so it is given the same shape as a failed one.
 */
export async function settle<T extends { ok: boolean }>(
  call: Promise<T>,
): Promise<T | { ok: false; error: string }> {
  try {
    return await call;
  } catch {
    return { ok: false, error: "That didn't go through. Wait a moment and try again." };
  }
}
