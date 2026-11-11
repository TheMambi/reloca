"use client";

import { useEffect, useState, useTransition } from "react";
import { CalendarIcon } from "lucide-react";
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
  createChecklistItem,
  updateChecklistItem,
} from "@/app/checklist/actions";
import type { ChecklistCategory, ChecklistItem } from "@/schemas";
import { cn } from "@/lib/utils";

// UTC ↔ ISO date helpers — same convention as the lease module so date-only
// strings stay stable across TZs.
function isoToDate(iso: string): Date {
  return new Date(iso + "T00:00:00.000Z");
}
function dateToIso(d: Date): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
function formatTriggerDate(iso: string): string {
  const d = isoToDate(iso);
  return d.toLocaleDateString("en-US", {
    weekday: "long",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

const CATEGORY_LABELS: Record<ChecklistCategory, string> = {
  lease: "LEASE & MOVE-OUT",
  "pre-move": "PRE-MOVE",
  "move-week": "MOVE WEEK",
  "post-move": "POST-MOVE",
};

// Categories the user can pick from in the edit dialog. Lease is intentionally
// excluded — those rows are managed by seedLeaseChecklistTasks, not user-driven.
const SELECTABLE_CATEGORIES: ChecklistCategory[] = [
  "pre-move",
  "move-week",
  "post-move",
];

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode: "create" | "edit";
  category: ChecklistCategory;
  initial?: Partial<ChecklistItem>;
  itemId?: string;
}

export function ChecklistTaskDialog({
  open,
  onOpenChange,
  mode,
  category,
  initial,
  itemId,
}: Props) {
  const [title, setTitle] = useState<string>(initial?.title ?? "");
  const [description, setDescription] = useState<string>(initial?.description ?? "");
  const [dueDate, setDueDate] = useState<string | null>(initial?.due_date ?? null);
  // Editable in edit mode; in create mode it stays at the prop value (the user
  // already picked the phase by clicking that group's "+ ADD TASK").
  const [categoryDraft, setCategoryDraft] = useState<ChecklistCategory>(category);
  const [calOpen, setCalOpen] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  // When the dialog reopens (or the item being edited changes), refresh the
  // controlled inputs from the latest props. Without this, switching from
  // editing row A to row B would keep A's stale values.
  useEffect(() => {
    if (open) {
      setTitle(initial?.title ?? "");
      setDescription(initial?.description ?? "");
      setDueDate(initial?.due_date ?? null);
      setCategoryDraft(category);
      setErrorMsg(null);
    }
  }, [open, initial?.title, initial?.description, initial?.due_date, itemId, category]);

  function handleOpenChange(next: boolean) {
    if (!next) {
      // Defensive reset on close — keeps "+ Add task" reopens clean.
      setErrorMsg(null);
    }
    onOpenChange(next);
  }

  function onSubmit() {
    setErrorMsg(null);
    const trimmed = title.trim();
    if (trimmed.length === 0) {
      setErrorMsg("Title is required.");
      return;
    }
    const descPayload = description.trim() === "" ? null : description.trim();

    startTransition(async () => {
      try {
        if (mode === "create") {
          await createChecklistItem({
            category,
            title: trimmed,
            description: descPayload,
            due_date: dueDate,
          });
        } else if (mode === "edit" && itemId) {
          await updateChecklistItem(itemId, {
            // Only send category in the patch when it actually changed —
            // keeps the server-side order_index recompute scoped to true
            // moves between phases.
            ...(categoryDraft !== category ? { category: categoryDraft } : {}),
            title: trimmed,
            description: descPayload,
            due_date: dueDate,
          });
        }
        handleOpenChange(false);
      } catch (err) {
        setErrorMsg(
          err instanceof Error ? err.message : "Failed to save task.",
        );
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {mode === "create" ? "Add task" : "Edit task"}
          </DialogTitle>
          <DialogDescription>
            {mode === "create"
              ? "Add a custom task to this phase."
              : "Update the task details. You can move it to another phase if it fits better there."}
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-3 py-1">
          {/* Category — editable in edit mode (the user can move a task
              between phases), static chip in create mode (the user already
              picked the phase via that group's "+ ADD TASK"). */}
          <div className="flex flex-col gap-1.5">
            <label
              htmlFor={mode === "edit" ? "checklist-task-category" : undefined}
              className="label-cap text-[10px] text-muted-foreground"
            >
              CATEGORY
            </label>
            {mode === "edit" ? (
              <select
                id="checklist-task-category"
                value={categoryDraft}
                onChange={(e) =>
                  setCategoryDraft(e.target.value as ChecklistCategory)
                }
                className="h-8 w-fit min-w-40 rounded-[var(--radius-sm)] border border-border bg-background/40 px-2 text-xs text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
              >
                {SELECTABLE_CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {CATEGORY_LABELS[c]}
                  </option>
                ))}
              </select>
            ) : (
              <span className="label-cap inline-flex w-fit items-center rounded-[var(--radius-sm)] border border-border bg-background/40 px-2.5 py-1 text-[10px] tracking-wider text-foreground">
                {CATEGORY_LABELS[category]}
              </span>
            )}
          </div>

          {/* Title */}
          <div className="flex flex-col gap-1.5">
            <label
              htmlFor="checklist-task-title"
              className="label-cap text-[10px] text-muted-foreground"
            >
              TITLE
            </label>
            <Input
              id="checklist-task-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Schedule mover quotes"
              className="h-8 text-xs"
              autoFocus
            />
          </div>

          {/* Description */}
          <div className="flex flex-col gap-1.5">
            <label
              htmlFor="checklist-task-description"
              className="label-cap text-[10px] text-muted-foreground"
            >
              DESCRIPTION (OPTIONAL)
            </label>
            <textarea
              id="checklist-task-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              placeholder="Notes, links, statutory citations…"
              className="min-h-[5rem] w-full rounded-lg border border-input bg-transparent px-2.5 py-2 text-xs leading-relaxed text-foreground transition-colors outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30"
            />
          </div>

          {/* Due date */}
          <div className="flex flex-col gap-1.5">
            <span className="label-cap text-[10px] text-muted-foreground">
              DUE DATE (OPTIONAL)
            </span>
            <Popover open={calOpen} onOpenChange={setCalOpen}>
              <PopoverTrigger asChild>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className={cn(
                    "mono-num h-8 w-full justify-between text-xs font-normal",
                    !dueDate && "text-muted-foreground",
                  )}
                >
                  <span>{dueDate ?? "— no due date"}</span>
                  <span className="label-cap inline-flex items-center gap-1.5 text-[9px] text-muted-foreground">
                    {dueDate ? formatTriggerDate(dueDate) : ""}
                    <CalendarIcon className="size-3" strokeWidth={1.75} />
                  </span>
                </Button>
              </PopoverTrigger>
              <PopoverContent align="start" className="w-auto p-0">
                <Calendar
                  mode="single"
                  selected={dueDate ? isoToDate(dueDate) : undefined}
                  defaultMonth={dueDate ? isoToDate(dueDate) : new Date()}
                  onSelect={(d) => {
                    if (!d) return;
                    setDueDate(dateToIso(d));
                    setCalOpen(false);
                  }}
                />
                <div className="flex justify-end border-t border-border px-2 py-1.5">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setDueDate(null);
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

          {errorMsg && (
            <p
              role="alert"
              className="rounded-[var(--radius-sm)] border border-[oklch(var(--danger-raw)/0.3)] bg-[oklch(var(--danger-raw)/0.1)] px-3 py-2 text-xs text-[var(--danger)]"
            >
              {errorMsg}
            </p>
          )}
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => handleOpenChange(false)}
            disabled={isPending}
          >
            Cancel
          </Button>
          <Button
            type="button"
            onClick={onSubmit}
            disabled={isPending}
            className="bg-[var(--brand)] text-[var(--brand-foreground)] hover:bg-[oklch(var(--brand-raw)/0.9)]"
          >
            {isPending
              ? "Saving…"
              : mode === "create"
                ? "Add task"
                : "Save changes"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
