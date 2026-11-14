import { OperationsHero } from "@/components/dashboard/operations-hero";
import { OperationsGrid } from "@/components/dashboard/operations-grid";
import { JourneyPanel } from "@/components/dashboard/journey-panel";
import { AtAGlance, type LeaseGlance } from "@/components/dashboard/at-a-glance";
import { QuickInsights } from "@/components/dashboard/quick-insights";
import { DataSourcesPanel } from "@/components/dashboard/data-sources-panel";
import { AllSystemsGo } from "@/components/dashboard/system-status-row";
import { RelocationMapTileServer } from "@/components/dashboard/relocation-map-tile-server";
import { MoveTimelineTile } from "@/components/dashboard/move-timeline-tile";
/* ── Data loaders (Phase 3 — real data wiring) ── */
import {
  getCostOfLiving,
  costValueFor,
  getProperties,
  getCommunityInsights,
  getClimateProfile,
  getCrimeRecord,
} from "@/lib/data";
import { getWalkabilityProfile, WALKABILITY_LABELS } from "@/lib/data/walkability";
import { getAirQualityProfile } from "@/lib/data/air-quality";
import { getChecklistItems } from "@/lib/data/checklist-db";
import { getActiveLease, getLeaseEvents } from "@/lib/data/lease-db";
import { getMoveReadiness } from "@/lib/data/move-readiness";
import { getMoveEstimate } from "@/lib/data/move-cost-db";
import { getSavedNeighborhoods } from "@/lib/data/saved-neighborhoods-db";
import { getStatusAlerts } from "@/lib/data/status-alerts";
import { deriveJourneyPhase } from "@/lib/journey";
import { daysUntilIso, todayInZoneIso } from "@/lib/dates";
import {
  getViewingRelocation,
  moveContextFor,
  type MoveContext,
} from "@/lib/data/relocation-db";

export const dynamic = "force-dynamic";

// Reference-driven dashboard data — recomputes for the viewing relocation's
// origin↔destination (Wave C tile split). Execution data (checklist, lease,
// readiness) below stays bound to the active move, regardless of `ctx`.
async function computeDashboardData(ctx: MoveContext) {
  const {
    originSlug,
    destinationSlug: destSlug,
    originName,
    destinationName: destName,
  } = ctx;
  const costData = getCostOfLiving();
  const properties = getProperties();
  const communityArr = getCommunityInsights();
  const destClimate = getClimateProfile(destSlug);
  const destCrime = getCrimeRecord(destSlug);

  // Parallel async fetches — checklist + lease + readiness share round-trips.
  // `getMoveReadiness` re-reads checklist + transition tables, but `cache()`
  // dedupes within a request so the network cost is single.
  const [items, lease, readiness, estimate] = await Promise.all([
    getChecklistItems(),
    getActiveLease(),
    getMoveReadiness(),
    getMoveEstimate().catch(() => null),
  ]);
  const events = lease ? await getLeaseEvents(lease.id) : [];

  // ── Cost & Commute ── (destination total vs origin, for the viewing pair)
  const destTotal = costData.categories.reduce((s, c) => s + costValueFor(c, destSlug), 0);
  const originTotal = costData.categories.reduce((s, c) => s + costValueFor(c, originSlug), 0);
  const deltaPct = originTotal > 0 ? ((destTotal - originTotal) / originTotal) * 100 : 0;

  // ── Property ── (scoped to the viewing destination so a third city's
  // sample listings never inflate the dashboard counts)
  const destProps = properties.filter((p) => p.city === destSlug);
  const listingCount = destProps.length;
  const neighborhoods = new Set(destProps.map((p) => p.neighborhood));
  // Sea proximity only means something for a coastal destination (0 = inland).
  const seaProps = destProps.filter((p) => p.seaProximityKm > 0);
  const avgSeaKm =
    seaProps.length > 0
      ? seaProps.reduce((s, p) => s + p.seaProximityKm, 0) / seaProps.length
      : null;
  const avgSeaMi = avgSeaKm !== null ? (avgSeaKm * 0.621371).toFixed(1) : "N/A";
  // Why: migration 0019 may not yet be live in the same deploy as this code;
  // a missing table would 500 the entire dashboard. Catch and degrade to 0 so
  // the rest of the cockpit keeps rendering until the table lands.
  let savedCount = 0;
  try {
    savedCount = (await getSavedNeighborhoods()).length;
  } catch {
    // Fall back to 0 (already initialised); table likely not migrated yet.
  }

  // Determine overall risk posture from the destination city
  const riskScore =
    (destClimate.wildfire.score > 60 ? 1 : 0) +
    (destClimate.flood.annualChanceFlood > 0.01 ? 1 : 0) +
    (destCrime.summary.violentPer1k > destCrime.benchmarkNational.violentPer1k ? 1 : 0);
  const riskPosture = riskScore >= 2 ? "High" : riskScore === 1 ? "Moderate" : "Low";
  const riskTone: "ok" | "warn" | "danger" = riskScore >= 2 ? "danger" : riskScore === 1 ? "warn" : "ok";

  // ── Community ── (destination city)
  const destComm = communityArr.find((c) => c.city === destSlug) ?? communityArr[0];
  const avgTemp = destClimate.avgHighF;
  const vibeCount = destComm.vibeTags.length;
  const testimonialCount = destComm.testimonials.length;
  const topNeighborhood = destComm.testimonials[0]?.neighborhood ?? "—";

  // ── Checklist (live from Supabase) ──
  const totalTasks = items.length;
  const completedTasks = items.filter((i) => i.completed).length;
  const completePct = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;
  const phases = new Set(items.map((i) => i.category));
  const statutoryCount = items.filter(
    (i) => i.description?.toUpperCase().includes("STATUTORY") ?? false,
  ).length;

  // ── Quick Insights ── (dual-city where the data supports it, Wave D D.3)
  // Rough clear-days proxy from annual precipitation, clamped so a wetter city
  // never reads negative (the old /14 scaling went below zero for ~18in+ cities).
  const clearDays = (precipIn: number) =>
    Math.max(0, Math.min(365, Math.round(365 - precipIn * 6)));
  const sunnyDays = clearDays(destClimate.annualPrecipitationIn);
  const originClimate = getClimateProfile(originSlug);
  const originSunnyDays = clearDays(originClimate.annualPrecipitationIn);
  // Real per-city walkability (EPA National Walkability Index, C.8).
  const destWalk = getWalkabilityProfile(destSlug);
  const originWalk = getWalkabilityProfile(originSlug);
  const walkability = destWalk?.score ?? 0;
  const originWalkability = originWalk?.score ?? null;
  const walkabilityLabel = destWalk
    ? WALKABILITY_LABELS[destWalk.category]
    : "Unknown";

  // ── At-a-Glance budget row (AD-039: real data or no row at all) ──
  // Mirrors the MOVING COST tile: the chosen scenario when picked, else the
  // cheapest. No estimate started → null → the Budget row is hidden.
  let budget: { value: string; sub?: string } | null = null;
  if (estimate && estimate.scenarios.length > 0) {
    const chosen = estimate.chosen_scenario_id
      ? estimate.scenarios.find((s) => s.id === estimate.chosen_scenario_id)
      : undefined;
    const cheapest = [...estimate.scenarios].sort((a, b) => a.total - b.total)[0];
    const pick = chosen ?? cheapest;
    const usd = new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      maximumFractionDigits: 0,
    });
    budget = {
      value: usd.format(pick.total),
      sub: chosen ? "Chosen plan" : "Lowest plan",
    };
  }

  // ── At-a-Glance lease cell (row 3 swap) ──
  // Before target_move_out → LEASE NOTICE row (T-N or SENT).
  // After target_move_out → DEPOSIT WINDOW row (T-N to deposit_claim_window_end).
  // No lease → null; AtAGlance keeps showing the Risks row.
  const todayIso = todayInZoneIso();
  let leaseGlance: LeaseGlance | null = null;
  if (lease) {
    const moveOutIso = lease.target_move_out_date ?? lease.lease_end_date;
    const noticeSentEvent = events.find((e) => e.kind === "notice_sent");
    const noticeSent = Boolean(noticeSentEvent);
    if (todayIso > moveOutIso) {
      const depositEvent = events.find((e) => e.kind === "deposit_claim_window_end");
      const depositIso = depositEvent?.occurs_on ?? null;
      const daysUntil = daysUntilIso(depositIso, todayIso);
      leaseGlance = {
        exists: true,
        mode: "deposit-window",
        noticeSent,
        daysUntil,
        dateIso: depositIso,
        decision: lease.decision,
        noticeSentDate: noticeSentEvent?.occurs_on ?? null,
      };
    } else {
      const sendByEvent = events.find((e) => e.kind === "notice_send_by");
      const sendByIso = sendByEvent?.occurs_on ?? null;
      const daysUntil = daysUntilIso(sendByIso, todayIso);
      // When notice has been sent, the trailing date should be the send-by date
      // (per design — keeps the row anchored to the same calendar event).
      leaseGlance = {
        exists: true,
        mode: "lease-notice",
        noticeSent,
        daysUntil,
        dateIso: sendByIso,
        decision: lease.decision,
        noticeSentDate: noticeSentEvent?.occurs_on ?? null,
      };
    }
  }

  return {
    cost: {
      destTotal,
      deltaPct,
      categoryCount: costData.categories.length,
      destName,
      originName,
      sources: [
        ...new Set(
          costData.categories
            .map((c) => c.source)
            .filter((s): s is string => Boolean(s)),
        ),
      ],
    },
    property: {
      listingCount,
      neighborhoodCount: neighborhoods.size,
      savedCount,
      avgSeaMi,
      riskPosture,
      riskTone,
    },
    community: {
      vibeCount,
      avgTemp,
      testimonialCount,
      topNeighborhood,
      source: destComm.source ?? null,
    },
    air: {
      origin: {
        profile: getAirQualityProfile(originSlug),
        name: originName,
        code: ctx.originCode,
      },
      destination: {
        profile: getAirQualityProfile(destSlug),
        name: destName,
        code: ctx.destinationCode,
      },
    },
    climate: {
      origin: { profile: originClimate, name: originName, code: ctx.originCode },
      destination: { profile: destClimate, name: destName, code: ctx.destinationCode },
    },
    checklist: {
      totalTasks,
      completedTasks,
      completePct,
      phaseCount: phases.size,
      statutoryCount,
    },
    insights: {
      sunnyDays,
      originSunnyDays,
      walkability,
      originWalkability,
      walkabilityLabel,
      topNeighborhood,
      avgSeaMi,
      originName,
      destName,
    },
    glance: {
      riskPosture,
      riskTone,
    },
    leaseGlance,
    readiness,
    budget,
    // Journey-phase inputs (execution state; AD-039).
    noticeSent: events.some((e) => e.kind === "notice_sent"),
    leaseDecision: lease?.decision ?? null,
  };
}

const AT_RE = /^\d{4}-\d{2}-\d{2}$/;

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const rawRelocation = params.relocation;
  const relocationId =
    typeof rawRelocation === "string" ? rawRelocation : undefined;
  const { viewing, active } = await getViewingRelocation(relocationId);
  const viewCtx = moveContextFor(viewing);
  const activeCtx = moveContextFor(active);
  const isComparing = Boolean(viewing && active && viewing.id !== active.id);

  const data = await computeDashboardData(viewCtx);

  // Journey phase is execution state — always derived from the ACTIVE move,
  // even while a comparison relocation is being viewed (AD-039).
  const journeyPhase = deriveJourneyPhase({
    today: todayInZoneIso(),
    moveDate: activeCtx.moveDate,
    noticeSent: data.noticeSent,
    decision: data.leaseDecision,
  });
  const activeDays = daysUntilIso(activeCtx.moveDate);
  const arrived = activeDays !== null && activeDays < 0;
  const alerts = await getStatusAlerts();

  const rawAt = params.at;
  const atCandidate = Array.isArray(rawAt) ? rawAt[0] : rawAt;
  const at =
    typeof atCandidate === "string" && AT_RE.test(atCandidate)
      ? atCandidate
      : undefined;

  return (
    <div className="flex min-h-[calc(100svh-3rem)] flex-col gap-4 p-6">
      <OperationsHero context={viewCtx} journeyPhase={journeyPhase} />

      {isComparing && (
        <ComparingBanner viewCtx={viewCtx} activeCtx={activeCtx} />
      )}

      {/* The dense tile grid sits beside the right-rail journey/at-a-glance
          aside (AD-004). The wide instruments (map, timeline) + quick insights
          render full-width BELOW this row so they don't leave an empty 320px
          gutter beside the short aside (Wave F). */}
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
        <OperationsGrid
          cost={data.cost}
          property={data.property}
          community={data.community}
          checklist={data.checklist}
          air={data.air}
          climate={data.climate}
        />

        <aside className="flex flex-col gap-4">
          <JourneyPanel activePhase={journeyPhase} />
          <AtAGlance
            readiness={data.readiness}
            risk={data.glance}
            lease={data.leaseGlance}
            budget={data.budget}
          />
        </aside>
      </div>

      <RelocationMapTileServer context={viewCtx} />
      <MoveTimelineTile at={at} />
      <QuickInsights data={data.insights} />

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
        <DataSourcesPanel />
        <AllSystemsGo alertCount={alerts.length} arrived={arrived} />
      </div>
    </div>
  );
}

/* Shown when the viewed relocation isn't the active move: the reference tiles
   reflect the comparison, but the execution tiles still track the real move. */
function ComparingBanner({
  viewCtx,
  activeCtx,
}: {
  viewCtx: MoveContext;
  activeCtx: MoveContext;
}) {
  return (
    <div className="flex flex-wrap items-center gap-x-2 gap-y-1 rounded-[var(--radius-md)] border border-border bg-card/60 px-4 py-2.5 text-xs text-muted-foreground">
      <span>
        Comparing{" "}
        <span className="font-medium text-foreground">
          {viewCtx.originName} → {viewCtx.destinationName}
        </span>
        .
      </span>
      <span>
        Your checklist, lease, and move tasks still track your active move:{" "}
        <span className="font-medium text-foreground">
          {activeCtx.originName} → {activeCtx.destinationName}
        </span>
        .
      </span>
    </div>
  );
}
