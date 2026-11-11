"use client";

import { useEffect, useState } from "react";
import { daysUntilIso, isValidIsoDate, todayLocalIso } from "@/lib/dates";

const STORAGE_KEY = "reloca:move-date";

// `serverDefault` is the active relocation's move date, resolved server-side and
// passed in (B.3 retired the client-side NEXT_PUBLIC_MOVE_DATE read). A valid
// localStorage override still wins so the in-place editor stays instant — but
// since Wave 1 the editor persists to the DB and clears the override on
// success, so the override only survives while a write is in flight or failed.
function read(serverDefault: string | null): string | null {
  if (typeof window === "undefined") return serverDefault;
  const stored = window.localStorage.getItem(STORAGE_KEY);
  if (isValidIsoDate(stored)) return stored;
  return serverDefault;
}

/** Days until `iso` measured from the user's local today (client surface). */
export function daysUntil(iso: string | null): number | null {
  return daysUntilIso(iso, todayLocalIso());
}

/**
 * Fraction (0–100) of the planning window elapsed: from a planning start to the
 * move date. Planning start is the active relocation's creation date when known,
 * else a 120-day window before the move. Returns null with no valid move date.
 * Past the move day, the window is complete (100).
 */
export function moveProgressPct(
  createdAtIso: string | null,
  moveIso: string | null,
): number | null {
  if (!isValidIsoDate(moveIso)) return null;
  const moveMs = new Date(`${moveIso}T00:00:00`).getTime();
  const createdDate = createdAtIso ? createdAtIso.slice(0, 10) : null;
  const startMs = isValidIsoDate(createdDate)
    ? new Date(`${createdDate}T00:00:00`).getTime()
    : moveMs - 120 * 24 * 60 * 60 * 1000;
  if (moveMs <= startMs) return 100; // degenerate window → treat as complete
  const pct = ((Date.now() - startMs) / (moveMs - startMs)) * 100;
  return Math.max(0, Math.min(100, pct));
}

/** Drop the localStorage override once the server accepts the new date. */
export function clearStoredMoveDate(): void {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(STORAGE_KEY);
}

export function useMoveDate(serverDefault: string | null = null) {
  const [moveDate, setMoveDate] = useState<string | null>(serverDefault);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    setMoveDate(read(serverDefault));
    setHydrated(true);
  }, [serverDefault]);

  const update = (next: string | null) => {
    setMoveDate(next);
    if (typeof window === "undefined") return;
    if (next && isValidIsoDate(next)) {
      window.localStorage.setItem(STORAGE_KEY, next);
    } else {
      window.localStorage.removeItem(STORAGE_KEY);
    }
  };

  return { moveDate, setMoveDate: update, hydrated };
}
