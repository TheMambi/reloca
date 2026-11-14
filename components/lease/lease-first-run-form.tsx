"use client";

import { useMemo, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Input } from "@/components/ui/input";
import { createLeaseTerms } from "@/app/lease/actions";
import { settle } from "@/lib/settle-action";
import {
  FIRST_RUN_DEFAULTS,
  UTILITY_OPTIONS,
} from "./lease-first-run-defaults";
import { cn } from "@/lib/utils";
import { isoToPickerDate, pickerDateToIso } from "@/lib/dates";

function formatTriggerDate(iso: string): string {
  if (!iso) return "Pick a date";
  const d = isoToPickerDate(iso);
  return d.toLocaleDateString("en-US", {
    weekday: "long",
    month: "short",
    day: "numeric",
  });
}

// ── form-local resident type (controlled inputs require non-undefined email) ──
type ResidentRow = { name: string; email: string; isPrimary: boolean };

function defaultResidents(): ResidentRow[] {
  return FIRST_RUN_DEFAULTS.residents.map((r) => ({
    name: r.name,
    email: r.email ?? "",
    isPrimary: r.isPrimary,
  }));
}

// ── number input helper: lets the field be empty without coercing to NaN ──
function parseNumber(raw: string): number | null {
  if (raw.trim() === "") return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

export function LeaseFirstRunForm() {
  // ── state ────────────────────────────────────────────────────────────────
  // Identity
  const [propertyName, setPropertyName] = useState(FIRST_RUN_DEFAULTS.property_name);
  const [unitAddress, setUnitAddress] = useState(FIRST_RUN_DEFAULTS.unit_address);
  const [city, setCity] = useState(FIRST_RUN_DEFAULTS.city);
  const [landlordEmail, setLandlordEmail] = useState(FIRST_RUN_DEFAULTS.landlord_email);
  const [landlordDisplayName, setLandlordDisplayName] = useState(
    FIRST_RUN_DEFAULTS.landlord_display_name ?? "",
  );

  // Residents
  const [residents, setResidents] = useState<ResidentRow[]>(defaultResidents);

  // Dates
  const [leaseStartDate, setLeaseStartDate] = useState(FIRST_RUN_DEFAULTS.lease_start_date);
  const [leaseEndDate, setLeaseEndDate] = useState(FIRST_RUN_DEFAULTS.lease_end_date);
  const [noticeDaysRequired, setNoticeDaysRequired] = useState<string>(
    String(FIRST_RUN_DEFAULTS.notice_days_required),
  );
  const [targetMoveOutDate, setTargetMoveOutDate] = useState<string>(
    FIRST_RUN_DEFAULTS.target_move_out_date ?? "",
  );
  const [renewalOfferExpires, setRenewalOfferExpires] = useState<string>(
    FIRST_RUN_DEFAULTS.renewal_offer_expires ?? "",
  );

  // Money
  const [currentMonthlyRent, setCurrentMonthlyRent] = useState<string>(
    String(FIRST_RUN_DEFAULTS.current_monthly_rent),
  );
  const [renewalMonthlyRent, setRenewalMonthlyRent] = useState<string>(
    FIRST_RUN_DEFAULTS.renewal_monthly_rent != null
      ? String(FIRST_RUN_DEFAULTS.renewal_monthly_rent)
      : "",
  );
  const [m2mPremium, setM2mPremium] = useState<string>(
    String(FIRST_RUN_DEFAULTS.m2m_premium),
  );
  const [securityDeposit, setSecurityDeposit] = useState<string>(
    FIRST_RUN_DEFAULTS.security_deposit != null
      ? String(FIRST_RUN_DEFAULTS.security_deposit)
      : "",
  );
  const [petRentMonthly, setPetRentMonthly] = useState<string>(
    String(FIRST_RUN_DEFAULTS.pet_rent_monthly),
  );
  const [parkingMonthly, setParkingMonthly] = useState<string>(
    String(FIRST_RUN_DEFAULTS.parking_monthly),
  );
  const [includedUtilities, setIncludedUtilities] = useState<string[]>(
    [...FIRST_RUN_DEFAULTS.included_utilities],
  );
  const [lateFeeRules, setLateFeeRules] = useState<string>(
    FIRST_RUN_DEFAULTS.late_fee_rules ?? "",
  );

  // Calendar popover open state — keyed by field name.
  const [openCal, setOpenCal] = useState<string | null>(null);

  // ── async submit + errors ────────────────────────────────────────────────
  const [serverError, setServerError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [isPending, startTransition] = useTransition();

  // ── resident row mutations ───────────────────────────────────────────────
  function updateResident(idx: number, patch: Partial<ResidentRow>) {
    setResidents((prev) =>
      prev.map((r, i) => (i === idx ? { ...r, ...patch } : r)),
    );
  }
  function setPrimaryResident(idx: number) {
    setResidents((prev) => prev.map((r, i) => ({ ...r, isPrimary: i === idx })));
  }
  function addResident() {
    setResidents((prev) => [...prev, { name: "", email: "", isPrimary: false }]);
  }
  function removeResident(idx: number) {
    setResidents((prev) => {
      if (prev.length <= 1) return prev;
      const next = prev.filter((_, i) => i !== idx);
      // If we removed the primary, promote row 0 to primary.
      if (!next.some((r) => r.isPrimary)) next[0] = { ...next[0], isPrimary: true };
      return next;
    });
  }

  // ── utility chip toggle ──────────────────────────────────────────────────
  function toggleUtility(u: string) {
    setIncludedUtilities((prev) =>
      prev.includes(u) ? prev.filter((x) => x !== u) : [...prev, u],
    );
  }

  // ── client-side validation ───────────────────────────────────────────────
  function validate(): { ok: true; payload: Parameters<typeof createLeaseTerms>[0] } | { ok: false; errors: Record<string, string> } {
    const errors: Record<string, string> = {};

    if (!propertyName.trim()) errors.property_name = "Required.";
    if (!unitAddress.trim()) errors.unit_address = "Required.";
    if (!city.trim()) errors.city = "Required.";
    if (!landlordEmail.trim()) {
      errors.landlord_email =
        "Required — copy this from your renewal email.";
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(landlordEmail)) {
      errors.landlord_email = "Must be a valid email address.";
    }

    const cleanedResidents = residents
      .map((r) => ({
        name: r.name.trim(),
        email: r.email.trim(),
        isPrimary: r.isPrimary,
      }))
      .filter((r) => r.name.length > 0);
    if (cleanedResidents.length === 0) {
      errors.residents = "At least one resident is required.";
    }
    if (!cleanedResidents.some((r) => r.isPrimary) && cleanedResidents.length > 0) {
      cleanedResidents[0].isPrimary = true;
    }

    if (!leaseStartDate) errors.lease_start_date = "Required.";
    if (!leaseEndDate) errors.lease_end_date = "Required.";
    if (
      leaseStartDate &&
      leaseEndDate &&
      leaseEndDate <= leaseStartDate
    ) {
      errors.lease_end_date = "Lease end must be after lease start.";
    }

    const noticeDaysNum = parseNumber(noticeDaysRequired);
    if (noticeDaysNum == null || noticeDaysNum < 0 || !Number.isInteger(noticeDaysNum)) {
      errors.notice_days_required = "Whole number, 0 or more.";
    }

    const currentRentNum = parseNumber(currentMonthlyRent);
    if (currentRentNum == null || currentRentNum < 0) {
      errors.current_monthly_rent = "Required, 0 or more.";
    }

    const renewalRentNum =
      renewalMonthlyRent.trim() === "" ? null : parseNumber(renewalMonthlyRent);
    if (renewalMonthlyRent.trim() !== "" && (renewalRentNum == null || renewalRentNum < 0)) {
      errors.renewal_monthly_rent = "Number, 0 or more.";
    }

    const m2mNum = parseNumber(m2mPremium);
    if (m2mNum == null || m2mNum < 0) {
      errors.m2m_premium = "Number, 0 or more.";
    }

    const depositNum =
      securityDeposit.trim() === "" ? null : parseNumber(securityDeposit);
    if (securityDeposit.trim() !== "" && (depositNum == null || depositNum < 0)) {
      errors.security_deposit = "Number, 0 or more.";
    }

    const petRentNum = parseNumber(petRentMonthly);
    if (petRentNum == null || petRentNum < 0) {
      errors.pet_rent_monthly = "Number, 0 or more.";
    }
    const parkingNum = parseNumber(parkingMonthly);
    if (parkingNum == null || parkingNum < 0) {
      errors.parking_monthly = "Number, 0 or more.";
    }

    if (Object.keys(errors).length > 0) {
      return { ok: false, errors };
    }

    // All required fields present + valid — non-null assertions are safe here.
    const payload = {
      property_name: propertyName.trim(),
      unit_address: unitAddress.trim(),
      city: city.trim(),
      landlord_email: landlordEmail.trim(),
      landlord_display_name: landlordDisplayName.trim() || null,
      residents: cleanedResidents.map((r) => ({
        name: r.name,
        ...(r.email ? { email: r.email } : {}),
        isPrimary: r.isPrimary,
      })),
      lease_start_date: leaseStartDate,
      lease_end_date: leaseEndDate,
      notice_days_required: noticeDaysNum!,
      target_move_out_date: targetMoveOutDate || null,
      renewal_offer_expires: renewalOfferExpires || null,
      current_monthly_rent: currentRentNum!,
      renewal_monthly_rent: renewalRentNum,
      m2m_premium: m2mNum!,
      security_deposit: depositNum,
      pet_rent_monthly: petRentNum!,
      parking_monthly: parkingNum!,
      included_utilities: includedUtilities,
      late_fee_rules: lateFeeRules.trim() || null,
      decision: FIRST_RUN_DEFAULTS.decision,
    };
    return { ok: true, payload };
  }

  // ── submit ───────────────────────────────────────────────────────────────
  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setServerError(null);
    const result = validate();
    if (!result.ok) {
      setFieldErrors(result.errors);
      return;
    }
    setFieldErrors({});

    startTransition(async () => {
      // On success, revalidatePath("/lease") in the action triggers a
      // server-component re-render and this form unmounts. No nav needed.
      const res = await settle(createLeaseTerms(result.payload));
      if (!res.ok) setServerError(res.error);
    });
  }

  // ── memoized derived UI bits ─────────────────────────────────────────────
  const earliestEndMonth = useMemo(
    () => (leaseEndDate ? isoToPickerDate(leaseEndDate) : new Date()),
    [leaseEndDate],
  );
  const targetMonth = useMemo(
    () => (targetMoveOutDate ? isoToPickerDate(targetMoveOutDate) : earliestEndMonth),
    [targetMoveOutDate, earliestEndMonth],
  );
  const renewalMonth = useMemo(
    () =>
      renewalOfferExpires ? isoToPickerDate(renewalOfferExpires) : earliestEndMonth,
    [renewalOfferExpires, earliestEndMonth],
  );

  // ── render ───────────────────────────────────────────────────────────────
  return (
    <form
      onSubmit={onSubmit}
      className="flex min-h-[calc(100svh-3rem)] flex-col gap-6 p-6"
      noValidate
    >
      <header className="flex flex-col gap-1">
        <span className="label-cap text-[10px] text-muted-foreground">
          LEASE & MOVE-OUT
        </span>
        <h1 className="text-lg font-semibold tracking-[var(--tracking-headline)] text-foreground">
          Tell us about your lease
        </h1>
        <p className="text-xs text-muted-foreground">
          Look over what we&rsquo;ve pre-filled from your renewal letter and
          add anything that&rsquo;s missing.
        </p>
      </header>

      <div className="flex flex-col rounded-[var(--radius-md)] border border-border bg-card">
        {/* ───────────────────────── IDENTITY ─────────────────────────── */}
        <SectionHeader title="IDENTITY" />
        <div className="grid grid-cols-1 gap-4 px-6 py-5 sm:grid-cols-2">
          <Field
            label="Property name"
            error={fieldErrors.property_name}
          >
            <Input
              value={propertyName}
              onChange={(e) => setPropertyName(e.target.value)}
              aria-invalid={Boolean(fieldErrors.property_name)}
              className={cn(fieldErrors.property_name && "border-[var(--danger)]")}
            />
          </Field>
          <Field label="City" error={fieldErrors.city}>
            <Input
              value={city}
              onChange={(e) => setCity(e.target.value)}
              aria-invalid={Boolean(fieldErrors.city)}
              className={cn(fieldErrors.city && "border-[var(--danger)]")}
            />
          </Field>
          <Field
            label="Unit address"
            error={fieldErrors.unit_address}
            className="sm:col-span-2"
          >
            <Input
              value={unitAddress}
              onChange={(e) => setUnitAddress(e.target.value)}
              aria-invalid={Boolean(fieldErrors.unit_address)}
              className={cn(fieldErrors.unit_address && "border-[var(--danger)]")}
            />
          </Field>
          <Field
            label="Landlord email"
            hint="Required — copy from the renewal email thread."
            error={fieldErrors.landlord_email}
          >
            <Input
              type="email"
              value={landlordEmail}
              onChange={(e) => setLandlordEmail(e.target.value)}
              placeholder="management@example.com"
              aria-invalid={Boolean(fieldErrors.landlord_email)}
              className={cn(fieldErrors.landlord_email && "border-[var(--danger)]")}
            />
          </Field>
          <Field label="Landlord display name (optional)">
            <Input
              value={landlordDisplayName}
              onChange={(e) => setLandlordDisplayName(e.target.value)}
            />
          </Field>
        </div>

        {/* ───────────────────────── RESIDENTS ────────────────────────── */}
        <SectionHeader title="RESIDENTS" />
        <div className="flex flex-col gap-3 px-6 py-5">
          {residents.map((r, idx) => {
            const canRemove = residents.length > 1;
            return (
              <div
                key={idx}
                className="grid grid-cols-1 items-end gap-3 rounded-[var(--radius-sm)] border border-border/60 bg-background/40 px-3 py-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto_auto]"
              >
                <Field label={`Resident ${idx + 1} name`}>
                  <Input
                    value={r.name}
                    onChange={(e) => updateResident(idx, { name: e.target.value })}
                  />
                </Field>
                <Field label="Email (optional)">
                  <Input
                    type="email"
                    value={r.email}
                    onChange={(e) => updateResident(idx, { email: e.target.value })}
                  />
                </Field>
                <label className="flex items-center gap-2 text-xs text-foreground sm:pb-2">
                  <input
                    type="radio"
                    name="primary-resident"
                    checked={r.isPrimary}
                    onChange={() => setPrimaryResident(idx)}
                    className="h-3.5 w-3.5 accent-[var(--brand)]"
                  />
                  <span className="label-cap text-[10px] text-muted-foreground">
                    PRIMARY
                  </span>
                </label>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={!canRemove}
                  onClick={() => removeResident(idx)}
                  className="text-xs sm:pb-1"
                >
                  Remove
                </Button>
              </div>
            );
          })}
          {fieldErrors.residents && (
            <p className="label-cap text-[10px] text-[var(--danger)]">
              {fieldErrors.residents}
            </p>
          )}
          <div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={addResident}
              className="text-xs"
            >
              + Add resident
            </Button>
          </div>
        </div>

        {/* ────────────────────────── DATES ───────────────────────────── */}
        <SectionHeader title="DATES" />
        <div className="grid grid-cols-1 gap-4 px-6 py-5 sm:grid-cols-2">
          <Field label="Lease start date" error={fieldErrors.lease_start_date}>
            <CalendarPickerButton
              fieldKey="lease_start_date"
              value={leaseStartDate}
              onChange={setLeaseStartDate}
              open={openCal === "lease_start_date"}
              setOpen={(o) => setOpenCal(o ? "lease_start_date" : null)}
              placeholder="Pick a date"
              hasError={Boolean(fieldErrors.lease_start_date)}
            />
          </Field>
          <Field label="Lease end date" error={fieldErrors.lease_end_date}>
            <CalendarPickerButton
              fieldKey="lease_end_date"
              value={leaseEndDate}
              onChange={setLeaseEndDate}
              open={openCal === "lease_end_date"}
              setOpen={(o) => setOpenCal(o ? "lease_end_date" : null)}
              hasError={Boolean(fieldErrors.lease_end_date)}
            />
          </Field>
          <Field
            label="Notice required (days)"
            error={fieldErrors.notice_days_required}
          >
            <Input
              type="number"
              inputMode="numeric"
              min={0}
              step={1}
              value={noticeDaysRequired}
              onChange={(e) => setNoticeDaysRequired(e.target.value)}
              aria-invalid={Boolean(fieldErrors.notice_days_required)}
              className={cn(
                "mono-num",
                fieldErrors.notice_days_required && "border-[var(--danger)]",
              )}
            />
          </Field>
          <Field
            label="Target move-out date"
            hint="Optional"
          >
            <CalendarPickerButton
              fieldKey="target_move_out_date"
              value={targetMoveOutDate}
              onChange={setTargetMoveOutDate}
              open={openCal === "target_move_out_date"}
              setOpen={(o) => setOpenCal(o ? "target_move_out_date" : null)}
              defaultMonth={targetMonth}
              clearable
            />
          </Field>
          <Field
            label="Renewal offer expires"
            hint="Optional"
          >
            <CalendarPickerButton
              fieldKey="renewal_offer_expires"
              value={renewalOfferExpires}
              onChange={setRenewalOfferExpires}
              open={openCal === "renewal_offer_expires"}
              setOpen={(o) => setOpenCal(o ? "renewal_offer_expires" : null)}
              defaultMonth={renewalMonth}
              clearable
            />
          </Field>
        </div>

        {/* ────────────────────────── MONEY ───────────────────────────── */}
        <SectionHeader title="MONEY" />
        <div className="grid grid-cols-1 gap-4 px-6 py-5 sm:grid-cols-2">
          <Field
            label="Current monthly rent"
            error={fieldErrors.current_monthly_rent}
          >
            <Input
              type="number"
              inputMode="decimal"
              min={0}
              step="0.01"
              value={currentMonthlyRent}
              onChange={(e) => setCurrentMonthlyRent(e.target.value)}
              aria-invalid={Boolean(fieldErrors.current_monthly_rent)}
              className={cn(
                "mono-num",
                fieldErrors.current_monthly_rent && "border-[var(--danger)]",
              )}
            />
          </Field>
          <Field
            label="Renewal monthly rent (optional)"
            error={fieldErrors.renewal_monthly_rent}
          >
            <Input
              type="number"
              inputMode="decimal"
              min={0}
              step="0.01"
              value={renewalMonthlyRent}
              onChange={(e) => setRenewalMonthlyRent(e.target.value)}
              aria-invalid={Boolean(fieldErrors.renewal_monthly_rent)}
              className={cn(
                "mono-num",
                fieldErrors.renewal_monthly_rent && "border-[var(--danger)]",
              )}
            />
          </Field>
          <Field
            label="Month-to-month surcharge"
            hint="Extra rent the landlord charges if you stay past the lease end without renewing."
            error={fieldErrors.m2m_premium}
          >
            <Input
              type="number"
              inputMode="decimal"
              min={0}
              step="0.01"
              value={m2mPremium}
              onChange={(e) => setM2mPremium(e.target.value)}
              aria-invalid={Boolean(fieldErrors.m2m_premium)}
              className={cn(
                "mono-num",
                fieldErrors.m2m_premium && "border-[var(--danger)]",
              )}
            />
          </Field>
          <Field
            label="Security deposit (optional)"
            error={fieldErrors.security_deposit}
          >
            <Input
              type="number"
              inputMode="decimal"
              min={0}
              step="0.01"
              value={securityDeposit}
              onChange={(e) => setSecurityDeposit(e.target.value)}
              aria-invalid={Boolean(fieldErrors.security_deposit)}
              className={cn(
                "mono-num",
                fieldErrors.security_deposit && "border-[var(--danger)]",
              )}
            />
          </Field>
          <Field label="Pet rent (monthly)" error={fieldErrors.pet_rent_monthly}>
            <Input
              type="number"
              inputMode="decimal"
              min={0}
              step="0.01"
              value={petRentMonthly}
              onChange={(e) => setPetRentMonthly(e.target.value)}
              aria-invalid={Boolean(fieldErrors.pet_rent_monthly)}
              className={cn(
                "mono-num",
                fieldErrors.pet_rent_monthly && "border-[var(--danger)]",
              )}
            />
          </Field>
          <Field label="Parking (monthly)" error={fieldErrors.parking_monthly}>
            <Input
              type="number"
              inputMode="decimal"
              min={0}
              step="0.01"
              value={parkingMonthly}
              onChange={(e) => setParkingMonthly(e.target.value)}
              aria-invalid={Boolean(fieldErrors.parking_monthly)}
              className={cn(
                "mono-num",
                fieldErrors.parking_monthly && "border-[var(--danger)]",
              )}
            />
          </Field>
          <Field
            label="Included utilities"
            hint="Toggle each utility your rent already covers."
            className="sm:col-span-2"
          >
            <div className="flex flex-wrap gap-2">
              {UTILITY_OPTIONS.map((u) => {
                const selected = includedUtilities.includes(u);
                return (
                  <button
                    key={u}
                    type="button"
                    onClick={() => toggleUtility(u)}
                    aria-pressed={selected}
                    className={cn(
                      "label-cap inline-flex items-center rounded-[var(--radius-sm)] border px-2.5 py-1 text-[10px] tracking-wider transition-colors",
                      selected
                        ? "border-[oklch(var(--brand-raw)/0.5)] bg-[oklch(var(--brand-raw)/0.18)] text-foreground"
                        : "border-border bg-background/40 text-muted-foreground hover:text-foreground",
                    )}
                  >
                    {u.toUpperCase()}
                  </button>
                );
              })}
            </div>
          </Field>
          <Field
            label="Late fee rules (optional)"
            className="sm:col-span-2"
          >
            <textarea
              value={lateFeeRules}
              onChange={(e) => setLateFeeRules(e.target.value)}
              rows={3}
              className="min-h-[5rem] w-full rounded-lg border border-input bg-transparent px-2.5 py-2 text-xs leading-relaxed text-foreground transition-colors outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30"
              placeholder="e.g. $50 after the 5th, $10/day after."
            />
          </Field>
        </div>
      </div>

      {/* ── server error chip + submit ──────────────────────────────────── */}
      <div className="flex flex-col gap-3">
        {serverError && (
          <p
            role="alert"
            className="rounded-[var(--radius-sm)] border border-[oklch(var(--danger-raw)/0.3)] bg-[oklch(var(--danger-raw)/0.1)] px-3 py-2 text-xs text-[var(--danger)]"
          >
            {serverError}
          </p>
        )}
        <Button
          type="submit"
          disabled={isPending}
          className="w-full bg-[var(--brand)] text-[var(--brand-foreground)] hover:bg-[oklch(var(--brand-raw)/0.9)] sm:w-auto sm:self-end"
        >
          {isPending ? "Saving…" : "Save and start tracking"}
        </Button>
      </div>
    </form>
  );
}

// ── small composable bits ───────────────────────────────────────────────────
function SectionHeader({ title }: { title: string }) {
  return (
    <div className="border-b border-border px-6 py-3 first:rounded-t-[var(--radius-md)] [&:not(:first-child)]:border-t">
      <span className="label-cap text-[10px] text-muted-foreground">
        {title}
      </span>
    </div>
  );
}

function Field({
  label,
  hint,
  error,
  children,
  className,
}: {
  label: string;
  hint?: string;
  error?: string;
  children: React.ReactNode;
  className?: string;
}) {
  // Wrap the whole field in a single <label> so the input inside is
  // implicitly associated with the visible label text (no manual htmlFor
  // wiring). Screen readers will announce the label on focus.
  return (
    <label className={cn("flex flex-col gap-1.5", className)}>
      <span className="label-cap text-[10px] text-muted-foreground">
        {label}
      </span>
      {children}
      {error ? (
        <p className="label-cap text-[10px] text-[var(--danger)]">{error}</p>
      ) : hint ? (
        <p className="label-cap text-[9px] text-muted-foreground">{hint}</p>
      ) : null}
    </label>
  );
}

function CalendarPickerButton({
  fieldKey,
  value,
  onChange,
  open,
  setOpen,
  placeholder,
  defaultMonth,
  hasError,
  clearable,
}: {
  fieldKey: string;
  value: string;
  onChange: (iso: string) => void;
  open: boolean;
  setOpen: (open: boolean) => void;
  placeholder?: string;
  defaultMonth?: Date;
  hasError?: boolean;
  clearable?: boolean;
}) {
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          size="sm"
          aria-invalid={Boolean(hasError)}
          className={cn(
            "mono-num h-9 w-full justify-between text-xs font-normal",
            hasError && "border-[var(--danger)]",
            !value && "text-muted-foreground",
          )}
        >
          <span>{value || placeholder || "Pick a date"}</span>
          <span className="label-cap text-[9px] text-muted-foreground">
            {value ? formatTriggerDate(value) : ""}
          </span>
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-auto p-0">
        <Calendar
          mode="single"
          selected={value ? isoToPickerDate(value) : undefined}
          onSelect={(d) => {
            if (!d) return;
            onChange(pickerDateToIso(d));
            setOpen(false);
          }}
          defaultMonth={value ? isoToPickerDate(value) : defaultMonth}
        />
        {clearable && value && (
          <div className="border-t border-border px-2 py-1.5">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => {
                onChange("");
                setOpen(false);
              }}
              className="w-full text-xs"
              data-field={fieldKey}
            >
              Clear
            </Button>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
