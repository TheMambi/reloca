import Link from "next/link";
import { Check, X, FileText, Circle, CheckCircle2 } from "lucide-react";
import type {
  InsurancePolicy,
  LeaseTerms,
  Destination,
} from "@/schemas/lease";
import type { ChecklistItem } from "@/schemas";
import { safeHref } from "@/schemas/web-link";
import { InsuranceCoverageTimeline } from "./insurance-coverage-timeline";
import { InsurancePolicyDialogTrigger } from "./insurance-policy-form";

const fmtCurrency = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});

const MIN_LIABILITY = 100_000;
const MIN_PROPERTY = 5_000;

// Insurance-themed lease checklist titles. Match-by-prefix so wording can
// drift slightly without breaking the linkage.
const INSURANCE_TASK_PREFIXES = [
  "Confirm origin renter",
  "Set up destination renter",
  "Cancel/transfer origin policy",
];

interface InsuranceTransitionPanelProps {
  lease: LeaseTerms;
  policies: InsurancePolicy[];
  /** Lease-category checklist items (filtered upstream). */
  leaseChecklistItems: ChecklistItem[];
  /** Active destination, used to pre-fill the destination policy form. */
  activeDestination: Destination | null;
}

/**
 * Insurance Transition Panel (design §4.2).
 *
 * RSC: math + SVG render server-side. Three regions stacked:
 *  1. Coverage timeline (inline SVG, AD-007 pattern)
 *  2. Compliance grid (one row per scope; latest-by-effective_from per scope)
 *  3. Lease-tied checklist tasks (read-only mirrors of /checklist)
 *
 * The landlord insurance hint surfaces below the grid when the
 * origin scope is missing a policy OR the listed policy doesn't carry the
 * required Interested Party.
 */
export function InsuranceTransitionPanel({
  lease,
  policies,
  leaseChecklistItems,
  activeDestination,
}: InsuranceTransitionPanelProps) {
  const originLatest = latestByScope(policies, "origin");
  const destinationLatest = latestByScope(policies, "destination");

  const originHasInterestedParty =
    originLatest?.interested_party_listed === true &&
    Boolean(originLatest.interested_party_name);
  const showLandlordInsuranceHint = !originLatest || !originHasInterestedParty;

  const destinationLabel = activeDestination
    ? `${activeDestination.street_address}, ${activeDestination.city}`
    : "";

  // Filter to the 3 insurance-themed tasks. Match by title prefix to stay
  // resilient to minor copy changes upstream.
  const insuranceTasks = leaseChecklistItems
    .filter((t) =>
      INSURANCE_TASK_PREFIXES.some((p) => t.title.startsWith(p)),
    )
    .sort((a, b) => a.order_index - b.order_index);

  return (
    <section
      aria-labelledby="insurance-transition-heading"
      className="rounded-[var(--radius-md)] border border-border bg-card"
    >
      <header className="border-b border-border px-6 py-4">
        <span
          id="insurance-transition-heading"
          className="label-cap text-[10px] text-muted-foreground"
        >
          RENTERS INSURANCE
        </span>
        <p className="mt-1 text-sm font-medium text-foreground">
          Coverage from your current home to your future home
        </p>
        <p className="text-xs text-muted-foreground">
          See your active policy, any gap days, and whether the coverage meets
          what your landlord requires.
        </p>
      </header>

      {/* ── Region 1: Timeline ─────────────────────────────────────────── */}
      <div className="border-b border-border px-6 py-5">
        <div className="mb-3 flex items-baseline justify-between gap-2">
          <span className="label-cap text-[10px] text-muted-foreground">
            COVERAGE TIMELINE
          </span>
          {policies.length > 0 && (
            <span className="label-cap text-[9px] text-muted-foreground">
              {policies.length}{" "}
              {policies.length === 1 ? "POLICY" : "POLICIES"}
            </span>
          )}
        </div>
        {policies.length === 0 ? (
          <EmptyTimelineState />
        ) : (
          <InsuranceCoverageTimeline
            policies={policies}
            leaseEndDate={lease.lease_end_date}
          />
        )}
      </div>

      {/* ── Region 2: Coverage check grid ──────────────────────────────── */}
      <div className="border-b border-border px-6 py-5">
        <span className="label-cap text-[10px] text-muted-foreground">
          COVERAGE CHECK
        </span>

        {/* Desktop: dense table */}
        <table className="mt-3 hidden w-full border-collapse text-sm sm:table">
          <thead>
            <tr className="border-b border-border">
              <Th>WHICH HOME</Th>
              <Th>INSURER</Th>
              <Th>LIABILITY</Th>
              <Th>BELONGINGS</Th>
              <Th>LANDLORD ON POLICY</Th>
              <Th>POLICY DOC</Th>
              <Th align="right">ACTIONS</Th>
            </tr>
          </thead>
          <tbody>
            <ComplianceTableRow
              scopeLabel="Current home"
              policy={originLatest}
              addPropertyLabel={`${lease.unit_address}, ${lease.city}`}
              addScope="origin"
            />
            <ComplianceTableRow
              scopeLabel="Future home"
              policy={destinationLatest}
              addPropertyLabel={destinationLabel}
              addScope="destination"
            />
          </tbody>
        </table>

        {/* Mobile: 2-column key/value list per home */}
        <div className="mt-3 flex flex-col gap-3 sm:hidden">
          <ComplianceMobileBlock
            scopeLabel="Current home"
            policy={originLatest}
            addPropertyLabel={`${lease.unit_address}, ${lease.city}`}
            addScope="origin"
          />
          <ComplianceMobileBlock
            scopeLabel="Future home"
            policy={destinationLatest}
            addPropertyLabel={destinationLabel}
            addScope="destination"
          />
        </div>

        {showLandlordInsuranceHint && (
          <div className="mt-4 rounded-[var(--radius-sm)] border border-[oklch(var(--warn-raw)/0.3)] bg-[oklch(var(--warn-raw)/0.08)] px-3 py-2.5 text-xs leading-relaxed text-foreground">
            <span className="label-cap mr-1 text-[10px] text-[var(--warn)]">
              LANDLORD REQUIREMENTS
            </span>
            <span>
              Many landlords require renters insurance through your
              move-out date and ask to be listed on the policy as an
              interested party. Check your lease for the minimum coverage
              and who to list.
            </span>
          </div>
        )}
      </div>

      {/* ── Region 3: Related checklist tasks ──────────────────────────── */}
      <div className="px-6 py-5">
        <div className="mb-3 flex items-baseline justify-between gap-2">
          <span className="label-cap text-[10px] text-muted-foreground">
            RELATED CHECKLIST TASKS
          </span>
          <Link
            href="/checklist#lease"
            className="label-cap text-[9px] tracking-wider text-muted-foreground hover:text-foreground"
          >
            OPEN CHECKLIST →
          </Link>
        </div>

        {insuranceTasks.length === 0 ? (
          <p className="text-xs text-muted-foreground">
            Tasks will appear here once you&rsquo;ve added your lease.
          </p>
        ) : (
          <ul className="flex flex-col divide-y divide-border/60 rounded-[var(--radius-sm)] border border-border/60 bg-background/40">
            {insuranceTasks.map((t) => (
              <li key={t.id}>
                <Link
                  href="/checklist#lease"
                  className="group flex w-full items-start gap-3 px-3 py-2.5 transition-colors hover:bg-popover/60"
                >
                  {t.completed ? (
                    <CheckCircle2
                      className="mt-0.5 size-4 shrink-0 text-[var(--ok)]"
                      strokeWidth={1.75}
                    />
                  ) : (
                    <Circle
                      className="mt-0.5 size-4 shrink-0 text-border transition-colors group-hover:text-foreground/60"
                      strokeWidth={1.75}
                    />
                  )}
                  <div className="min-w-0 flex-1">
                    <p
                      className={`text-xs ${
                        t.completed
                          ? "text-muted-foreground line-through"
                          : "text-foreground"
                      }`}
                    >
                      {t.title}
                    </p>
                  </div>
                  {t.due_date && (
                    <span className="mono-num shrink-0 text-[10px] text-muted-foreground">
                      {t.due_date}
                    </span>
                  )}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}

// ── helpers ───────────────────────────────────────────────────────────────

function latestByScope(
  policies: InsurancePolicy[],
  scope: "origin" | "destination",
): InsurancePolicy | null {
  const subset = policies.filter((p) => p.scope === scope);
  if (subset.length === 0) return null;
  return [...subset].sort((a, b) =>
    b.effective_from.localeCompare(a.effective_from),
  )[0];
}

function Th({
  children,
  align = "left",
}: {
  children: React.ReactNode;
  align?: "left" | "right";
}) {
  return (
    <th
      scope="col"
      className={`label-cap py-2 text-[9px] font-medium text-muted-foreground ${
        align === "right" ? "text-right" : "text-left"
      }`}
    >
      {children}
    </th>
  );
}

// ── compliance row variants ───────────────────────────────────────────────

interface ComplianceRowProps {
  scopeLabel: string;
  policy: InsurancePolicy | null;
  addPropertyLabel: string;
  addScope: "origin" | "destination";
}

function ComplianceTableRow({
  scopeLabel,
  policy,
  addPropertyLabel,
  addScope,
}: ComplianceRowProps) {
  if (!policy) {
    return (
      <tr className="border-b border-border last:border-b-0">
        <td className="py-3 text-sm text-foreground">{scopeLabel}</td>
        <td colSpan={5} className="py-3 text-xs text-muted-foreground">
          — not yet added —
        </td>
        <td className="py-3 text-right">
          <InsurancePolicyDialogTrigger
            initialScope={addScope}
            defaultPropertyLabel={addPropertyLabel}
            variant="primary"
          />
        </td>
      </tr>
    );
  }

  return (
    <tr className="border-b border-border last:border-b-0">
      <td className="py-3 align-top text-sm text-foreground">{scopeLabel}</td>
      <td className="py-3 align-top">
        <p className="text-xs text-foreground">{policy.carrier ?? "—"}</p>
        {policy.policy_number && (
          <p className="mono-num text-[10px] text-muted-foreground">
            {policy.policy_number}
          </p>
        )}
      </td>
      <td className="py-3 align-top">
        <LiabilityCell amount={policy.liability_amount} />
      </td>
      <td className="py-3 align-top">
        <PropertyCell amount={policy.personal_property_amount} />
      </td>
      <td className="py-3 align-top">
        <InterestedPartyCell
          listed={policy.interested_party_listed}
          name={policy.interested_party_name}
        />
      </td>
      <td className="py-3 align-top">
        <DocCell url={policy.document_url} />
      </td>
      <td className="py-3 text-right align-top">
        <InsurancePolicyDialogTrigger
          label="Edit"
          policy={policy}
          variant="ghost"
        />
      </td>
    </tr>
  );
}

function ComplianceMobileBlock({
  scopeLabel,
  policy,
  addPropertyLabel,
  addScope,
}: ComplianceRowProps) {
  if (!policy) {
    return (
      <div className="rounded-[var(--radius-sm)] border border-border/60 bg-background/40 px-3 py-3">
        <div className="flex items-center justify-between">
          <p className="text-sm font-medium text-foreground">{scopeLabel}</p>
          <span className="label-cap text-[9px] text-muted-foreground">
            NOT YET ADDED
          </span>
        </div>
        <div className="mt-3">
          <InsurancePolicyDialogTrigger
            initialScope={addScope}
            defaultPropertyLabel={addPropertyLabel}
            variant="primary"
          />
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-[var(--radius-sm)] border border-border/60 bg-background/40 px-3 py-3">
      <div className="mb-2 flex items-center justify-between">
        <p className="text-sm font-medium text-foreground">{scopeLabel}</p>
        <InsurancePolicyDialogTrigger
          label="Edit"
          policy={policy}
          variant="ghost"
        />
      </div>
      <dl className="grid grid-cols-[6.5rem_1fr] gap-x-3 gap-y-1.5 text-xs">
        <KvKey>Insurer</KvKey>
        <dd className="text-foreground">{policy.carrier ?? "—"}</dd>
        {policy.policy_number && (
          <>
            <KvKey>Policy #</KvKey>
            <dd className="mono-num text-foreground">{policy.policy_number}</dd>
          </>
        )}
        <KvKey>Liability</KvKey>
        <dd>
          <LiabilityCell amount={policy.liability_amount} />
        </dd>
        <KvKey>Belongings</KvKey>
        <dd>
          <PropertyCell amount={policy.personal_property_amount} />
        </dd>
        <KvKey>Landlord on policy</KvKey>
        <dd>
          <InterestedPartyCell
            listed={policy.interested_party_listed}
            name={policy.interested_party_name}
          />
        </dd>
        <KvKey>Policy doc</KvKey>
        <dd>
          <DocCell url={policy.document_url} />
        </dd>
      </dl>
    </div>
  );
}

function KvKey({ children }: { children: React.ReactNode }) {
  return (
    <dt className="label-cap text-[9px] text-muted-foreground">{children}</dt>
  );
}

// ── compliance cell renderers ─────────────────────────────────────────────

function LiabilityCell({ amount }: { amount: number }) {
  const meets = amount >= MIN_LIABILITY;
  return (
    <span className="mono-num inline-flex items-center gap-1 text-xs text-foreground">
      {fmtCurrency.format(amount)}
      {meets ? (
        <Check
          className="size-3 text-[var(--ok)]"
          strokeWidth={2}
          aria-label="Meets minimum"
        />
      ) : (
        <span className="inline-flex items-center gap-1">
          <X
            className="size-3 text-[var(--danger)]"
            strokeWidth={2}
            aria-label="Below minimum"
          />
          <span className="label-cap text-[9px] text-[var(--danger)]">
            MIN {fmtCurrency.format(MIN_LIABILITY)}
          </span>
        </span>
      )}
    </span>
  );
}

function PropertyCell({ amount }: { amount: number }) {
  const meets = amount >= MIN_PROPERTY;
  return (
    <span className="mono-num inline-flex items-center gap-1 text-xs text-foreground">
      {fmtCurrency.format(amount)}
      {meets ? (
        <Check
          className="size-3 text-[var(--ok)]"
          strokeWidth={2}
          aria-label="Meets minimum"
        />
      ) : (
        <span className="inline-flex items-center gap-1">
          <X
            className="size-3 text-[var(--danger)]"
            strokeWidth={2}
            aria-label="Below minimum"
          />
          <span className="label-cap text-[9px] text-[var(--danger)]">
            MIN {fmtCurrency.format(MIN_PROPERTY)}
          </span>
        </span>
      )}
    </span>
  );
}

function InterestedPartyCell({
  listed,
  name,
}: {
  listed: boolean;
  name: string | null;
}) {
  if (listed && name) {
    return (
      <span className="inline-flex items-center gap-1 text-xs text-foreground">
        <span>{name}</span>
        <Check
          className="size-3 text-[var(--ok)]"
          strokeWidth={2}
          aria-label="Landlord listed on policy as required"
        />
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 text-xs">
      <X
        className="size-3 text-[var(--warn)]"
        strokeWidth={2}
        aria-label="Landlord not listed on policy"
      />
      <span className="text-[var(--warn)]">Not listed</span>
    </span>
  );
}

function DocCell({ url }: { url: string | null }) {
  const href = safeHref(url);
  if (!href) return <span className="text-xs text-muted-foreground">—</span>;
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center gap-1 text-xs text-[var(--info)] underline-offset-2 hover:underline"
    >
      <FileText className="size-3" strokeWidth={1.75} />
      <span>doc</span>
    </a>
  );
}

// ── empty timeline state ──────────────────────────────────────────────────

function EmptyTimelineState() {
  return (
    <div className="flex flex-col items-center gap-2 rounded-[var(--radius-sm)] border border-dashed border-border/70 bg-background/40 px-4 py-6 text-center">
      <p className="label-cap text-[10px] text-muted-foreground">
        NO POLICIES YET
      </p>
      <p className="text-xs text-muted-foreground">
        Add an origin or destination policy to render the coverage timeline.
      </p>
    </div>
  );
}
