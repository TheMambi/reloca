"use client";

import { useEffect, useState } from "react";
import { daysUntilIso, isValidIsoDate } from "@/lib/dates";

// Earlier versions kept an unsaved date under this key and preferred it to the
// server's. One failed save then showed a date the database did not have, on
// every relocation, until a later save succeeded. The key is only removed now.
const LEGACY_STORAGE_KEY = "reloca:move-date";

/** Days until `iso`, counted from the same household today the server uses. */
export function daysUntil(iso: string | null): number | null {
  return daysUntilIso(iso);
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

/**
 * The move date shown in the header: the server's value, replaced at once by a
 * new pick while it is being saved. The caller puts the server's value back if
 * the save fails.
 */
export function useMoveDate(serverDefault: string | null = null) {
  const [moveDate, setMoveDate] = useState<string | null>(serverDefault);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    setMoveDate(serverDefault);
    setHydrated(true);
  }, [serverDefault]);

  useEffect(() => {
    window.localStorage.removeItem(LEGACY_STORAGE_KEY);
  }, []);

  return { moveDate, setMoveDate, hydrated };
}
