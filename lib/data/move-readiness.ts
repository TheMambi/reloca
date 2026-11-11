import { cache } from "react";
import { getChecklistItems } from "./checklist-db";
import { getUtilityTransitions, getAddressTargets } from "./transitions-db";
import { getActiveWalkthrough } from "./move-out-db";
import type { ChecklistItem } from "@/schemas";
import type {
  UtilityTransition,
  AddressChangeTarget,
} from "@/schemas/transitions";

// Multi-source roll-up of move readiness. Each category contributes a count of
// total + completed actions; the deposit branch is binary (started / pdf made).
// Wave B will wire deposit to the live `move_out_walkthroughs` row; for now
// it ships as { walkthroughStarted: false, pdfGenerated: false }.
export type MoveReadiness = {
  total: number;
  completed: number;
  byCategory: {
    checklist: { total: number; completed: number };
    lease:     { total: number; completed: number };
    utility:   { total: number; completed: number };
    address:   { total: number; completed: number };
    deposit:   { walkthroughStarted: boolean; pdfGenerated: boolean };
  };
};

export type DepositReadiness = MoveReadiness["byCategory"]["deposit"];

// Pure aggregation helper — extracted so the test file can exercise it without
// touching Supabase. The cached `getMoveReadiness` below threads live data in.
export function computeReadiness(
  checklist: ChecklistItem[],
  utilities: UtilityTransition[],
  targets: AddressChangeTarget[],
  deposit: DepositReadiness,
): MoveReadiness {
  const lease = checklist.filter((i) => i.category === "lease");
  const nonLease = checklist.filter((i) => i.category !== "lease");

  // `skipped` rows are terminal escape hatches and shouldn't count toward
  // either total or completed (mirrors the Lifecycle tracker's grouping).
  const utilityTracked = utilities.filter((r) => r.status !== "skipped");
  const addressTracked = targets.filter((r) => r.status !== "skipped");

  const byCategory = {
    checklist: {
      total: nonLease.length,
      completed: nonLease.filter((i) => i.completed).length,
    },
    lease: {
      total: lease.length,
      completed: lease.filter((i) => i.completed).length,
    },
    utility: {
      total: utilityTracked.length,
      completed: utilityTracked.filter((r) => r.status === "confirmed").length,
    },
    address: {
      total: addressTracked.length,
      completed: addressTracked.filter((r) => r.status === "confirmed").length,
    },
    deposit,
  };

  // Deposit contributes 1 toward total once the walkthrough exists, and 1
  // toward completed once the PDF has been generated. Keeps the binary
  // signal visible on the readiness bar without inflating the deposit
  // category's per-room weight.
  const total =
    byCategory.checklist.total +
    byCategory.lease.total +
    byCategory.utility.total +
    byCategory.address.total +
    (deposit.walkthroughStarted ? 1 : 0);

  const completed =
    byCategory.checklist.completed +
    byCategory.lease.completed +
    byCategory.utility.completed +
    byCategory.address.completed +
    (deposit.pdfGenerated ? 1 : 0);

  return { total, completed, byCategory };
}

export const getMoveReadiness = cache(async (): Promise<MoveReadiness> => {
  const [checklist, utilities, targets, walkthrough] = await Promise.all([
    getChecklistItems(),
    getUtilityTransitions(),
    getAddressTargets(),
    getActiveWalkthrough(),
  ]);

  const deposit: DepositReadiness = {
    walkthroughStarted: walkthrough !== null,
    pdfGenerated: walkthrough?.pdf_generated_at !== null && walkthrough?.pdf_generated_at !== undefined,
  };

  return computeReadiness(checklist, utilities, targets, deposit);
});
