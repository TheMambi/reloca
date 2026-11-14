"use client";

import { useState, useTransition } from "react";
import { Pencil, CalendarIcon } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Calendar } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  updateUtilityTransition,
  updateAddressTarget,
} from "@/app/transitions/actions";
import type {
  UtilityTransition,
  AddressChangeTarget,
} from "@/schemas/transitions";
import { cn } from "@/lib/utils";
import { isoToPickerDate, pickerDateToIso } from "@/lib/dates";

function strOrNull(s: string): string | null {
  const t = s.trim();
  return t === "" ? null : t;
}

type Props =
  | { scope: "utility"; row: UtilityTransition }
  | { scope: "address"; row: AddressChangeTarget };

export function RowEditDialog(props: Props) {
  const [open, setOpen] = useState(false);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <button
          type="button"
          aria-label="Edit row"
          className="grid size-7 place-items-center rounded-[var(--radius-sm)] text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        >
          <Pencil className="size-3.5" strokeWidth={1.75} />
        </button>
      </DialogTrigger>
      <DialogContent className="max-h-[92svh] overflow-y-auto sm:max-w-md">
        {props.scope === "utility" ? (
          <UtilityForm row={props.row} onClose={() => setOpen(false)} />
        ) : (
          <AddressForm row={props.row} onClose={() => setOpen(false)} />
        )}
      </DialogContent>
    </Dialog>
  );
}

// === Utility ============================================================

const UTILITY_STATUSES: { value: UtilityTransition["status"]; label: string }[] = [
  { value: "needs_action", label: "Needs action" },
  { value: "scheduled",    label: "Scheduled" },
  { value: "in_progress",  label: "In progress" },
  { value: "confirmed",    label: "Confirmed" },
  { value: "skipped",      label: "Skipped" },
];

function UtilityForm({
  row,
  onClose,
}: {
  row: UtilityTransition;
  onClose: () => void;
}) {
  const [provider, setProvider] = useState(row.provider ?? "");
  const [accountNumber, setAccountNumber] = useState(row.account_number ?? "");
  const [loginUrl, setLoginUrl] = useState(row.login_url ?? "");
  const [phone, setPhone] = useState(row.phone ?? "");
  const [notes, setNotes] = useState(row.notes ?? "");
  const [scheduledDate, setScheduledDate] = useState<string | null>(row.scheduled_date);
  const [calOpen, setCalOpen] = useState(false);
  const [status, setStatus] = useState<UtilityTransition["status"]>(row.status);
  const [customLabel, setCustomLabel] = useState(row.custom_label ?? "");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const result = await updateUtilityTransition(row.id, {
        provider: strOrNull(provider),
        account_number: strOrNull(accountNumber),
        login_url: strOrNull(loginUrl),
        phone: strOrNull(phone),
        notes: strOrNull(notes),
        scheduled_date: scheduledDate,
        status,
        custom_label: row.kind === "custom" ? strOrNull(customLabel) : row.custom_label,
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      onClose();
    });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <DialogHeader>
        <DialogTitle>Edit utility</DialogTitle>
        <DialogDescription>
          Update the company details, the date it switches, and where this
          stands.
        </DialogDescription>
      </DialogHeader>

      {row.kind === "custom" ? (
        <FormField label="Label" htmlId="ut-label">
          <Input
            id="ut-label"
            value={customLabel}
            onChange={(e) => setCustomLabel(e.target.value)}
            className="h-9 text-sm"
          />
        </FormField>
      ) : null}

      <FormField label="Provider" htmlId="ut-provider">
        <Input
          id="ut-provider"
          value={provider}
          onChange={(e) => setProvider(e.target.value)}
          placeholder="City Power & Light"
          className="h-9 text-sm"
        />
      </FormField>

      <div className="grid grid-cols-2 gap-3">
        <FormField label="Account #" htmlId="ut-acct">
          <Input
            id="ut-acct"
            value={accountNumber}
            onChange={(e) => setAccountNumber(e.target.value)}
            className="h-9 text-sm mono-num"
          />
        </FormField>
        <FormField label="Phone" htmlId="ut-phone">
          <Input
            id="ut-phone"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            className="h-9 text-sm mono-num"
          />
        </FormField>
      </div>

      <FormField label="Login URL" htmlId="ut-url">
        <Input
          id="ut-url"
          type="url"
          value={loginUrl}
          onChange={(e) => setLoginUrl(e.target.value)}
          placeholder="https://"
          className="h-9 text-sm"
        />
      </FormField>

      <DateField
        label="Scheduled date"
        value={scheduledDate}
        onChange={setScheduledDate}
        open={calOpen}
        onOpenChange={setCalOpen}
      />

      <FormField label="Status">
        <RadioGroup
          name="ut-status"
          value={status}
          onChange={(v) => setStatus(v as UtilityTransition["status"])}
          options={UTILITY_STATUSES}
        />
      </FormField>

      <FormField label="Notes" htmlId="ut-notes">
        <textarea
          id="ut-notes"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={3}
          className="w-full resize-none rounded-[var(--radius-sm)] border border-input bg-transparent px-2.5 py-2 text-xs leading-relaxed text-foreground outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
        />
      </FormField>

      {error ? (
        <p
          role="alert"
          className="rounded-[var(--radius-sm)] border border-[oklch(var(--danger-raw)/0.3)] bg-[oklch(var(--danger-raw)/0.1)] px-2 py-1.5 text-[11px] text-[var(--danger)]"
        >
          {error}
        </p>
      ) : null}

      <DialogFooter>
        <Button type="button" variant="outline" onClick={onClose} disabled={isPending}>
          Cancel
        </Button>
        <Button type="submit" disabled={isPending}>
          {isPending ? "Saving…" : "Save changes"}
        </Button>
      </DialogFooter>
    </form>
  );
}

// === Address ============================================================

const ADDRESS_STATUSES: { value: AddressChangeTarget["status"]; label: string }[] = [
  { value: "needs_action", label: "Needs action" },
  { value: "submitted",    label: "Submitted" },
  { value: "confirmed",    label: "Confirmed" },
  { value: "skipped",      label: "Skipped" },
];

const ADDRESS_CHANNELS: { value: NonNullable<AddressChangeTarget["channel"]>; label: string }[] = [
  { value: "online",    label: "Online" },
  { value: "phone",     label: "Phone" },
  { value: "in_person", label: "In person" },
  { value: "mail",      label: "Mail" },
];

function AddressForm({
  row,
  onClose,
}: {
  row: AddressChangeTarget;
  onClose: () => void;
}) {
  const [name, setName] = useState(row.name);
  const [dueDate, setDueDate] = useState<string | null>(row.due_date);
  const [calOpen, setCalOpen] = useState(false);
  const [channel, setChannel] = useState<AddressChangeTarget["channel"]>(row.channel);
  const [referenceNumber, setReferenceNumber] = useState(row.reference_number ?? "");
  const [status, setStatus] = useState<AddressChangeTarget["status"]>(row.status);
  const [notes, setNotes] = useState(row.notes ?? "");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) {
      setError("Name is required.");
      return;
    }
    setError(null);
    startTransition(async () => {
      const result = await updateAddressTarget(row.id, {
        name: trimmed,
        due_date: dueDate,
        channel,
        reference_number: strOrNull(referenceNumber),
        status,
        notes: strOrNull(notes),
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      onClose();
    });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <DialogHeader>
        <DialogTitle>Edit address update</DialogTitle>
        <DialogDescription>
          Update who needs the new address, the deadline, and where this stands.
        </DialogDescription>
      </DialogHeader>

      <FormField label="Name" htmlId="ad-name">
        <Input
          id="ad-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
          className="h-9 text-sm"
        />
      </FormField>

      <DateField
        label="Due date"
        value={dueDate}
        onChange={setDueDate}
        open={calOpen}
        onOpenChange={setCalOpen}
      />

      <FormField label="How you'll do it">
        <RadioGroup
          name="ad-channel"
          value={channel ?? ""}
          onChange={(v) =>
            setChannel(
              v === "" ? null : (v as NonNullable<AddressChangeTarget["channel"]>),
            )
          }
          options={[{ value: "", label: "—" }, ...ADDRESS_CHANNELS]}
        />
      </FormField>

      <FormField label="Reference / confirmation number" htmlId="ad-ref">
        <Input
          id="ad-ref"
          value={referenceNumber}
          onChange={(e) => setReferenceNumber(e.target.value)}
          className="h-9 text-sm mono-num"
        />
      </FormField>

      <FormField label="Status">
        <RadioGroup
          name="ad-status"
          value={status}
          onChange={(v) => setStatus(v as AddressChangeTarget["status"])}
          options={ADDRESS_STATUSES}
        />
      </FormField>

      <FormField label="Notes" htmlId="ad-notes">
        <textarea
          id="ad-notes"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={3}
          className="w-full resize-none rounded-[var(--radius-sm)] border border-input bg-transparent px-2.5 py-2 text-xs leading-relaxed text-foreground outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
        />
      </FormField>

      {error ? (
        <p
          role="alert"
          className="rounded-[var(--radius-sm)] border border-[oklch(var(--danger-raw)/0.3)] bg-[oklch(var(--danger-raw)/0.1)] px-2 py-1.5 text-[11px] text-[var(--danger)]"
        >
          {error}
        </p>
      ) : null}

      <DialogFooter>
        <Button type="button" variant="outline" onClick={onClose} disabled={isPending}>
          Cancel
        </Button>
        <Button type="submit" disabled={isPending}>
          {isPending ? "Saving…" : "Save changes"}
        </Button>
      </DialogFooter>
    </form>
  );
}

// === Shared sub-components =============================================

function FormField({
  label,
  htmlId,
  children,
}: {
  label: string;
  htmlId?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      {htmlId ? (
        <label htmlFor={htmlId} className="label-cap text-[10px] text-muted-foreground">
          {label.toUpperCase()}
        </label>
      ) : (
        <span className="label-cap text-[10px] text-muted-foreground">
          {label.toUpperCase()}
        </span>
      )}
      {children}
    </div>
  );
}

function RadioGroup<T extends string>({
  name,
  value,
  onChange,
  options,
}: {
  name: string;
  value: T;
  onChange: (next: T) => void;
  options: { value: T; label: string }[];
}) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {options.map((opt) => {
        const selected = value === opt.value;
        return (
          <label
            key={opt.value}
            className={cn(
              "inline-flex cursor-pointer items-center gap-2 rounded-[var(--radius-sm)] border px-2.5 py-1 text-xs transition-colors",
              selected
                ? "border-foreground/40 bg-background/70 text-foreground"
                : "border-border bg-background/40 text-muted-foreground hover:text-foreground",
            )}
          >
            <input
              type="radio"
              name={name}
              value={opt.value}
              checked={selected}
              onChange={() => onChange(opt.value)}
              className="sr-only"
            />
            <span>{opt.label}</span>
          </label>
        );
      })}
    </div>
  );
}

function DateField({
  label,
  value,
  onChange,
  open,
  onOpenChange,
}: {
  label: string;
  value: string | null;
  onChange: (next: string | null) => void;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <FormField label={label}>
      <Popover open={open} onOpenChange={onOpenChange}>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className={cn(
              "mono-num h-9 w-full justify-between text-xs font-normal",
              !value && "text-muted-foreground",
            )}
          >
            <span>{value ?? "— no date"}</span>
            <CalendarIcon className="size-3.5" strokeWidth={1.75} />
          </Button>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-auto p-0">
          <Calendar
            mode="single"
            selected={value ? isoToPickerDate(value) : undefined}
            defaultMonth={value ? isoToPickerDate(value) : new Date()}
            onSelect={(d) => {
              if (!d) return;
              onChange(pickerDateToIso(d));
              onOpenChange(false);
            }}
          />
          <div className="flex justify-end border-t border-border px-2 py-1.5">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => {
                onChange(null);
                onOpenChange(false);
              }}
              className="text-xs"
            >
              Clear
            </Button>
          </div>
        </PopoverContent>
      </Popover>
    </FormField>
  );
}
