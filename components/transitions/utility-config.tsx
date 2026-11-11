import { Zap, Flame, Droplet, Trash2, Wifi, Tv, Plus } from "lucide-react";
import type { LifecycleConfig } from "@/lib/lifecycle/types";
import type { UtilityTransition } from "@/schemas/transitions";

export const UTILITY_CATALOG = [
  { kind: "electricity", label: "Electricity", icon: <Zap className="size-3.5" strokeWidth={1.75} /> },
  { kind: "gas",         label: "Gas",         icon: <Flame className="size-3.5" strokeWidth={1.75} /> },
  { kind: "water",       label: "Water",       icon: <Droplet className="size-3.5" strokeWidth={1.75} /> },
  { kind: "internet",    label: "Internet",    icon: <Wifi className="size-3.5" strokeWidth={1.75} /> },
  { kind: "trash",       label: "Trash",       icon: <Trash2 className="size-3.5" strokeWidth={1.75} /> },
  { kind: "tv",          label: "TV",          icon: <Tv className="size-3.5" strokeWidth={1.75} /> },
  { kind: "custom",      label: "Custom",      icon: <Plus className="size-3.5" strokeWidth={1.75} /> },
] as const;

const UTILITY_LABEL_BY_KIND: Record<UtilityTransition["kind"], string> = {
  electricity: "Electricity",
  gas: "Gas",
  water: "Water",
  internet: "Internet",
  trash: "Trash",
  tv: "TV",
  custom: "Custom",
};

export const utilityConfig: LifecycleConfig<UtilityTransition, UtilityTransition["status"]> = {
  catalog: UTILITY_CATALOG.map((c) => ({ kind: c.kind, label: c.label, icon: c.icon })),
  statusEnum: ["needs_action", "scheduled", "in_progress", "confirmed", "skipped"] as const,
  statusTone: {
    needs_action: "neutral",
    scheduled:    "info",
    in_progress:  "warn",
    confirmed:    "ok",
    skipped:      "neutral",
  },
  statusLabels: {
    needs_action: "Needs action",
    scheduled:    "Scheduled",
    in_progress:  "In progress",
    confirmed:    "Confirmed",
    skipped:      "Skipped",
  },
  rowKey: (r) => r.id,
  primaryLabel: (r) => {
    const baseLabel =
      r.kind === "custom" ? (r.custom_label ?? "Custom") : UTILITY_LABEL_BY_KIND[r.kind];
    const sideLabel = r.side === "origin" ? "Origin" : "Destination";
    return `${baseLabel} (${sideLabel})`;
  },
  metadataLabel: (r) =>
    [r.provider, r.account_number ? `Account ${r.account_number}` : null]
      .filter(Boolean)
      .join(" · "),
  dateLabel: (r) => (r.scheduled_date ? `Scheduled ${r.scheduled_date}` : null),
  status: (r) => r.status,
};
