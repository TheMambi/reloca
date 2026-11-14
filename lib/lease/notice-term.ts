// Pure and client-safe: the notice composer imports it.

/** "30-day notice", or plain "notice" for a lease that requires none. */
export function noticeTerm(noticeDays: number): string {
  return noticeDays > 0 ? `${noticeDays}-day notice` : "notice";
}
