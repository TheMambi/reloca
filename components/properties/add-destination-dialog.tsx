"use client";

// Two-phase "+ Add destination" Dialog (Task 6.25 + 6.27 redesign).
//
//   Add mode (no `destination` prop):
//     Phase 1 (url) → fetchDestinationPreview → Phase 2 prefilled.
//     Or Skip → Phase 2 blank.
//
//   Edit mode (`destination` prop set):
//     Skips Phase 1 entirely and lands on Phase 2 prefilled from the row.
//     Submit calls updateDestination(id, …) instead of createDestination(…).
//
//  Address is split into street / city / state (dropdown) / zip; HUD FMR
//  reads zip directly from the column.
//  Amenities render as a categorized checkbox catalog with a "+ add custom"
//  input for anything not in the catalog. Storage stays a free-form text[].

import { useState, useTransition } from "react";
import { Plus, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  createDestination,
  fetchDestinationPreview,
  updateDestination,
} from "@/app/lease/actions";
import { settle } from "@/lib/settle-action";
import { AMENITY_CATALOG, CATALOG_ITEM_SET } from "@/lib/lease/amenities";
import { US_STATES } from "@/lib/lease/us-states";

import type { FetchResult } from "@/lib/lease/destination-fetch";
import type { Destination } from "@/schemas/lease";

type FetchStatus = "manual" | "needs_review" | "verified" | "fetch_failed";
type Tri = "yes" | "no" | "unknown";

type FormState = {
  building_name: string;
  street_address: string;
  city: string;
  state_code: string;
  zip_code: string;
  source_url: string;
  monthly_rent_low: string;
  monthly_rent_high: string;
  application_fee: string;
  security_deposit: string;
  pet_rent_monthly: string;
  parking_monthly: string;
  beds: string;
  baths: string;
  sqft: string;
  amenities: string[]; // free-form list, catalog + custom
  pets_allowed: Tri;
  furnished: Tri;
  insurance_required: boolean;
  insurance_min_liability: string;
  insurance_min_property: string;
  is_active_target: boolean;
  notes: string;
};

const EMPTY_FORM: FormState = {
  building_name: "",
  street_address: "",
  city: "",
  state_code: "",
  zip_code: "",
  source_url: "",
  monthly_rent_low: "",
  monthly_rent_high: "",
  application_fee: "",
  security_deposit: "",
  pet_rent_monthly: "",
  parking_monthly: "",
  beds: "",
  baths: "",
  sqft: "",
  amenities: [],
  pets_allowed: "unknown",
  furnished: "unknown",
  insurance_required: true,
  insurance_min_liability: "",
  insurance_min_property: "",
  is_active_target: false,
  notes: "",
};

function asString(v: unknown): string {
  return v == null ? "" : String(v);
}

// Maps internal field names from the missing-fields banner to friendly labels.
function prettyFieldName(field: string): string {
  const map: Record<string, string> = {
    building_name: "property name",
    street_address: "street",
    city: "city",
    state_code: "state",
    zip_code: "ZIP",
  };
  return map[field] ?? field;
}

function triFromBool(b: boolean | null | undefined): Tri {
  return b === true ? "yes" : b === false ? "no" : "unknown";
}

function dataToForm(
  data: NonNullable<Extract<FetchResult, { status: "needs_review" }>["data"]>,
): FormState {
  return {
    ...EMPTY_FORM,
    building_name: asString(data.building_name),
    street_address: asString(data.street_address),
    city: asString(data.city),
    state_code: asString(data.state_code),
    zip_code: asString(data.zip_code),
    source_url: asString(data.source_url),
    monthly_rent_low: asString(data.monthly_rent_low),
    monthly_rent_high: asString(data.monthly_rent_high),
    application_fee: asString(data.application_fee),
    security_deposit: asString(data.security_deposit),
    pet_rent_monthly: asString(data.pet_rent_monthly),
    parking_monthly: asString(data.parking_monthly),
    beds: asString(data.beds),
    baths: asString(data.baths),
    sqft: asString(data.sqft),
    amenities: data.amenities ?? [],
    pets_allowed: triFromBool(data.pets_allowed),
    furnished: triFromBool(data.furnished),
    insurance_required:
      data.insurance_required === undefined
        ? true
        : Boolean(data.insurance_required),
    insurance_min_liability: asString(data.insurance_min_liability),
    insurance_min_property: asString(data.insurance_min_property),
    is_active_target: false,
    notes: asString(data.notes),
  };
}

function destinationToForm(d: Destination): FormState {
  return {
    building_name: d.building_name,
    street_address: d.street_address,
    city: d.city,
    state_code: d.state_code ?? "",
    zip_code: d.zip_code ?? "",
    source_url: d.source_url ?? "",
    monthly_rent_low: asString(d.monthly_rent_low),
    monthly_rent_high: asString(d.monthly_rent_high),
    application_fee: asString(d.application_fee),
    security_deposit: asString(d.security_deposit),
    pet_rent_monthly: asString(d.pet_rent_monthly),
    parking_monthly: asString(d.parking_monthly),
    beds: asString(d.beds),
    baths: asString(d.baths),
    sqft: asString(d.sqft),
    amenities: [...d.amenities],
    pets_allowed: triFromBool(d.pets_allowed),
    furnished: triFromBool(d.furnished),
    insurance_required: d.insurance_required,
    insurance_min_liability: asString(d.insurance_min_liability),
    insurance_min_property: asString(d.insurance_min_property),
    is_active_target: d.is_active_target,
    notes: d.notes ?? "",
  };
}

function numOrNull(s: string): number | null {
  if (s.trim() === "") return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}
function intOrNull(s: string): number | null {
  const n = numOrNull(s);
  return n == null ? null : Math.round(n);
}
function triToBool(v: Tri): boolean | null {
  if (v === "yes") return true;
  if (v === "no") return false;
  return null;
}
function strOrNull(s: string): string | null {
  return s.trim() === "" ? null : s.trim();
}

interface Props {
  /** When set, the dialog opens in edit mode for this destination. */
  destination?: Destination;
  /** Custom trigger element. Defaults to "+ ADD DESTINATION". */
  trigger?: React.ReactNode;
}

export function AddDestinationDialog({ destination, trigger }: Props) {
  const editing = Boolean(destination);
  const initialPhase: "url" | "review" = editing ? "review" : "url";
  const initialFormState: FormState = editing && destination
    ? destinationToForm(destination)
    : EMPTY_FORM;
  const initialFetchStatus: FetchStatus = editing
    ? (destination?.fetch_status ?? "manual")
    : "manual";

  const [open, setOpen] = useState(false);
  const [phase, setPhase] = useState<"url" | "review">(initialPhase);
  const [url, setUrl] = useState("");
  const [form, setForm] = useState<FormState>(initialFormState);
  const [fetchStatus, setFetchStatus] = useState<FetchStatus>(initialFetchStatus);
  const [missing, setMissing] = useState<string[]>([]);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [customAmenity, setCustomAmenity] = useState("");
  const [isFetching, startFetch] = useTransition();
  const [isSubmitting, startSubmit] = useTransition();

  function reset() {
    setPhase(initialPhase);
    setUrl("");
    setForm(initialFormState);
    setFetchStatus(initialFetchStatus);
    setMissing([]);
    setFetchError(null);
    setSubmitError(null);
    setCustomAmenity("");
  }

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (!next) setTimeout(reset, 200);
  }

  function patch(p: Partial<FormState>) {
    setForm((prev) => ({ ...prev, ...p }));
  }

  function toggleAmenity(name: string) {
    setForm((prev) => {
      const has = prev.amenities.includes(name);
      return {
        ...prev,
        amenities: has
          ? prev.amenities.filter((a) => a !== name)
          : [...prev.amenities, name],
      };
    });
  }

  function addCustomAmenity() {
    const v = customAmenity.trim();
    if (!v) return;
    if (!form.amenities.includes(v)) {
      patch({ amenities: [...form.amenities, v] });
    }
    setCustomAmenity("");
  }

  function handleFetch() {
    if (!url.trim()) return;
    setFetchError(null);
    startFetch(async () => {
      try {
        const result = await fetchDestinationPreview(url.trim());
        if (result.status === "fetch_failed") {
          setFetchError(result.message);
          setForm({ ...EMPTY_FORM, source_url: url.trim() });
          setFetchStatus("fetch_failed");
          setMissing(["building_name", "street_address", "city"]);
          setPhase("review");
          return;
        }
        setForm(dataToForm(result.data));
        setFetchStatus("needs_review");
        setMissing(result.missing);
        setPhase("review");
      } catch {
        setFetchError("Couldn't read that link. Wait a moment and try again, or fill in the details by hand.");
      }
    });
  }

  function handleSkip() {
    setForm(EMPTY_FORM);
    setFetchStatus("manual");
    setMissing([]);
    setPhase("review");
  }

  function buildPayload() {
    return {
      building_name: form.building_name.trim(),
      street_address: form.street_address.trim(),
      city: form.city.trim(),
      state_code: strOrNull(form.state_code),
      zip_code: strOrNull(form.zip_code),
      source_url: strOrNull(form.source_url),
      fetch_status: fetchStatus,
      monthly_rent_low: numOrNull(form.monthly_rent_low),
      monthly_rent_high: numOrNull(form.monthly_rent_high),
      application_fee: numOrNull(form.application_fee),
      security_deposit: numOrNull(form.security_deposit),
      pet_rent_monthly: numOrNull(form.pet_rent_monthly),
      parking_monthly: numOrNull(form.parking_monthly),
      beds: numOrNull(form.beds),
      baths: numOrNull(form.baths),
      sqft: intOrNull(form.sqft),
      amenities: form.amenities.map((a) => a.trim()).filter(Boolean),
      pets_allowed: triToBool(form.pets_allowed),
      furnished: triToBool(form.furnished),
      insurance_required: form.insurance_required,
      insurance_min_liability: numOrNull(form.insurance_min_liability),
      insurance_min_property: numOrNull(form.insurance_min_property),
      is_active_target: form.is_active_target,
      notes: strOrNull(form.notes),
    };
  }

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSubmitError(null);
    startSubmit(async () => {
      const payload = buildPayload();
      const res = await settle(
        editing && destination ? updateDestination(destination.id, payload) : createDestination(payload),
      );
      if (res.ok) handleOpenChange(false);
      else setSubmitError(res.error);
    });
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        {trigger ?? (
          <button
            type="button"
            className="label-cap inline-flex items-center gap-1 rounded-[var(--radius-sm)] border border-border bg-background/40 px-2 py-1 text-[10px] text-foreground tracking-wider transition-colors hover:bg-background/70"
          >
            <Plus className="h-3 w-3" aria-hidden="true" />
            ADD A PROPERTY
          </button>
        )}
      </DialogTrigger>
      <DialogContent className="max-h-[92svh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>
            {editing ? "Edit property" : "Add a property"}
          </DialogTitle>
          <DialogDescription>
            {phase === "url"
              ? "Paste the building's own website and we'll read the details it publishes about itself, such as its name and address. Listing sites usually don't allow this, so for those, skip and type the details in yourself."
              : editing
                ? "Update what's changed and save. If you change the address, the local rent benchmark refreshes automatically."
                : "Look over what we found and fill in anything missing before saving."}
          </DialogDescription>
        </DialogHeader>

        {phase === "url" ? (
          <PhaseUrl
            url={url}
            onUrl={setUrl}
            onFetch={handleFetch}
            onSkip={handleSkip}
            isFetching={isFetching}
            error={fetchError}
          />
        ) : (
          <form onSubmit={handleSubmit} className="space-y-5">
            {fetchStatus === "fetch_failed" && !editing ? (
              <Banner tone="warn">
                We couldn&apos;t read this website. Please fill in the fields
                below by hand.
                {fetchError ? (
                  <span className="mt-1 block text-[10px] opacity-80">
                    {fetchError}
                  </span>
                ) : null}
              </Banner>
            ) : missing.length > 0 && !editing ? (
              <Banner tone="info">
                We couldn&apos;t read these from the page —{" "}
                {missing.map(prettyFieldName).join(", ")}. Please add them.
              </Banner>
            ) : null}

            <Section title="IDENTITY">
              <Field label="Property name" required>
                <Input
                  value={form.building_name}
                  onChange={(e) => patch({ building_name: e.target.value })}
                  required
                  className="h-9 text-sm"
                />
              </Field>
              <Field label="Street address" required>
                <Input
                  value={form.street_address}
                  onChange={(e) => patch({ street_address: e.target.value })}
                  placeholder="100 Harbor Ave"
                  required
                  className="h-9 text-sm"
                />
              </Field>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_120px_140px]">
                <Field label="City" required>
                  <Input
                    value={form.city}
                    onChange={(e) => patch({ city: e.target.value })}
                    placeholder="City"
                    required
                    className="h-9 text-sm"
                  />
                </Field>
                <Field label="State">
                  <select
                    value={form.state_code}
                    onChange={(e) => patch({ state_code: e.target.value })}
                    className="h-9 w-full rounded-[var(--radius-sm)] border border-border bg-background/40 px-2 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <option value="">—</option>
                    {US_STATES.map((s) => (
                      <option key={s.code} value={s.code}>
                        {s.code} — {s.name}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="ZIP">
                  <Input
                    value={form.zip_code}
                    onChange={(e) => patch({ zip_code: e.target.value })}
                    placeholder="90802"
                    pattern="\d{5}(-\d{4})?"
                    inputMode="numeric"
                    className="h-9 text-sm mono-num"
                  />
                </Field>
              </div>
              <Field label="Property website">
                <Input
                  type="url"
                  value={form.source_url}
                  onChange={(e) => patch({ source_url: e.target.value })}
                  placeholder="https://www.example.com"
                  className="h-9 text-sm"
                />
              </Field>
            </Section>

            <Section title="COST">
              <NumGrid>
                <Field label="Rent low ($)">
                  <Input
                    inputMode="decimal"
                    value={form.monthly_rent_low}
                    onChange={(e) => patch({ monthly_rent_low: e.target.value })}
                    className="h-9 text-sm mono-num"
                  />
                </Field>
                <Field label="Rent high ($)">
                  <Input
                    inputMode="decimal"
                    value={form.monthly_rent_high}
                    onChange={(e) =>
                      patch({ monthly_rent_high: e.target.value })
                    }
                    className="h-9 text-sm mono-num"
                  />
                </Field>
                <Field label="Application fee ($)">
                  <Input
                    inputMode="decimal"
                    value={form.application_fee}
                    onChange={(e) => patch({ application_fee: e.target.value })}
                    className="h-9 text-sm mono-num"
                  />
                </Field>
                <Field label="Security deposit ($)">
                  <Input
                    inputMode="decimal"
                    value={form.security_deposit}
                    onChange={(e) =>
                      patch({ security_deposit: e.target.value })
                    }
                    className="h-9 text-sm mono-num"
                  />
                </Field>
                <Field label="Pet rent / mo ($)">
                  <Input
                    inputMode="decimal"
                    value={form.pet_rent_monthly}
                    onChange={(e) =>
                      patch({ pet_rent_monthly: e.target.value })
                    }
                    className="h-9 text-sm mono-num"
                  />
                </Field>
                <Field label="Parking / mo ($)">
                  <Input
                    inputMode="decimal"
                    value={form.parking_monthly}
                    onChange={(e) => patch({ parking_monthly: e.target.value })}
                    className="h-9 text-sm mono-num"
                  />
                </Field>
              </NumGrid>
            </Section>

            <Section title="UNIT SIZE">
              <NumGrid>
                <Field label="Bedrooms">
                  <Input
                    inputMode="decimal"
                    value={form.beds}
                    onChange={(e) => patch({ beds: e.target.value })}
                    className="h-9 text-sm mono-num"
                  />
                </Field>
                <Field label="Bathrooms">
                  <Input
                    inputMode="decimal"
                    value={form.baths}
                    onChange={(e) => patch({ baths: e.target.value })}
                    className="h-9 text-sm mono-num"
                  />
                </Field>
                <Field label="Square feet">
                  <Input
                    inputMode="numeric"
                    value={form.sqft}
                    onChange={(e) => patch({ sqft: e.target.value })}
                    className="h-9 text-sm mono-num"
                  />
                </Field>
              </NumGrid>
            </Section>

            <Section title="AMENITIES">
              <AmenityGrid
                selected={form.amenities}
                onToggle={toggleAmenity}
                customAmenity={customAmenity}
                onCustomChange={setCustomAmenity}
                onAddCustom={addCustomAmenity}
                onRemoveAmenity={(a) =>
                  patch({ amenities: form.amenities.filter((x) => x !== a) })
                }
              />
            </Section>

            <Section title="PETS & FURNISHING">
              <NumGrid>
                <Field label="Pets allowed">
                  <TriSelect
                    value={form.pets_allowed}
                    onChange={(v) => patch({ pets_allowed: v })}
                  />
                </Field>
                <Field label="Comes furnished">
                  <TriSelect
                    value={form.furnished}
                    onChange={(v) => patch({ furnished: v })}
                  />
                </Field>
              </NumGrid>
            </Section>

            <Section title="RENTERS INSURANCE">
              <label className="flex items-center gap-2 text-xs text-foreground">
                <input
                  type="checkbox"
                  checked={form.insurance_required}
                  onChange={(e) =>
                    patch({ insurance_required: e.target.checked })
                  }
                  className="size-3.5 accent-[var(--brand-secondary)]"
                />
                <span>Renter&apos;s insurance required by landlord</span>
              </label>
              <NumGrid>
                <Field label="Min liability coverage ($)">
                  <Input
                    inputMode="decimal"
                    value={form.insurance_min_liability}
                    onChange={(e) =>
                      patch({ insurance_min_liability: e.target.value })
                    }
                    className="h-9 text-sm mono-num"
                  />
                </Field>
                <Field label="Min belongings coverage ($)">
                  <Input
                    inputMode="decimal"
                    value={form.insurance_min_property}
                    onChange={(e) =>
                      patch({ insurance_min_property: e.target.value })
                    }
                    className="h-9 text-sm mono-num"
                  />
                </Field>
              </NumGrid>
            </Section>

            <Section title="ACTIVE & NOTES">
              <label className="flex items-center gap-2 text-xs text-foreground">
                <input
                  type="checkbox"
                  checked={form.is_active_target}
                  onChange={(e) =>
                    patch({ is_active_target: e.target.checked })
                  }
                  className="size-3.5 accent-[var(--brand-secondary)]"
                />
                <span>
                  This is the property we&apos;re aiming for (any other property
                  will lose this mark)
                </span>
              </label>
              <Field label="Notes">
                <textarea
                  value={form.notes}
                  onChange={(e) => patch({ notes: e.target.value })}
                  rows={3}
                  className="w-full resize-none rounded-[var(--radius-sm)] border border-border bg-background/40 px-3 py-2 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                />
              </Field>
            </Section>

            {submitError ? <Banner tone="danger">{submitError}</Banner> : null}

            <DialogFooter>
              {!editing ? (
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setPhase("url")}
                  disabled={isSubmitting}
                >
                  Back
                </Button>
              ) : null}
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting
                  ? "Saving…"
                  : editing
                    ? "Save changes"
                    : "Save property"}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}

// ── sub-components ──────────────────────────────────────────────────────

function PhaseUrl({
  url,
  onUrl,
  onFetch,
  onSkip,
  isFetching,
  error,
}: {
  url: string;
  onUrl: (s: string) => void;
  onFetch: () => void;
  onSkip: () => void;
  isFetching: boolean;
  error: string | null;
}) {
  return (
    <div className="space-y-4">
      <Field label="Property website">
        <Input
          type="url"
          value={url}
          onChange={(e) => onUrl(e.target.value)}
          placeholder="https://www.example.com"
          autoFocus
          className="h-9 text-sm"
        />
      </Field>
      {error ? <Banner tone="danger">{error}</Banner> : null}
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onSkip} disabled={isFetching}>
          Skip — type it in
        </Button>
        <Button
          type="button"
          onClick={onFetch}
          disabled={isFetching || url.trim() === ""}
        >
          {isFetching ? "Reading…" : "Read website & continue"}
        </Button>
      </DialogFooter>
    </div>
  );
}

function AmenityGrid({
  selected,
  onToggle,
  customAmenity,
  onCustomChange,
  onAddCustom,
  onRemoveAmenity,
}: {
  selected: string[];
  onToggle: (name: string) => void;
  customAmenity: string;
  onCustomChange: (s: string) => void;
  onAddCustom: () => void;
  onRemoveAmenity: (name: string) => void;
}) {
  const selectedSet = new Set(selected);
  const customAmenities = selected.filter((a) => !CATALOG_ITEM_SET.has(a));

  return (
    <div className="space-y-4">
      {AMENITY_CATALOG.map((cat) => (
        <fieldset key={cat.id} className="space-y-2">
          <legend className="label-cap text-[9px] tracking-wider text-muted-foreground">
            {cat.label}
          </legend>
          <div className="grid grid-cols-1 gap-x-3 gap-y-1.5 sm:grid-cols-2">
            {cat.items.map((item) => (
              <label
                key={item}
                className="flex items-center gap-2 text-xs text-foreground"
              >
                <input
                  type="checkbox"
                  checked={selectedSet.has(item)}
                  onChange={() => onToggle(item)}
                  className="size-3.5 accent-[var(--brand-secondary)]"
                />
                <span>{item}</span>
              </label>
            ))}
          </div>
        </fieldset>
      ))}

      {customAmenities.length > 0 ? (
        <fieldset className="space-y-2">
          <legend className="label-cap text-[9px] tracking-wider text-muted-foreground">
            CUSTOM
          </legend>
          <ul className="flex flex-wrap gap-1.5">
            {customAmenities.map((a) => (
              <li
                key={a}
                className="inline-flex items-center gap-1 rounded-[var(--radius-sm)] border border-border bg-background/40 px-2 py-0.5 text-xs"
              >
                <span>{a}</span>
                <button
                  type="button"
                  onClick={() => onRemoveAmenity(a)}
                  aria-label={`Remove ${a}`}
                  className="text-muted-foreground transition-colors hover:text-[var(--danger)]"
                >
                  <Trash2 className="h-3 w-3" />
                </button>
              </li>
            ))}
          </ul>
        </fieldset>
      ) : null}

      <div className="flex items-end gap-2">
        <Field label="Add custom amenity">
          <Input
            value={customAmenity}
            onChange={(e) => onCustomChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                onAddCustom();
              }
            }}
            placeholder="e.g. Saltwater pool"
            className="h-9 text-sm"
          />
        </Field>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={onAddCustom}
          disabled={customAmenity.trim() === ""}
        >
          Add
        </Button>
      </div>
    </div>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <fieldset className="space-y-3">
      <legend className="label-cap text-[9px] tracking-wider text-muted-foreground">
        {title}
      </legend>
      {children}
    </fieldset>
  );
}

function Field({
  label,
  required,
  children,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  // Wrap the whole field in a single <label> so the input inside is
  // implicitly associated with the visible label text (no manual id wiring).
  // Screen readers announce the label text when focus lands on the input.
  return (
    <Label className="flex flex-col items-start gap-1 font-normal">
      <span className="label-cap text-[9px] tracking-wider text-muted-foreground">
        {label}
        {required ? (
          <span className="ml-1 text-[var(--brand-secondary)]">*</span>
        ) : null}
      </span>
      {children}
    </Label>
  );
}

function NumGrid({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4">
      {children}
    </div>
  );
}

function TriSelect({
  value,
  onChange,
}: {
  value: Tri;
  onChange: (v: Tri) => void;
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value as Tri)}
      className="h-9 w-full rounded-[var(--radius-sm)] border border-border bg-background/40 px-2 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <option value="unknown">Unknown</option>
      <option value="yes">Yes</option>
      <option value="no">No</option>
    </select>
  );
}

function Banner({
  tone,
  children,
}: {
  tone: "info" | "warn" | "danger";
  children: React.ReactNode;
}) {
  const cls =
    tone === "danger"
      ? "border-[oklch(var(--danger-raw)/0.3)] bg-[oklch(var(--danger-raw)/0.08)] text-[var(--danger)]"
      : tone === "warn"
        ? "border-[oklch(var(--warn-raw)/0.3)] bg-[oklch(var(--warn-raw)/0.08)] text-[var(--warn)]"
        : "border-[oklch(var(--info-raw)/0.3)] bg-[oklch(var(--info-raw)/0.08)] text-[var(--info)]";
  return (
    <div
      role="status"
      className={`rounded-[var(--radius-sm)] border px-3 py-2 text-xs ${cls}`}
    >
      {children}
    </div>
  );
}
