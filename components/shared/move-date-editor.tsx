"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CalendarDays } from "lucide-react";
import { Calendar } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  useMoveDate,
  daysUntil,
  moveProgressPct,
} from "@/lib/use-move-date";
import {
  countdownPhrase,
  countdownTone,
  isValidIsoDate,
  isoToPickerDate,
  pickerDateToIso,
  type CountdownTone,
} from "@/lib/dates";
import { updateActiveMoveDate } from "@/app/relocations/actions";

// Move countdown is data (a deadline indicator), so status tones are allowed
// on it per AD-004 — but only on the number + the bar fill, never the chrome.
const TONE_TEXT: Record<CountdownTone, string> = {
  default: "text-foreground",
  ok: "text-[var(--ok)]",
  warn: "text-[var(--warn)]",
  danger: "text-[var(--danger)]",
};

const TONE_FILL: Record<CountdownTone, string> = {
  default: "bg-foreground/55",
  ok: "bg-[var(--ok)]",
  warn: "bg-[var(--warn)]",
  danger: "bg-[var(--danger)]",
};

export function MoveDateEditor({
  initialMoveDate = null,
  createdAt = null,
}: {
  initialMoveDate?: string | null;
  /** Active relocation's creation date — the planning-window start for the bar. */
  createdAt?: string | null;
}) {
  const { moveDate, setMoveDate, hydrated } = useMoveDate(initialMoveDate);
  const [open, setOpen] = useState(false);
  const [, startTransition] = useTransition();
  const router = useRouter();

  const [saveError, setSaveError] = useState<string | null>(null);

  // The strip shows the new date at once while it is saved. If the save fails
  // the saved date comes back and the popover reopens with the reason, so the
  // header never shows a date the database does not have.
  const persistMoveDate = (next: string | null) => {
    setMoveDate(next);
    setSaveError(null);
    startTransition(async () => {
      const result = await updateActiveMoveDate(next).catch(() => ({
        ok: false as const,
        error: "The move date wasn't saved. Try again.",
      }));
      if (result.ok) {
        router.refresh();
      } else {
        setMoveDate(initialMoveDate);
        setSaveError(result.error);
        setOpen(true);
      }
    });
  };

  const days = hydrated ? daysUntil(moveDate) : null;
  const phrase = countdownPhrase(days);
  const tone = countdownTone(days);
  const pct = hydrated ? moveProgressPct(createdAt, moveDate) : null;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="flex items-center gap-2.5 rounded-[var(--radius-md)] px-1.5 py-1 hover:bg-accent"
        >
          <CalendarDays
            className="hidden size-3.5 shrink-0 text-muted-foreground sm:block"
            strokeWidth={1.75}
          />
          <span className="flex items-baseline gap-1 whitespace-nowrap text-xs text-muted-foreground">
            {!hydrated ? (
              <span className="text-foreground">Move countdown</span>
            ) : (
              <>
                <span>{phrase.lead}</span>
                {phrase.count !== null && (
                  <span
                    className={`mono-num text-sm font-semibold tabular-nums ${TONE_TEXT[tone]}`}
                  >
                    {phrase.count}
                  </span>
                )}
                {phrase.trail && (
                  <span
                    className={
                      phrase.count === null ? `font-medium ${TONE_TEXT[tone]}` : ""
                    }
                  >
                    {phrase.trail}
                  </span>
                )}
              </>
            )}
          </span>
          {pct !== null && (
            <span
              aria-hidden="true"
              className="hidden h-1.5 w-20 overflow-hidden rounded-full bg-border/60 sm:block"
            >
              <span
                className={`block h-full rounded-full transition-[width] duration-500 ${TONE_FILL[tone]}`}
                style={{ width: `${pct}%` }}
              />
            </span>
          )}
          <span className="sr-only"> — edit move date</span>
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        sideOffset={8}
        className="w-auto rounded-none border-border bg-popover p-0 font-mono"
      >
        <div className="border-b border-border px-3 py-2">
          <p className="label-cap text-[10px] text-muted-foreground">
            MOVE · DATE
          </p>
          <p className="mt-1 font-mono text-xs text-foreground">
            {moveDate ?? "Not set yet"}
          </p>
          {saveError && (
            <p role="alert" className="mt-1 max-w-56 font-sans text-xs text-[var(--danger)]">
              {saveError}
            </p>
          )}
        </div>
        <Calendar
          mode="single"
          selected={isValidIsoDate(moveDate) ? isoToPickerDate(moveDate) : undefined}
          onSelect={(date) => {
            if (date) {
              persistMoveDate(pickerDateToIso(date));
              setOpen(false);
            }
          }}
          className="bg-popover"
        />
        <div className="flex items-center justify-between border-t border-border px-3 py-2">
          <button
            type="button"
            onClick={() => {
              persistMoveDate(null);
              setOpen(false);
            }}
            className="label-cap text-[10px] text-muted-foreground hover:text-[var(--danger)]"
          >
            CLEAR
          </button>
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="label-cap text-[10px] text-muted-foreground hover:text-foreground"
          >
            CLOSE
          </button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
