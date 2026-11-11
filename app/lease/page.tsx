import type { Metadata } from "next";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import {
  getActiveLease,
  getLeaseEvents,
  getLatestNoticeDraft,
  getInsurancePolicies,
  getActiveDestination,
} from "@/lib/data/lease-db";
import { getChecklistItems } from "@/lib/data/checklist-db";
import { LeaseFirstRunForm } from "@/components/lease/lease-first-run-form";
import { DecisionDeadlineTracker } from "@/components/lease/decision-deadline-tracker";
import { NoticeComposer } from "@/components/lease/notice-composer";
import { PenaltyForecaster } from "@/components/lease/penalty-forecaster";
import { InsuranceTransitionPanel } from "@/components/lease/insurance-transition-panel";
import { DepositSection } from "@/components/lease/deposit-section";

export const metadata: Metadata = {
  title: "Lease",
  description:
    "Decide whether to renew, vacate, or go month-to-month — track notice deadlines, draft the notice, forecast costs, manage insurance, and document the move-out walkthrough.",
};

export const dynamic = "force-dynamic";

const TABS = [
  "notice",
  "letter",
  "forecast",
  "insurance",
  "walkthrough",
] as const;
type TabId = (typeof TABS)[number];

function normalizeTab(raw: string | undefined, fallback: TabId): TabId {
  return TABS.includes(raw as TabId) ? (raw as TabId) : fallback;
}

export default async function LeasePage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const { tab } = await searchParams;

  const lease = await getActiveLease();
  if (!lease) return <LeaseFirstRunForm />;

  // Post-move the notice question is history — land on the walkthrough/deposit
  // surface instead (AD-039). An explicit ?tab= still wins for deep links.
  const todayIso = new Date().toISOString().slice(0, 10);
  const moveOutIso = lease.target_move_out_date ?? lease.lease_end_date;
  const pastMoveOut = todayIso > moveOutIso;
  const initialTab = normalizeTab(tab, pastMoveOut ? "walkthrough" : "notice");

  const [events, draft, policies, activeDestination, allChecklist] =
    await Promise.all([
      getLeaseEvents(lease.id),
      getLatestNoticeDraft(lease.id),
      getInsurancePolicies(),
      getActiveDestination(),
      getChecklistItems(),
    ]);

  const leaseChecklistItems = allChecklist.filter((i) => i.category === "lease");

  // Shared compute (mirrors the old <LeaseDecisionBlock>'s pre-render logic).
  // Kept inline so each tab's <TabsContent> stays a thin wrapper.
  const sendByEvent = events.find((e) => e.kind === "notice_send_by");
  const daysUntilSendBy = sendByEvent
    ? Math.ceil(
        (new Date(sendByEvent.occurs_on).getTime() - Date.now()) / 86_400_000,
      )
    : null;
  const noticeSent = events.some((e) => e.kind === "notice_sent");

  return (
    <div className="flex min-h-[calc(100svh-3rem)] flex-col gap-6 p-6">
      <header>
        <p className="label-cap text-[10px] tracking-wider text-muted-foreground">
          LEASE & MOVE-OUT
        </p>
        <h2 className="mt-1 text-xl font-semibold tracking-[var(--tracking-headline)] text-foreground">
          {lease.property_name}
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          {lease.unit_address} · {lease.city}
        </p>
      </header>

      <Tabs defaultValue={initialTab} className="gap-4">
        <TabsList>
          <TabsTrigger value="notice">Notice</TabsTrigger>
          <TabsTrigger value="letter">Letter</TabsTrigger>
          <TabsTrigger value="forecast">Forecast</TabsTrigger>
          <TabsTrigger value="insurance">Insurance</TabsTrigger>
          <TabsTrigger value="walkthrough">Walkthrough</TabsTrigger>
        </TabsList>

        <TabsContent value="notice" className="mt-2">
          <DecisionDeadlineTracker
            lease={lease}
            events={events}
            daysUntilSendBy={daysUntilSendBy}
            pastMoveOut={pastMoveOut}
          />
        </TabsContent>

        <TabsContent value="letter" className="mt-2">
          <NoticeComposer lease={lease} draft={draft} />
        </TabsContent>

        <TabsContent value="forecast" className="mt-2">
          <PenaltyForecaster
            lease={lease}
            noticeSent={noticeSent}
            pastMoveOut={pastMoveOut}
          />
        </TabsContent>

        <TabsContent value="insurance" className="mt-2">
          <InsuranceTransitionPanel
            lease={lease}
            policies={policies}
            leaseChecklistItems={leaseChecklistItems}
            activeDestination={activeDestination}
          />
        </TabsContent>

        <TabsContent value="walkthrough" className="mt-2">
          <DepositSection />
        </TabsContent>
      </Tabs>
    </div>
  );
}
