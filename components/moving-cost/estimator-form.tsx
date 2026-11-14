"use client";

import { useState, useTransition } from "react";
import { CalendarIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Calendar } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { upsertMoveEstimate } from "@/app/moving-cost/actions";
import { cn } from "@/lib/utils";
import { isoToPickerDate, pickerDateToIso } from "@/lib/dates";

function numOrNull(s: string): number | null {
  if (s.trim() === "") return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

interface Props {
  initial?: {
    distance_miles: number | null;
    volume_cuft: number | null;
    move_date: string | null;
  };
  onSaved?: () => void;
  variant?: "first-run" | "re-edit";
}

export function EstimatorForm({ initial, onSaved, variant = "first-run" }: Props) {
  const [distance, setDistance] = useState(
    initial?.distance_miles == null ? "" : String(initial.distance_miles),
  );
  const [volume, setVolume] = useState(
    initial?.volume_cuft == null ? "" : String(initial.volume_cuft),
  );
  const [moveDate, setMoveDate] = useState<string | null>(initial?.move_date ?? null);
  const [calOpen, setCalOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const result = await upsertMoveEstimate({
        distance_miles: numOrNull(distance),
        volume_cuft: numOrNull(volume),
        move_date: moveDate,
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      onSaved?.();
    });
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="rounded-[var(--radius-md)] border border-border bg-card/80 p-5"
    >
      {variant === "first-run" ? (
        <div className="mb-4">
          <p className="label-cap text-[10px] tracking-wider text-muted-foreground">
            GET STARTED
          </p>
          <h3 className="mt-1 text-base font-semibold text-foreground">
            Tell us about the move
          </h3>
          <p className="mt-1 text-xs text-muted-foreground">
            We&apos;ll lay out three ways to move — drive a rental truck
            yourself, hire professional movers, or split the work — and
            you can adjust each one until the costs match a real quote.
          </p>
        </div>
      ) : (
        <div className="mb-4">
          <p className="label-cap text-[10px] tracking-wider text-muted-foreground">
            BASICS
          </p>
        </div>
      )}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div className="flex flex-col gap-1.5">
          <label
            htmlFor="mc-distance"
            className="label-cap text-[10px] text-muted-foreground"
          >
            DISTANCE (MILES)
          </label>
          <Input
            id="mc-distance"
            inputMode="decimal"
            value={distance}
            onChange={(e) => setDistance(e.target.value)}
            placeholder="1300"
            className="h-9 text-sm mono-num"
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <label
            htmlFor="mc-volume"
            className="label-cap text-[10px] text-muted-foreground"
          >
            VOLUME (CU FT)
          </label>
          <Input
            id="mc-volume"
            inputMode="decimal"
            value={volume}
            onChange={(e) => setVolume(e.target.value)}
            placeholder="800"
            className="h-9 text-sm mono-num"
          />
          <span className="text-[10px] text-muted-foreground">
            1-bedroom ~400–600 · 2-bedroom ~600–1,000
          </span>
        </div>
        <div className="flex flex-col gap-1.5">
          <span className="label-cap text-[10px] text-muted-foreground">
            MOVE DATE
          </span>
          <Popover open={calOpen} onOpenChange={setCalOpen}>
            <PopoverTrigger asChild>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className={cn(
                  "mono-num h-9 w-full justify-between text-xs font-normal",
                  !moveDate && "text-muted-foreground",
                )}
              >
                <span>{moveDate ?? "— pick a date"}</span>
                <CalendarIcon className="size-3.5" strokeWidth={1.75} />
              </Button>
            </PopoverTrigger>
            <PopoverContent align="start" className="w-auto p-0">
              <Calendar
                mode="single"
                selected={moveDate ? isoToPickerDate(moveDate) : undefined}
                defaultMonth={moveDate ? isoToPickerDate(moveDate) : new Date()}
                onSelect={(d) => {
                  if (!d) return;
                  setMoveDate(pickerDateToIso(d));
                  setCalOpen(false);
                }}
              />
              <div className="flex justify-end border-t border-border px-2 py-1.5">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setMoveDate(null);
                    setCalOpen(false);
                  }}
                  className="text-xs"
                >
                  Clear
                </Button>
              </div>
            </PopoverContent>
          </Popover>
        </div>
      </div>

      {error ? (
        <p
          role="alert"
          className="mt-3 rounded-[var(--radius-sm)] border border-[oklch(var(--danger-raw)/0.3)] bg-[oklch(var(--danger-raw)/0.1)] px-2 py-1.5 text-[11px] text-[var(--danger)]"
        >
          {error}
        </p>
      ) : null}

      <div className="mt-4 flex justify-end gap-2">
        <Button type="submit" disabled={isPending}>
          {isPending
            ? "Saving…"
            : variant === "first-run"
              ? "Show my options"
              : "Save changes"}
        </Button>
      </div>
    </form>
  );
}
