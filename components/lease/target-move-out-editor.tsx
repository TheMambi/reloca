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
import { settle } from "@/lib/settle-action";
import { isoToPickerDate, pickerDateToIso, todayInZoneIso } from "@/lib/dates";

interface TargetMoveOutEditorProps {
  leaseId: string;
  current: string; // ISO date (yyyy-mm-dd)
  leaseStartDate: string;
  /** When true (e.g. notice already sent), the popover is read-only. */
  disabled?: boolean;
}


export function TargetMoveOutEditor({
  leaseId,
  current,
  leaseStartDate,
  disabled = false,
}: TargetMoveOutEditorProps) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  // The earliest date we'll accept: whichever is later between today and the
  // lease start. Past-dated targets are nonsensical for a forecaster.
  const today = todayInZoneIso();
  const minIso = leaseStartDate > today ? leaseStartDate : today;
  const minDate = isoToPickerDate(minIso);

  function onSelect(d: Date | undefined) {
    if (!d) return;
    const iso = pickerDateToIso(d);
    if (iso === current) {
      setOpen(false);
      return;
    }
    setError(null);
    startTransition(async () => {
      const res = await settle(updateLeaseTerms(leaseId, { target_move_out_date: iso }));
      if (res.ok) setOpen(false);
      else setError(res.error);
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
          selected={isoToPickerDate(current)}
          onSelect={onSelect}
          defaultMonth={isoToPickerDate(current)}
          disabled={(d) => d < minDate}
        />
        {error ? (
          <p role="alert" className="max-w-[16rem] px-3 pb-3 text-[11px] text-[var(--danger)]">
            {error}
          </p>
        ) : null}
      </PopoverContent>
    </Popover>
  );
}
