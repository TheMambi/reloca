"use client";

import { useState, useTransition, useRef } from "react";
import { CalendarIcon, Plus, Trash2, FileDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Calendar } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  addRoom,
  deleteRoom,
  updateRoomRecord,
  updateWalkthrough,
  generateWalkthroughReport,
} from "@/app/lease/move-out-actions";
import { settle } from "@/lib/settle-action";
import type {
  MoveOutWalkthrough,
  MoveOutRoomRecord,
} from "@/schemas/move-out";
import { cn } from "@/lib/utils";
import { isoToPickerDate, pickerDateToIso } from "@/lib/dates";


interface Props {
  walkthrough: MoveOutWalkthrough;
  rooms: MoveOutRoomRecord[];
}

export function WalkthroughForm({ walkthrough, rooms }: Props) {
  const [calOpen, setCalOpen] = useState(false);
  const [overallNotes, setOverallNotes] = useState(
    walkthrough.overall_notes ?? "",
  );
  const [walkthroughDate, setWalkthroughDate] = useState<string | null>(
    walkthrough.walkthrough_date,
  );
  const [reportError, setReportError] = useState<string | null>(null);
  const [reportPending, startReport] = useTransition();
  const [addRoomOpen, setAddRoomOpen] = useState(false);
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);

  // Debounced auto-save for walkthrough header (date + notes). Per-room edits
  // get their own debounced saves below.
  const headerSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  function queueHeaderSave(next: {
    walkthrough_date?: string | null;
    overall_notes?: string | null;
  }) {
    if (headerSaveTimer.current) clearTimeout(headerSaveTimer.current);
    headerSaveTimer.current = setTimeout(() => {
      void updateWalkthrough(walkthrough.id, next).catch(() => {
        // Quiet failure — revalidatePath on next read brings us back.
      });
    }, 400);
  }

  function handleNotesChange(v: string) {
    setOverallNotes(v);
    queueHeaderSave({ overall_notes: v.trim() === "" ? null : v });
  }

  function handleDateChange(iso: string | null) {
    setWalkthroughDate(iso);
    queueHeaderSave({ walkthrough_date: iso });
  }

  function handleGenerate() {
    setReportError(null);
    startReport(async () => {
      const result = await settle(generateWalkthroughReport(walkthrough.id));
      if (!result.ok) {
        setReportError(result.error);
        return;
      }
      // Convert base64 → Blob → object URL → download.
      const binary = atob(result.base64);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
      const blob = new Blob([bytes], { type: "application/pdf" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = result.filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    });
  }

  return (
    <div className="flex flex-col gap-5">
      {/* Header — date + overall notes */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-[200px_1fr]">
        <div className="flex flex-col gap-1.5">
          <span className="label-cap text-[10px] text-muted-foreground">
            WALKTHROUGH DATE
          </span>
          <Popover open={calOpen} onOpenChange={setCalOpen}>
            <PopoverTrigger asChild>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className={cn(
                  "mono-num h-9 w-full justify-between text-xs font-normal",
                  !walkthroughDate && "text-muted-foreground",
                )}
              >
                <span>{walkthroughDate ?? "— pick a date"}</span>
                <CalendarIcon className="size-3.5" strokeWidth={1.75} />
              </Button>
            </PopoverTrigger>
            <PopoverContent align="start" className="w-auto p-0">
              <Calendar
                mode="single"
                selected={
                  walkthroughDate ? isoToPickerDate(walkthroughDate) : undefined
                }
                defaultMonth={
                  walkthroughDate ? isoToPickerDate(walkthroughDate) : new Date()
                }
                onSelect={(d) => {
                  if (!d) return;
                  handleDateChange(pickerDateToIso(d));
                  setCalOpen(false);
                }}
              />
            </PopoverContent>
          </Popover>
        </div>

        <div className="flex flex-col gap-1.5">
          <label
            htmlFor="walkthrough-notes"
            className="label-cap text-[10px] text-muted-foreground"
          >
            OVERALL NOTES
          </label>
          <textarea
            id="walkthrough-notes"
            value={overallNotes}
            onChange={(e) => handleNotesChange(e.target.value)}
            placeholder="Anything that applies across rooms — utilities turned off, keys returned, walkthrough partner present, etc."
            rows={2}
            className="min-h-[3.5rem] w-full resize-none rounded-[var(--radius-sm)] border border-border bg-background/40 px-3 py-2 text-xs leading-relaxed text-foreground outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
          />
        </div>
      </div>

      {/* Per-room cards */}
      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-foreground">
            Rooms · {rooms.length}
          </h3>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setAddRoomOpen(true)}
            className="gap-1.5"
          >
            <Plus className="size-3.5" strokeWidth={1.75} />
            Add room
          </Button>
        </div>

        {rooms.length === 0 ? (
          <p className="rounded-[var(--radius-sm)] border border-dashed border-border bg-background/30 px-4 py-6 text-center text-xs text-muted-foreground">
            No rooms yet. Add one above to start documenting.
          </p>
        ) : (
          <ul className="flex flex-col gap-3">
            {rooms.map((room) => (
              <li key={room.id}>
                <RoomCard
                  room={room}
                  onDelete={() => setPendingDeleteId(room.id)}
                />
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Footer — generate report */}
      <div className="flex items-center justify-between border-t border-border pt-4">
        <div className="text-[11px] text-muted-foreground">
          {walkthrough.pdf_generated_at
            ? `Last report: ${new Date(walkthrough.pdf_generated_at).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}`
            : "No report generated yet."}
        </div>
        <div className="flex items-center gap-3">
          {reportError ? (
            <span
              role="alert"
              className="text-[11px] text-[var(--danger)]"
            >
              {reportError}
            </span>
          ) : null}
          <Button
            type="button"
            onClick={handleGenerate}
            disabled={reportPending || rooms.length === 0}
            className="gap-1.5"
          >
            <FileDown className="size-3.5" strokeWidth={1.75} />
            {reportPending ? "Generating…" : "Generate PDF report"}
          </Button>
        </div>
      </div>

      <AddRoomDialog
        open={addRoomOpen}
        onOpenChange={setAddRoomOpen}
        walkthroughId={walkthrough.id}
      />

      <DeleteRoomDialog
        roomId={pendingDeleteId}
        roomName={
          rooms.find((r) => r.id === pendingDeleteId)?.room_name ?? null
        }
        onClose={() => setPendingDeleteId(null)}
      />
    </div>
  );
}

// ── Per-room card ──────────────────────────────────────────────────────

function RoomCard({
  room,
  onDelete,
}: {
  room: MoveOutRoomRecord;
  onDelete: () => void;
}) {
  // Local state mirrors props; debounced saves persist edits to the server.
  const [name, setName] = useState(room.room_name);
  const [condition, setCondition] = useState<number | null>(
    room.condition_rating,
  );
  const [cleanliness, setCleanliness] = useState<number | null>(
    room.cleanliness_rating,
  );
  const [walls, setWalls] = useState(room.walls_status ?? "");
  const [floors, setFloors] = useState(room.floors_status ?? "");
  const [appliances, setAppliances] = useState(room.appliances_status ?? "");
  const [fixtures, setFixtures] = useState(room.fixtures_status ?? "");
  const [notes, setNotes] = useState(room.notes ?? "");

  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  function queueSave(patch: Parameters<typeof updateRoomRecord>[1]) {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      void updateRoomRecord(room.id, patch).catch(() => {
        // Quiet — revalidatePath will reset on the next read if anything diverged.
      });
    }, 400);
  }

  function handleRating(
    field: "condition_rating" | "cleanliness_rating",
    value: number,
  ) {
    if (field === "condition_rating") {
      // Click the same star to clear (so users can un-rate).
      const next = condition === value ? null : value;
      setCondition(next);
      queueSave({ condition_rating: next });
    } else {
      const next = cleanliness === value ? null : value;
      setCleanliness(next);
      queueSave({ cleanliness_rating: next });
    }
  }

  function handleNameChange(v: string) {
    setName(v);
    if (v.trim() !== "") queueSave({ room_name: v.trim() });
  }

  function strOrNull(s: string): string | null {
    return s.trim() === "" ? null : s;
  }

  return (
    <article className="rounded-[var(--radius-md)] border border-border bg-card/80 p-4">
      <div className="flex items-start justify-between gap-3">
        <Input
          value={name}
          onChange={(e) => handleNameChange(e.target.value)}
          aria-label="Room name"
          className="h-9 max-w-sm text-sm font-semibold"
        />
        <button
          type="button"
          onClick={onDelete}
          aria-label={`Delete ${name}`}
          className="grid size-8 shrink-0 place-items-center rounded-[var(--radius-sm)] text-muted-foreground transition-colors hover:bg-[oklch(var(--danger-raw)/0.1)] hover:text-[var(--danger)]"
        >
          <Trash2 className="size-3.5" strokeWidth={1.75} />
        </button>
      </div>

      <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
        <RatingRow
          label="Condition"
          value={condition}
          onChange={(v) => handleRating("condition_rating", v)}
        />
        <RatingRow
          label="Cleanliness"
          value={cleanliness}
          onChange={(v) => handleRating("cleanliness_rating", v)}
        />
      </div>

      <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
        <StatusField
          label="Walls"
          value={walls}
          onChange={(v) => {
            setWalls(v);
            queueSave({ walls_status: strOrNull(v) });
          }}
        />
        <StatusField
          label="Floors"
          value={floors}
          onChange={(v) => {
            setFloors(v);
            queueSave({ floors_status: strOrNull(v) });
          }}
        />
        <StatusField
          label="Appliances"
          value={appliances}
          onChange={(v) => {
            setAppliances(v);
            queueSave({ appliances_status: strOrNull(v) });
          }}
        />
        <StatusField
          label="Fixtures"
          value={fixtures}
          onChange={(v) => {
            setFixtures(v);
            queueSave({ fixtures_status: strOrNull(v) });
          }}
        />
      </div>

      <div className="mt-3 flex flex-col gap-1.5">
        <label
          htmlFor={`room-notes-${room.id}`}
          className="label-cap text-[10px] text-muted-foreground"
        >
          NOTES
        </label>
        <textarea
          id={`room-notes-${room.id}`}
          value={notes}
          onChange={(e) => {
            setNotes(e.target.value);
            queueSave({ notes: strOrNull(e.target.value) });
          }}
          rows={2}
          placeholder="Anything specific about this room — pre-existing damage, cleaning done, replaced bulbs, etc."
          className="min-h-[3rem] w-full resize-none rounded-[var(--radius-sm)] border border-border bg-background/40 px-3 py-2 text-xs leading-relaxed text-foreground outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
        />
      </div>
    </article>
  );
}

function RatingRow({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number | null;
  onChange: (v: number) => void;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="label-cap text-[10px] text-muted-foreground">
        {label.toUpperCase()}
      </span>
      <div role="radiogroup" aria-label={label} className="flex gap-1">
        {[1, 2, 3, 4, 5].map((n) => {
          const filled = value !== null && n <= value;
          return (
            <button
              key={n}
              type="button"
              role="radio"
              aria-checked={value === n}
              aria-label={`${label} rating ${n} of 5`}
              onClick={() => onChange(n)}
              className={cn(
                "grid h-7 w-7 place-items-center rounded-[var(--radius-sm)] border text-sm transition-colors",
                filled
                  ? "border-[var(--brand-secondary)] bg-[var(--brand-secondary)]/15 text-[var(--brand-secondary)]"
                  : "border-border bg-background/40 text-muted-foreground hover:text-foreground",
              )}
            >
              {filled ? "★" : "☆"}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function StatusField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="label-cap text-[10px] text-muted-foreground">
        {label.toUpperCase()}
        <Input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={`How are the ${label.toLowerCase()}?`}
          className="mt-1.5 h-8 text-xs"
        />
      </label>
    </div>
  );
}

// ── Add-room dialog ────────────────────────────────────────────────────

function AddRoomDialog({
  open,
  onOpenChange,
  walkthroughId,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  walkthroughId: string;
}) {
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startAdd] = useTransition();

  function handleAdd(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const trimmed = name.trim();
    if (trimmed.length === 0) {
      setError("Name required.");
      return;
    }
    startAdd(async () => {
      const res = await settle(addRoom(walkthroughId, trimmed));
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setName("");
      onOpenChange(false);
    });
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) {
          setName("");
          setError(null);
        }
        onOpenChange(o);
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Add a room</DialogTitle>
          <DialogDescription>
            Anything beyond the four defaults — office, garage, balcony,
            laundry, hallway, etc.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleAdd} className="space-y-4">
          <div className="flex flex-col gap-1.5">
            <label
              htmlFor="add-room-name"
              className="label-cap text-[10px] text-muted-foreground"
            >
              ROOM NAME
            </label>
            <Input
              id="add-room-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoFocus
              className="h-9 text-sm"
            />
          </div>
          {error ? (
            <p
              role="alert"
              className="rounded-[var(--radius-sm)] border border-[oklch(var(--danger-raw)/0.3)] bg-[oklch(var(--danger-raw)/0.1)] px-2 py-1.5 text-[11px] text-[var(--danger)]"
            >
              {error}
            </p>
          ) : null}
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={pending}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={pending || name.trim() === ""}>
              {pending ? "Adding…" : "Add room"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function DeleteRoomDialog({
  roomId,
  roomName,
  onClose,
}: {
  roomId: string | null;
  roomName: string | null;
  onClose: () => void;
}) {
  const [error, setError] = useState<string | null>(null);
  const [pending, startDelete] = useTransition();

  function handleDelete() {
    if (!roomId) return;
    setError(null);
    startDelete(async () => {
      const res = await settle(deleteRoom(roomId));
      if (res.ok) onClose();
      else setError(res.error);
    });
  }

  return (
    <Dialog
      open={roomId !== null}
      onOpenChange={(o) => {
        if (!o) {
          setError(null);
          onClose();
        }
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Delete this room?</DialogTitle>
          <DialogDescription>
            This can&rsquo;t be undone. The row will be removed from the
            walkthrough.
          </DialogDescription>
        </DialogHeader>
        {roomName ? (
          <p className="rounded-[var(--radius-sm)] border border-border/60 bg-background/40 px-3 py-2 text-xs text-foreground">
            {roomName}
          </p>
        ) : null}
        {error ? (
          <p
            role="alert"
            className="rounded-[var(--radius-sm)] border border-[oklch(var(--danger-raw)/0.3)] bg-[oklch(var(--danger-raw)/0.1)] px-3 py-2 text-xs text-[var(--danger)]"
          >
            {error}
          </p>
        ) : null}
        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={onClose}
            disabled={pending}
          >
            Cancel
          </Button>
          <Button
            type="button"
            onClick={handleDelete}
            disabled={pending}
            className="bg-[var(--danger)] text-white hover:bg-[oklch(var(--danger-raw)/0.9)]"
          >
            {pending ? "Deleting…" : "Delete room"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
