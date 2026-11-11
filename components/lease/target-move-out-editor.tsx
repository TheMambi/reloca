"use client";

import { useState, useTransition } from "react";
import { CalendarIcon } from "lucide-react";
import { Calendar } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { updateLeaseTerms } from "@/app/lease/actions";

interface TargetMoveOutEditorProps {
  leaseId: string;
  current: string; // ISO date (yyyy-mm-dd)
  leaseStartDate: string;
  /** When true (e.g. notice already sent), the popover is read-only. */
  disabled?: boolean;
}

// UTC throughout — same convention as the rest of the lease module so date-only
// ISO strings stay stable across TZs.
function isoToDate(iso: string): Date {
  return new Date(iso + "T00:00:00.000Z");
}

function dateToIso(d: Date): string {
  // `toISOString()` always emits UTC; slice the date portion.
  return d.toISOString().slice(0, 10);
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

export function TargetMoveOutEditor({
  leaseId,
  current,
  leaseStartDate,
  disabled = false,
}: TargetMoveOutEditorProps) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  // The earliest date we'll accept: whichever is later between today and the
  // lease start. Past-dated targets are nonsensical for a forecaster.
  const today = todayIso();
  const minIso = leaseStartDate > today ? leaseStartDate : today;
  const minDate = isoToDate(minIso);

  function onSelect(d: Date | undefined) {
    if (!d) return;
    const iso = dateToIso(d);
    if (iso === current) {
      setOpen(false);
      return;
    }
    startTransition(async () => {
      await updateLeaseTerms(leaseId, { target_move_out_date: iso });
      setOpen(false);
    });
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        disabled={disabled || pending}
        className={`label-cap flex items-center gap-2 rounded-[var(--radius-sm)] border border-border bg-card px-3 py-1.5 text-[10px] tracking-wider text-muted-foreground transition-colors hover:bg-popover hover:text-foreground disabled:cursor-not-allowed disabled:opacity-60 ${
          pending ? "opacity-60" : ""
        }`}
      >
        <CalendarIcon className="size-3" strokeWidth={1.75} />
        <span>TARGET MOVE-OUT</span>
        <span className="mono-num text-foreground">{current}</span>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-auto p-0">
        <Calendar
          mode="single"
          selected={isoToDate(current)}
          onSelect={onSelect}
          defaultMonth={isoToDate(current)}
          disabled={(d) => d < minDate}
        />
      </PopoverContent>
    </Popover>
  );
}
