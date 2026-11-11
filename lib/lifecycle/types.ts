import type { ReactNode } from "react";

export type LifecycleTone = "ok" | "warn" | "info" | "danger" | "neutral";

export interface LifecycleConfig<TRow, TStatus extends string> {
  catalog: { kind: string; label: string; icon?: ReactNode }[];
  statusEnum: readonly TStatus[];
  statusTone: Record<TStatus, LifecycleTone>;
  statusLabels: Record<TStatus, string>;
  rowKey: (row: TRow) => string;
  primaryLabel: (row: TRow) => string;
  metadataLabel: (row: TRow) => string;
  dateLabel: (row: TRow) => string | null;
  status: (row: TRow) => TStatus;
}

export const LIFECYCLE_TONE_CLASSES: Record<LifecycleTone, string> = {
  ok: "border-[oklch(var(--ok-raw)/0.3)] bg-[oklch(var(--ok-raw)/0.12)] text-[var(--ok)]",
  warn: "border-[oklch(var(--warn-raw)/0.3)] bg-[oklch(var(--warn-raw)/0.12)] text-[var(--warn)]",
  info: "border-[oklch(var(--info-raw)/0.3)] bg-[oklch(var(--info-raw)/0.12)] text-[var(--info)]",
  danger:
    "border-[oklch(var(--danger-raw)/0.3)] bg-[oklch(var(--danger-raw)/0.12)] text-[var(--danger)]",
  neutral: "border-border bg-card text-muted-foreground",
};
