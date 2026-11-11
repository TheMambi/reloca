"use client";

import { useTransition } from "react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { updateLeaseDecision } from "@/app/lease/actions";
import type { LeaseTerms } from "@/schemas/lease";

type Decision = LeaseTerms["decision"];

interface DecisionDropdownProps {
  leaseId: string;
  current: Decision;
  /** When true (e.g. notice already sent), the control is read-only. */
  disabled?: boolean;
}

const OPTIONS: { value: Decision; label: string }[] = [
  { value: "undecided", label: "UNDECIDED" },
  { value: "renew", label: "RENEW" },
  { value: "vacate", label: "VACATE" },
  { value: "m2m", label: "MONTH-TO-MONTH" },
];

export function DecisionDropdown({
  leaseId,
  current,
  disabled = false,
}: DecisionDropdownProps) {
  const [isPending, startTransition] = useTransition();

  function onValueChange(next: string) {
    if (next === current) return;
    startTransition(async () => {
      await updateLeaseDecision(leaseId, next as Decision);
    });
  }

  return (
    <Select
      value={current}
      onValueChange={onValueChange}
      disabled={disabled || isPending}
    >
      <SelectTrigger
        size="sm"
        aria-label="Lease decision"
        className={`label-cap h-7 w-full justify-between border-border bg-transparent px-2 text-[10px] text-foreground tracking-wider ${
          isPending ? "opacity-60" : ""
        }`}
      >
        <SelectValue />
      </SelectTrigger>
      <SelectContent align="start">
        {OPTIONS.map((opt) => (
          <SelectItem
            key={opt.value}
            value={opt.value}
            className="label-cap text-[10px] tracking-wider"
          >
            {opt.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
