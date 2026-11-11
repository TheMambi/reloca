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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  addInsurancePolicy,
  updateInsurancePolicy,
  deleteInsurancePolicy,
} from "@/app/lease/actions";
import type { InsurancePolicy, InsuranceScopeEnum } from "@/schemas/lease";
import type { z } from "zod";

type Scope = z.infer<typeof InsuranceScopeEnum>;

interface InsurancePolicyFormProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** When provided, the dialog is in edit mode for this policy. */
  policy?: InsurancePolicy | null;
  /** Initial scope when adding. Ignored when editing. */
  initialScope?: Scope;
  /** Pre-fill `property_label` when adding. */
  defaultPropertyLabel?: string;
}

// UTC throughout — same convention as the rest of the lease module so date-only
// ISO strings stay stable across TZs.
function isoToDate(iso: string): Date {
  return new Date(iso + "T00:00:00.000Z");
}

function dateToIso(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

export function InsurancePolicyForm({
  open,
  onOpenChange,
  policy,
  initialScope = "origin",
  defaultPropertyLabel = "",
}: InsurancePolicyFormProps) {
  const editing = Boolean(policy);

  // ── form state ──────────────────────────────────────────────────────────
  const [scope, setScope] = useState<Scope>(policy?.scope ?? initialScope);
  const [propertyLabel, setPropertyLabel] = useState<string>(
    policy?.property_label ?? defaultPropertyLabel,
  );
  const [carrier, setCarrier] = useState<string>(policy?.carrier ?? "");
  const [policyNumber, setPolicyNumber] = useState<string>(
    policy?.policy_number ?? "",
  );
  const [liability, setLiability] = useState<string>(
    String(policy?.liability_amount ?? 100000),
  );
  const [property, setProperty] = useState<string>(
    String(policy?.personal_property_amount ?? 5000),
  );
  const [monthly, setMonthly] = useState<string>(
    policy?.monthly_cost != null ? String(policy.monthly_cost) : "",
  );
  const [effectiveFrom, setEffectiveFrom] = useState<string>(
    policy?.effective_from ?? todayIso(),
  );
  const [effectiveTo, setEffectiveTo] = useState<string | null>(
    policy?.effective_to ?? null,
  );
  const [interestedListed, setInterestedListed] = useState<boolean>(
    policy?.interested_party_listed ?? false,
  );
  const [interestedName, setInterestedName] = useState<string>(
    policy?.interested_party_name ?? "",
  );
  const [documentUrl, setDocumentUrl] = useState<string>(
    policy?.document_url ?? "",
  );

  const [fromOpen, setFromOpen] = useState(false);
  const [toOpen, setToOpen] = useState(false);
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);

  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isSubmitPending, startSubmit] = useTransition();
  const [isDeletePending, startDelete] = useTransition();

  // ── handlers ────────────────────────────────────────────────────────────
  function resetState() {
    // Reset to defaults so the next open has clean state when this dialog
    // re-opens for "+ Add policy" after an edit.
    setScope(policy?.scope ?? initialScope);
    setPropertyLabel(policy?.property_label ?? defaultPropertyLabel);
    setCarrier(policy?.carrier ?? "");
    setPolicyNumber(policy?.policy_number ?? "");
    setLiability(String(policy?.liability_amount ?? 100000));
    setProperty(String(policy?.personal_property_amount ?? 5000));
    setMonthly(policy?.monthly_cost != null ? String(policy.monthly_cost) : "");
    setEffectiveFrom(policy?.effective_from ?? todayIso());
    setEffectiveTo(policy?.effective_to ?? null);
    setInterestedListed(policy?.interested_party_listed ?? false);
    setInterestedName(policy?.interested_party_name ?? "");
    setDocumentUrl(policy?.document_url ?? "");
    setErrorMsg(null);
  }

  function handleOpenChange(next: boolean) {
    if (!next) resetState();
    onOpenChange(next);
  }

  function onSubmit() {
    setErrorMsg(null);

    const liabilityNum = Number(liability);
    const propertyNum = Number(property);
    const monthlyNum = monthly.trim() === "" ? null : Number(monthly);

    if (Number.isNaN(liabilityNum) || liabilityNum < 0) {
      setErrorMsg("Liability must be a non-negative number.");
      return;
    }
    if (Number.isNaN(propertyNum) || propertyNum < 0) {
      setErrorMsg("Personal property must be a non-negative number.");
      return;
    }
    if (monthlyNum !== null && (Number.isNaN(monthlyNum) || monthlyNum < 0)) {
      setErrorMsg("Monthly cost must be a non-negative number.");
      return;
    }
    if (!propertyLabel.trim()) {
      setErrorMsg("Property label is required.");
      return;
    }
    if (effectiveTo && effectiveTo <= effectiveFrom) {
      setErrorMsg("Effective-to must be after effective-from.");
      return;
    }

    const payload = {
      scope,
      property_label: propertyLabel.trim(),
      carrier: carrier.trim() === "" ? null : carrier.trim(),
      policy_number: policyNumber.trim() === "" ? null : policyNumber.trim(),
      liability_amount: liabilityNum,
      personal_property_amount: propertyNum,
      monthly_cost: monthlyNum,
      effective_from: effectiveFrom,
      effective_to: effectiveTo,
      interested_party_listed: interestedListed,
      interested_party_name:
        interestedListed && interestedName.trim() !== ""
          ? interestedName.trim()
          : null,
      document_url: documentUrl.trim() === "" ? null : documentUrl.trim(),
    };

    startSubmit(async () => {
      try {
        if (editing && policy) {
          await updateInsurancePolicy(policy.id, payload);
        } else {
          await addInsurancePolicy(payload);
        }
        handleOpenChange(false);
      } catch (err) {
        setErrorMsg(
          err instanceof Error ? err.message : "Failed to save policy.",
        );
      }
    });
  }

  function onConfirmDelete() {
    if (!policy) return;
    setErrorMsg(null);
    startDelete(async () => {
      try {
        await deleteInsurancePolicy(policy.id);
        setConfirmDeleteOpen(false);
        handleOpenChange(false);
      } catch (err) {
        setErrorMsg(
          err instanceof Error ? err.message : "Failed to delete policy.",
        );
      }
    });
  }

  return (
    <>
      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {editing ? "Edit insurance policy" : "Add insurance policy"}
            </DialogTitle>
            <DialogDescription>
              Track renter&rsquo;s insurance for your current and future home.
              We&rsquo;ll check coverage against the minimums your lease requires.
            </DialogDescription>
          </DialogHeader>

          <div className="flex max-h-[60vh] flex-col gap-3 overflow-y-auto py-1">
            {/* Scope */}
            <Field label="WHICH HOME">
              <Select
                value={scope}
                onValueChange={(v) => setScope(v as Scope)}
                disabled={editing}
              >
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="origin">Current home</SelectItem>
                  <SelectItem value="destination">Future home</SelectItem>
                </SelectContent>
              </Select>
            </Field>

            {/* Property label */}
            <Field label="ADDRESS / NICKNAME">
              <Input
                value={propertyLabel}
                onChange={(e) => setPropertyLabel(e.target.value)}
                placeholder="e.g. 100 Sample St #204"
                className="h-8 text-xs"
              />
            </Field>

            {/* Carrier + policy number */}
            <div className="grid grid-cols-2 gap-3">
              <Field label="INSURER">
                <Input
                  value={carrier}
                  onChange={(e) => setCarrier(e.target.value)}
                  placeholder="Insurer name"
                  className="h-8 text-xs"
                />
              </Field>
              <Field label="POLICY NUMBER">
                <Input
                  value={policyNumber}
                  onChange={(e) => setPolicyNumber(e.target.value)}
                  placeholder="123-XXX-456"
                  className="mono-num h-8 text-xs"
                />
              </Field>
            </div>

            {/* Liability + belongings */}
            <div className="grid grid-cols-2 gap-3">
              <Field label="LIABILITY COVERAGE ($)">
                <Input
                  type="number"
                  inputMode="numeric"
                  value={liability}
                  onChange={(e) => setLiability(e.target.value)}
                  placeholder="100000"
                  className="mono-num h-8 text-xs"
                />
              </Field>
              <Field label="BELONGINGS COVERAGE ($)">
                <Input
                  type="number"
                  inputMode="numeric"
                  value={property}
                  onChange={(e) => setProperty(e.target.value)}
                  placeholder="5000"
                  className="mono-num h-8 text-xs"
                />
              </Field>
            </div>

            {/* Monthly cost */}
            <Field label="MONTHLY PREMIUM ($, OPTIONAL)">
              <Input
                type="number"
                inputMode="decimal"
                value={monthly}
                onChange={(e) => setMonthly(e.target.value)}
                placeholder="0.00"
                className="mono-num h-8 text-xs"
              />
            </Field>

            {/* Effective dates */}
            <div className="grid grid-cols-2 gap-3">
              <Field label="STARTS">
                <Popover open={fromOpen} onOpenChange={setFromOpen}>
                  <PopoverTrigger asChild>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="mono-num h-8 w-full justify-between text-xs"
                    >
                      <span>{effectiveFrom}</span>
                      <CalendarIcon className="size-3" strokeWidth={1.75} />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent align="start" className="w-auto p-0">
                    <Calendar
                      mode="single"
                      selected={isoToDate(effectiveFrom)}
                      defaultMonth={isoToDate(effectiveFrom)}
                      onSelect={(d) => {
                        if (!d) return;
                        setEffectiveFrom(dateToIso(d));
                        setFromOpen(false);
                      }}
                    />
                  </PopoverContent>
                </Popover>
              </Field>
              <Field label="ENDS">
                <Popover open={toOpen} onOpenChange={setToOpen}>
                  <PopoverTrigger asChild>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="mono-num h-8 w-full justify-between text-xs"
                    >
                      <span>{effectiveTo ?? "— ongoing"}</span>
                      <CalendarIcon className="size-3" strokeWidth={1.75} />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent align="start" className="w-auto p-0">
                    <Calendar
                      mode="single"
                      selected={
                        effectiveTo ? isoToDate(effectiveTo) : undefined
                      }
                      defaultMonth={
                        effectiveTo
                          ? isoToDate(effectiveTo)
                          : isoToDate(effectiveFrom)
                      }
                      onSelect={(d) => {
                        if (!d) return;
                        setEffectiveTo(dateToIso(d));
                        setToOpen(false);
                      }}
                    />
                    <div className="flex justify-end border-t border-border px-2 py-1.5">
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          setEffectiveTo(null);
                          setToOpen(false);
                        }}
                        className="text-xs"
                      >
                        Clear (ongoing)
                      </Button>
                    </div>
                  </PopoverContent>
                </Popover>
              </Field>
            </div>

            {/* Interested party */}
            <div className="flex flex-col gap-2 rounded-[var(--radius-sm)] border border-border/60 bg-background/40 px-3 py-2.5">
              <label className="flex items-center gap-2 text-xs text-foreground">
                <input
                  type="checkbox"
                  checked={interestedListed}
                  onChange={(e) => setInterestedListed(e.target.checked)}
                  className="size-3.5 accent-[var(--brand-secondary)]"
                />
                <span>
                  Landlord listed as &ldquo;interested party&rdquo; on policy
                </span>
              </label>
              {interestedListed && (
                <Field label="LANDLORD CONTACT NAME ON POLICY">
                  <Input
                    value={interestedName}
                    onChange={(e) => setInterestedName(e.target.value)}
                    placeholder="e.g. your property manager"
                    className="h-8 text-xs"
                  />
                </Field>
              )}
            </div>

            {/* Document URL */}
            <Field label="POLICY DOCUMENT LINK (OPTIONAL)">
              <Input
                type="url"
                value={documentUrl}
                onChange={(e) => setDocumentUrl(e.target.value)}
                placeholder="https://…"
                className="h-8 text-xs"
              />
            </Field>

            {errorMsg && (
              <p className="rounded-[var(--radius-sm)] border border-[oklch(var(--danger-raw)/0.3)] bg-[oklch(var(--danger-raw)/0.1)] px-3 py-2 text-xs text-[var(--danger)]">
                {errorMsg}
              </p>
            )}
          </div>

          <DialogFooter>
            {editing && (
              <Button
                type="button"
                variant="outline"
                onClick={() => setConfirmDeleteOpen(true)}
                disabled={isSubmitPending || isDeletePending}
                className="border-[oklch(var(--danger-raw)/0.4)] text-[var(--danger)] hover:bg-[oklch(var(--danger-raw)/0.1)] sm:mr-auto"
              >
                Delete
              </Button>
            )}
            <Button
              type="button"
              variant="outline"
              onClick={() => handleOpenChange(false)}
              disabled={isSubmitPending || isDeletePending}
            >
              Cancel
            </Button>
            <Button
              type="button"
              onClick={onSubmit}
              disabled={isSubmitPending || isDeletePending}
              className="bg-[var(--brand)] text-[var(--brand-foreground)] hover:bg-[oklch(var(--brand-raw)/0.9)]"
            >
              {isSubmitPending
                ? "Saving…"
                : editing
                  ? "Save changes"
                  : "Add policy"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirmation */}
      <Dialog open={confirmDeleteOpen} onOpenChange={setConfirmDeleteOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete this policy?</DialogTitle>
            <DialogDescription>
              This removes the row from{" "}
              <span className="mono-num text-foreground">
                insurance_policies
              </span>
              . You can re-add it later.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setConfirmDeleteOpen(false)}
              disabled={isDeletePending}
            >
              Cancel
            </Button>
            <Button
              type="button"
              onClick={onConfirmDelete}
              disabled={isDeletePending}
              className="bg-[var(--danger)] text-white hover:bg-[oklch(var(--danger-raw)/0.9)]"
            >
              {isDeletePending ? "Deleting…" : "Confirm delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  // Wrap children in a native <label> so the input inside is implicitly
  // associated with the visible label text — screen readers announce it
  // on focus without manual htmlFor / id wiring.
  return (
    <label className="flex flex-col gap-1.5">
      <span className="label-cap text-[10px] text-muted-foreground">
        {label}
      </span>
      {children}
    </label>
  );
}

interface InsurancePolicyDialogTriggerProps {
  /** Button label (defaults to "+ Add policy"). */
  label?: string;
  /** When provided, the trigger opens the form pre-loaded for editing. */
  policy?: InsurancePolicy | null;
  /** Initial scope when adding. Ignored when editing. */
  initialScope?: Scope;
  /** Pre-fill `property_label` when adding. */
  defaultPropertyLabel?: string;
  /**
   * Visual variant. `primary` is the empty-state CTA; `ghost` is the
   * inline edit affordance on the compliance grid.
   */
  variant?: "primary" | "ghost";
}

/**
 * Thin client wrapper so RSC parents can mount the form without becoming
 * client components themselves. Mirrors the `<TargetMoveOutEditor>` pattern.
 */
export function InsurancePolicyDialogTrigger({
  label = "+ Add policy",
  policy = null,
  initialScope = "origin",
  defaultPropertyLabel,
  variant = "primary",
}: InsurancePolicyDialogTriggerProps) {
  const [open, setOpen] = useState(false);

  const buttonClass =
    variant === "primary"
      ? "label-cap inline-flex items-center gap-2 rounded-[var(--radius-sm)] border border-border bg-card px-3 py-1.5 text-[10px] tracking-wider text-muted-foreground transition-colors hover:bg-popover hover:text-foreground"
      : "label-cap inline-flex items-center gap-1 rounded-[var(--radius-sm)] px-2 py-0.5 text-[10px] tracking-wider text-muted-foreground transition-colors hover:bg-popover hover:text-foreground";

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className={buttonClass}>
        {label}
      </button>
      <InsurancePolicyForm
        open={open}
        onOpenChange={setOpen}
        policy={policy}
        initialScope={initialScope}
        defaultPropertyLabel={defaultPropertyLabel}
      />
    </>
  );
}
