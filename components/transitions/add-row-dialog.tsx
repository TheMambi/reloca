"use client";

import { useState, useTransition } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  createUtilityTransition,
  createAddressTarget,
} from "@/app/transitions/actions";
import { UTILITY_CATALOG } from "./utility-config";
import { ADDRESS_CATALOG } from "./address-config";
import type { UtilityTransition, AddressChangeTarget } from "@/schemas/transitions";

type Props =
  | { scope: "utility"; rows: UtilityTransition[] }
  | { scope: "address" };

export function AddRowDialog(props: Props) {
  return props.scope === "utility" ? (
    <UtilityCatalog rows={props.rows} />
  ) : (
    <AddressCatalog />
  );
}

// === Utility ============================================================

function UtilityCatalog({ rows }: { rows: UtilityTransition[] }) {
  const [pendingKind, setPendingKind] = useState<UtilityTransition["kind"] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [customOpen, setCustomOpen] = useState(false);

  // Default side: 'origin' if no origin row exists for this kind, else 'destination'.
  function pickSide(kind: UtilityTransition["kind"]): UtilityTransition["side"] {
    const hasOrigin = rows.some((r) => r.kind === kind && r.side === "origin");
    return hasOrigin ? "destination" : "origin";
  }

  function addStandard(kind: UtilityTransition["kind"]) {
    if (kind === "custom") {
      setCustomOpen(true);
      return;
    }
    setError(null);
    setPendingKind(kind);
    startTransition(async () => {
      const result = await createUtilityTransition(kind, pickSide(kind));
      if (!result.ok) setError(result.error);
      setPendingKind(null);
    });
  }

  return (
    <div>
      <p className="label-cap mb-2 text-[10px] tracking-wider text-muted-foreground">
        Add a utility
      </p>
      <div className="flex flex-wrap gap-1.5">
        {UTILITY_CATALOG.map((c) => (
          <button
            key={c.kind}
            type="button"
            onClick={() => addStandard(c.kind)}
            disabled={isPending && pendingKind === c.kind}
            className="inline-flex items-center gap-1.5 rounded-[var(--radius-sm)] border border-border bg-background/40 px-2.5 py-1.5 text-xs text-foreground transition-colors hover:border-foreground/40 hover:bg-background/70 disabled:opacity-60"
          >
            <span aria-hidden="true">{c.icon}</span>
            <span>+ {c.label}</span>
          </button>
        ))}
      </div>
      {error ? (
        <p
          role="alert"
          className="mt-2 rounded-[var(--radius-sm)] border border-[oklch(var(--danger-raw)/0.3)] bg-[oklch(var(--danger-raw)/0.1)] px-2 py-1.5 text-[11px] text-[var(--danger)]"
        >
          {error}
        </p>
      ) : null}
      <CustomUtilityDialog
        open={customOpen}
        onOpenChange={setCustomOpen}
        rows={rows}
        onError={setError}
      />
    </div>
  );
}

function CustomUtilityDialog({
  open,
  onOpenChange,
  onError,
}: {
  open: boolean;
  onOpenChange: (next: boolean) => void;
  rows: UtilityTransition[];
  onError: (msg: string | null) => void;
}) {
  const [label, setLabel] = useState("");
  const [side, setSide] = useState<UtilityTransition["side"]>("origin");
  const [isPending, startTransition] = useTransition();

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const trimmed = label.trim();
    if (!trimmed) return;
    onError(null);
    startTransition(async () => {
      const result = await createUtilityTransition("custom", side, trimmed);
      if (!result.ok) {
        onError(result.error);
        return;
      }
      setLabel("");
      setSide("origin");
      onOpenChange(false);
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Add a custom utility</DialogTitle>
          <DialogDescription>
            Anything not in the standard list — e.g. solar lease, HOA, security
            monitoring.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="flex flex-col gap-1.5">
            <label
              htmlFor="custom-utility-label"
              className="label-cap text-[10px] text-muted-foreground"
            >
              LABEL
            </label>
            <Input
              id="custom-utility-label"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="e.g. Solar lease"
              autoFocus
              className="h-9 text-sm"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <span className="label-cap text-[10px] text-muted-foreground">
              SIDE
            </span>
            <div className="flex gap-2">
              {(["origin", "destination"] as const).map((s) => (
                <label
                  key={s}
                  className="inline-flex items-center gap-2 rounded-[var(--radius-sm)] border border-border bg-background/40 px-3 py-1.5 text-xs cursor-pointer"
                >
                  <input
                    type="radio"
                    name="side"
                    value={s}
                    checked={side === s}
                    onChange={() => setSide(s)}
                    className="accent-[var(--brand-secondary)]"
                  />
                  <span>{s === "origin" ? "Old home (shut off)" : "New home (turn on)"}</span>
                </label>
              ))}
            </div>
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={isPending}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={isPending || label.trim() === ""}>
              {isPending ? "Adding…" : "Add"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// === Address ============================================================

function AddressCatalog() {
  const [openKind, setOpenKind] = useState<AddressChangeTarget["kind"] | null>(null);

  return (
    <div>
      <p className="label-cap mb-2 text-[10px] tracking-wider text-muted-foreground">
        Add an address update
      </p>
      <div className="flex flex-wrap gap-1.5">
        {ADDRESS_CATALOG.map((c) => (
          <button
            key={c.kind}
            type="button"
            onClick={() => setOpenKind(c.kind)}
            className="inline-flex items-center gap-1.5 rounded-[var(--radius-sm)] border border-border bg-background/40 px-2.5 py-1.5 text-xs text-foreground transition-colors hover:border-foreground/40 hover:bg-background/70"
          >
            <span aria-hidden="true">{c.icon}</span>
            <span>+ {c.label}</span>
          </button>
        ))}
      </div>
      <AddressNameDialog
        kind={openKind}
        onOpenChange={(open) => {
          if (!open) setOpenKind(null);
        }}
      />
    </div>
  );
}

function AddressNameDialog({
  kind,
  onOpenChange,
}: {
  kind: AddressChangeTarget["kind"] | null;
  onOpenChange: (open: boolean) => void;
}) {
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const open = kind !== null;
  const friendlyKind = kind
    ? ADDRESS_CATALOG.find((c) => c.kind === kind)?.label ?? "Other"
    : "";
  const placeholder = kind ? namePlaceholderFor(kind) : "";

  function handleClose(next: boolean) {
    if (!next) {
      setName("");
      setError(null);
    }
    onOpenChange(next);
  }

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!kind) return;
    const trimmed = name.trim();
    if (!trimmed) {
      setError("Name is required.");
      return;
    }
    setError(null);
    startTransition(async () => {
      const result = await createAddressTarget(kind, trimmed);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      handleClose(false);
    });
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Add {friendlyKind.toLowerCase()}</DialogTitle>
          <DialogDescription>
            Give this update a name so you can recognize it later.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="flex flex-col gap-1.5">
            <label
              htmlFor="address-target-name"
              className="label-cap text-[10px] text-muted-foreground"
            >
              NAME
            </label>
            <Input
              id="address-target-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={placeholder}
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
              onClick={() => handleClose(false)}
              disabled={isPending}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={isPending || name.trim() === ""}>
              {isPending ? "Adding…" : "Add"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function namePlaceholderFor(kind: AddressChangeTarget["kind"]): string {
  const map: Record<AddressChangeTarget["kind"], string> = {
    usps: "USPS mail forward",
    bank: "Example Bank",
    employer: "Acme Corp",
    dmv: "DMV (new state)",
    voter_reg: "Voter registration (new city)",
    auto_insurance: "Example Auto Insurance",
    health_insurance: "Example Health Plan",
    subscription: "Streaming service",
    custom: "What's this for?",
  };
  return map[kind];
}
