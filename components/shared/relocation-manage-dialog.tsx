"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  createRelocation,
  updateRelocation,
  deleteRelocation,
} from "@/app/relocations/actions";
import type { RelocationOption } from "@/lib/data/relocation-db";

export interface CityChoice {
  slug: string;
  displayName: string;
}

type Mode =
  | { kind: "create" }
  | { kind: "edit"; relocation: RelocationOption };

export function RelocationManageDialog({
  open,
  onOpenChange,
  mode,
  cities,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode: Mode;
  cities: CityChoice[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [label, setLabel] = useState("");
  const [originSlug, setOriginSlug] = useState("");
  const [destinationSlug, setDestinationSlug] = useState("");
  const [moveDate, setMoveDate] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  const isEdit = mode.kind === "edit";

  // Reset the form whenever the dialog opens (or the edited row changes).
  useEffect(() => {
    if (!open) return;
    setError(null);
    setConfirmingDelete(false);
    if (mode.kind === "edit") {
      setLabel(mode.relocation.label);
      setOriginSlug(mode.relocation.originSlug);
      setDestinationSlug(mode.relocation.destinationSlug);
      setMoveDate(mode.relocation.moveDate ?? "");
    } else {
      setLabel("");
      setOriginSlug("");
      setDestinationSlug("");
      setMoveDate("");
    }
  }, [open, mode]);

  function submit() {
    setError(null);
    const input = {
      label,
      origin_slug: originSlug,
      destination_slug: destinationSlug,
      move_date: moveDate === "" ? null : moveDate,
    };
    startTransition(async () => {
      const res = isEdit
        ? await updateRelocation((mode as { relocation: RelocationOption }).relocation.id, input)
        : await createRelocation(input);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      router.refresh();
      onOpenChange(false);
    });
  }

  function remove() {
    if (!isEdit) return;
    if (!confirmingDelete) {
      setConfirmingDelete(true);
      return;
    }
    setError(null);
    startTransition(async () => {
      const res = await deleteRelocation(
        (mode as { relocation: RelocationOption }).relocation.id,
      );
      if (!res.ok) {
        setError(res.error);
        setConfirmingDelete(false);
        return;
      }
      router.refresh();
      onOpenChange(false);
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {isEdit ? "Edit relocation" : "New relocation"}
          </DialogTitle>
          <DialogDescription>
            Compare any two cities. Pick where you&apos;re coming from and where
            you&apos;re headed — both can be swapped.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 py-2">
          <Field label="Name">
            <input
              type="text"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="Sacramento what-if"
              className={inputCls}
            />
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="From">
              <CitySelect
                value={originSlug}
                onChange={setOriginSlug}
                cities={cities}
                placeholder="Origin"
              />
            </Field>
            <Field label="To">
              <CitySelect
                value={destinationSlug}
                onChange={setDestinationSlug}
                cities={cities}
                placeholder="Destination"
              />
            </Field>
          </div>

          <Field label="Move date (optional)">
            <input
              type="date"
              value={moveDate}
              onChange={(e) => setMoveDate(e.target.value)}
              className={inputCls}
            />
          </Field>

          {error && (
            <p
              role="alert"
              className="rounded-[var(--radius-sm)] border border-[var(--danger)]/40 bg-[var(--danger)]/10 px-3 py-2 text-xs text-[var(--danger)]"
            >
              {error}
            </p>
          )}
        </div>

        <DialogFooter className="gap-2 sm:justify-between">
          {isEdit ? (
            <button
              type="button"
              onClick={remove}
              disabled={pending}
              className="label-cap text-[10px] text-muted-foreground transition-colors hover:text-[var(--danger)] disabled:opacity-50"
            >
              {confirmingDelete ? "Confirm delete" : "Delete"}
            </button>
          ) : (
            <span />
          )}
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => onOpenChange(false)}
              className="rounded-[var(--radius-md)] border border-border px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={submit}
              disabled={pending}
              className="rounded-[var(--radius-md)] border border-border bg-card px-3 py-1.5 text-xs font-medium text-foreground hover:bg-accent disabled:opacity-50"
            >
              {pending ? "Saving…" : isEdit ? "Save changes" : "Create"}
            </button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

const inputCls =
  "h-9 w-full rounded-[var(--radius-sm)] border border-border bg-background/40 px-2.5 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="grid gap-1.5">
      <span className="label-cap text-[10px] text-muted-foreground">
        {label}
      </span>
      {children}
    </label>
  );
}

function CitySelect({
  value,
  onChange,
  cities,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  cities: CityChoice[];
  placeholder: string;
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className={inputCls}
    >
      <option value="" disabled>
        {placeholder}
      </option>
      {cities.map((c) => (
        <option key={c.slug} value={c.slug}>
          {c.displayName}
        </option>
      ))}
    </select>
  );
}
