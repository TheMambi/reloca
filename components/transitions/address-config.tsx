import {
  Mail,
  Landmark,
  Briefcase,
  Car,
  Vote,
  ShieldCheck,
  HeartPulse,
  Repeat,
  Plus,
} from "lucide-react";
import type { LifecycleConfig } from "@/lib/lifecycle/types";
import type { AddressChangeTarget } from "@/schemas/transitions";

export const ADDRESS_CATALOG = [
  { kind: "usps",             label: "USPS forward",     icon: <Mail className="size-3.5" strokeWidth={1.75} /> },
  { kind: "bank",             label: "Bank",             icon: <Landmark className="size-3.5" strokeWidth={1.75} /> },
  { kind: "employer",         label: "Employer payroll", icon: <Briefcase className="size-3.5" strokeWidth={1.75} /> },
  { kind: "dmv",              label: "DMV",              icon: <Car className="size-3.5" strokeWidth={1.75} /> },
  { kind: "voter_reg",        label: "Voter reg",        icon: <Vote className="size-3.5" strokeWidth={1.75} /> },
  { kind: "auto_insurance",   label: "Auto insurance",   icon: <ShieldCheck className="size-3.5" strokeWidth={1.75} /> },
  { kind: "health_insurance", label: "Health insurance", icon: <HeartPulse className="size-3.5" strokeWidth={1.75} /> },
  { kind: "subscription",     label: "Subscription",     icon: <Repeat className="size-3.5" strokeWidth={1.75} /> },
  { kind: "custom",           label: "Custom",           icon: <Plus className="size-3.5" strokeWidth={1.75} /> },
] as const;

const ADDRESS_LABEL_BY_KIND: Record<AddressChangeTarget["kind"], string> = {
  usps: "USPS forward",
  bank: "Bank",
  employer: "Employer payroll",
  dmv: "DMV",
  voter_reg: "Voter reg",
  auto_insurance: "Auto insurance",
  health_insurance: "Health insurance",
  subscription: "Subscription",
  custom: "Other",
};

export const addressConfig: LifecycleConfig<
  AddressChangeTarget,
  AddressChangeTarget["status"]
> = {
  catalog: ADDRESS_CATALOG.map((c) => ({ kind: c.kind, label: c.label, icon: c.icon })),
  statusEnum: ["needs_action", "submitted", "confirmed", "skipped"] as const,
  statusTone: {
    needs_action: "neutral",
    submitted:    "info",
    confirmed:    "ok",
    skipped:      "neutral",
  },
  statusLabels: {
    needs_action: "Needs action",
    submitted:    "Submitted",
    confirmed:    "Confirmed",
    skipped:      "Skipped",
  },
  rowKey: (r) => r.id,
  primaryLabel: (r) => {
    const kindLabel = ADDRESS_LABEL_BY_KIND[r.kind];
    return `${r.name} · ${kindLabel}`;
  },
  metadataLabel: (r) => {
    const parts: string[] = [];
    if (r.channel) {
      const channelLabel: Record<NonNullable<AddressChangeTarget["channel"]>, string> = {
        online: "Online",
        phone: "Phone",
        in_person: "In person",
        mail: "Mail",
      };
      parts.push(channelLabel[r.channel]);
    }
    if (r.reference_number) parts.push(`Reference ${r.reference_number}`);
    return parts.join(" · ");
  },
  dateLabel: (r) => (r.due_date ? `Due ${r.due_date}` : null),
  status: (r) => r.status,
};

export { ADDRESS_LABEL_BY_KIND };
