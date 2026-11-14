import type { InsurancePolicy } from "@/schemas/lease";
import { addDaysIso, daysBetweenIso, todayInZoneIso } from "@/lib/dates";

// UTC throughout — same convention as the rest of the lease module so date-only
// ISO strings stay stable across TZs.
function isoToUtcMs(iso: string): number {
  return new Date(iso + "T00:00:00.000Z").getTime();
}

export interface CoverageGap {
  from: string;
  to: string;
  days: number;
}

/**
 * Detect uncovered windows between adjacent policies of the same scope.
 *
 * Sorts by `effective_from`; for each adjacent pair where `prev.effective_to`
 * is non-null and `next.effective_from` is more than a day after it, returns
 * the inclusive gap window (`from`/`to`) and its length in days. Open-ended
 * policies (`effective_to === null`) cover forward indefinitely so they
 * never originate a gap.
 */
export function detectGaps(policies: InsurancePolicy[]): CoverageGap[] {
  const sorted = [...policies].sort((a, b) =>
    a.effective_from.localeCompare(b.effective_from),
  );
  const gaps: CoverageGap[] = [];
  for (let i = 1; i < sorted.length; i++) {
    const prev = sorted[i - 1];
    const next = sorted[i];
    if (!prev.effective_to) continue;
    const expectedNext = addDaysIso(prev.effective_to, 1);
    if (next.effective_from > expectedNext) {
      const days = daysBetweenIso(prev.effective_to, next.effective_from) - 1;
      gaps.push({
        from: expectedNext,
        to: addDaysIso(next.effective_from, -1),
        days,
      });
    }
  }
  return gaps;
}

interface InsuranceCoverageTimelineProps {
  policies: InsurancePolicy[];
  leaseEndDate: string;
}

const VIEWBOX_W = 1000;
const VIEWBOX_H = 120;
const ROW_ORIGIN_Y = 30;
const ROW_DESTINATION_Y = 70;
const BAR_HEIGHT = 16;
const HAIRLINE_TOP = 10;
const HAIRLINE_BOTTOM = 110;

/**
 * Coverage timeline (inline SVG, AD-007 pattern).
 *
 * Two scope rows (origin top, destination bottom) horizontally laid out from
 * `min(effective_from)` → `max(effective_to ?? today + 30d)`. Today + lease_end
 * render as vertical hairlines. Gaps within a scope row are detected via
 * `detectGaps` and rendered as a `--danger` hatched region with "GAP · N DAYS".
 * Open-ended policies (effective_to = null) fade to right with "→ ongoing".
 */
export function InsuranceCoverageTimeline({
  policies,
  leaseEndDate,
}: InsuranceCoverageTimelineProps) {
  if (policies.length === 0) {
    return null;
  }

  const today = todayInZoneIso();

  const fromCandidates = policies.map((p) => isoToUtcMs(p.effective_from));
  const toCandidates = policies.map((p) =>
    p.effective_to ? isoToUtcMs(p.effective_to) : isoToUtcMs(addDaysIso(today, 30)),
  );
  // Always include today + lease_end so the hairlines stay inside the viewBox.
  fromCandidates.push(isoToUtcMs(today));
  fromCandidates.push(isoToUtcMs(leaseEndDate));
  toCandidates.push(isoToUtcMs(today));
  toCandidates.push(isoToUtcMs(leaseEndDate));

  const minMs = Math.min(...fromCandidates);
  const maxMs = Math.max(...toCandidates);
  const span = Math.max(1, maxMs - minMs);

  const xPos = (iso: string): number => {
    const t = isoToUtcMs(iso);
    return ((t - minMs) / span) * VIEWBOX_W;
  };

  const originPolicies = policies.filter((p) => p.scope === "origin");
  const destinationPolicies = policies.filter(
    (p) => p.scope === "destination",
  );

  const originGaps = detectGaps(originPolicies);
  const destinationGaps = detectGaps(destinationPolicies);

  return (
    <div className="w-full overflow-hidden">
      <svg
        viewBox={`0 0 ${VIEWBOX_W} ${VIEWBOX_H}`}
        width="100%"
        height={VIEWBOX_H}
        preserveAspectRatio="none"
        role="img"
        aria-label="Insurance coverage timeline by scope"
      >
        <defs>
          <pattern
            id="ins-gap-hatch"
            width="6"
            height="6"
            patternTransform="rotate(45)"
            patternUnits="userSpaceOnUse"
          >
            <line
              x1="0"
              y1="0"
              x2="0"
              y2="6"
              stroke="var(--danger)"
              strokeWidth="2"
              opacity="0.6"
            />
          </pattern>
          <linearGradient id="ins-fade-info" x1="0" x2="1" y1="0" y2="0">
            <stop offset="0%" stopColor="var(--info)" stopOpacity="0.9" />
            <stop offset="80%" stopColor="var(--info)" stopOpacity="0.9" />
            <stop offset="100%" stopColor="var(--info)" stopOpacity="0.05" />
          </linearGradient>
          <linearGradient id="ins-fade-coral" x1="0" x2="1" y1="0" y2="0">
            <stop
              offset="0%"
              stopColor="var(--brand-secondary)"
              stopOpacity="0.9"
            />
            <stop
              offset="80%"
              stopColor="var(--brand-secondary)"
              stopOpacity="0.9"
            />
            <stop
              offset="100%"
              stopColor="var(--brand-secondary)"
              stopOpacity="0.05"
            />
          </linearGradient>
        </defs>

        {/* Row baselines (hairline) */}
        <line
          x1="0"
          y1={ROW_ORIGIN_Y + BAR_HEIGHT / 2}
          x2={VIEWBOX_W}
          y2={ROW_ORIGIN_Y + BAR_HEIGHT / 2}
          stroke="var(--border)"
          strokeWidth="1"
          opacity="0.4"
        />
        <line
          x1="0"
          y1={ROW_DESTINATION_Y + BAR_HEIGHT / 2}
          x2={VIEWBOX_W}
          y2={ROW_DESTINATION_Y + BAR_HEIGHT / 2}
          stroke="var(--border)"
          strokeWidth="1"
          opacity="0.4"
        />

        {/* Row labels */}
        <text
          x="4"
          y={ROW_ORIGIN_Y - 4}
          fontFamily="var(--font-mono)"
          fontSize="9"
          fill="var(--muted-foreground)"
          letterSpacing="0.08em"
        >
          ORIGIN
        </text>
        <text
          x="4"
          y={ROW_DESTINATION_Y - 4}
          fontFamily="var(--font-mono)"
          fontSize="9"
          fill="var(--muted-foreground)"
          letterSpacing="0.08em"
        >
          DESTINATION
        </text>

        {/* Origin policy bars */}
        {originPolicies.map((p) => {
          const x1 = xPos(p.effective_from);
          const x2 = xPos(p.effective_to ?? addDaysIso(today, 30));
          const w = Math.max(2, x2 - x1);
          const ongoing = p.effective_to === null;
          return (
            <g key={p.id}>
              <rect
                x={x1}
                y={ROW_ORIGIN_Y}
                width={w}
                height={BAR_HEIGHT}
                fill={ongoing ? "url(#ins-fade-info)" : "var(--info)"}
                opacity={ongoing ? 1 : 0.85}
              />
              {ongoing && (
                <text
                  x={Math.min(x2 - 4, VIEWBOX_W - 4)}
                  y={ROW_ORIGIN_Y + BAR_HEIGHT - 4}
                  textAnchor="end"
                  fontFamily="var(--font-mono)"
                  fontSize="8"
                  fill="var(--muted-foreground)"
                >
                  → ongoing
                </text>
              )}
            </g>
          );
        })}

        {/* Destination policy bars */}
        {destinationPolicies.map((p) => {
          const x1 = xPos(p.effective_from);
          const x2 = xPos(p.effective_to ?? addDaysIso(today, 30));
          const w = Math.max(2, x2 - x1);
          const ongoing = p.effective_to === null;
          return (
            <g key={p.id}>
              <rect
                x={x1}
                y={ROW_DESTINATION_Y}
                width={w}
                height={BAR_HEIGHT}
                fill={
                  ongoing ? "url(#ins-fade-coral)" : "var(--brand-secondary)"
                }
                opacity={ongoing ? 1 : 0.85}
              />
              {ongoing && (
                <text
                  x={Math.min(x2 - 4, VIEWBOX_W - 4)}
                  y={ROW_DESTINATION_Y + BAR_HEIGHT - 4}
                  textAnchor="end"
                  fontFamily="var(--font-mono)"
                  fontSize="8"
                  fill="var(--muted-foreground)"
                >
                  → ongoing
                </text>
              )}
            </g>
          );
        })}

        {/* Gap hatching — origin row */}
        {originGaps.map((g) => {
          const x1 = xPos(g.from);
          const x2 = xPos(g.to);
          const w = Math.max(2, x2 - x1);
          return (
            <g key={`og-${g.from}`}>
              <rect
                x={x1}
                y={ROW_ORIGIN_Y}
                width={w}
                height={BAR_HEIGHT}
                fill="url(#ins-gap-hatch)"
              />
              <text
                x={x1 + w / 2}
                y={ROW_ORIGIN_Y - 2}
                textAnchor="middle"
                fontFamily="var(--font-mono)"
                fontSize="8"
                fill="var(--danger)"
                letterSpacing="0.08em"
              >
                GAP · {g.days}D
              </text>
            </g>
          );
        })}

        {/* Gap hatching — destination row */}
        {destinationGaps.map((g) => {
          const x1 = xPos(g.from);
          const x2 = xPos(g.to);
          const w = Math.max(2, x2 - x1);
          return (
            <g key={`dg-${g.from}`}>
              <rect
                x={x1}
                y={ROW_DESTINATION_Y}
                width={w}
                height={BAR_HEIGHT}
                fill="url(#ins-gap-hatch)"
              />
              <text
                x={x1 + w / 2}
                y={ROW_DESTINATION_Y - 2}
                textAnchor="middle"
                fontFamily="var(--font-mono)"
                fontSize="8"
                fill="var(--danger)"
                letterSpacing="0.08em"
              >
                GAP · {g.days}D
              </text>
            </g>
          );
        })}

        {/* Today hairline */}
        <line
          x1={xPos(today)}
          y1={HAIRLINE_TOP}
          x2={xPos(today)}
          y2={HAIRLINE_BOTTOM}
          stroke="var(--foreground)"
          strokeWidth="1"
          strokeDasharray="3 3"
          opacity="0.7"
        />
        <text
          x={xPos(today) + 3}
          y={HAIRLINE_TOP + 7}
          fontFamily="var(--font-mono)"
          fontSize="8"
          fill="var(--foreground)"
          letterSpacing="0.08em"
          opacity="0.85"
        >
          TODAY
        </text>

        {/* Lease-end hairline (only render if it's distinct from today) */}
        {leaseEndDate !== today && (
          <>
            <line
              x1={xPos(leaseEndDate)}
              y1={HAIRLINE_TOP}
              x2={xPos(leaseEndDate)}
              y2={HAIRLINE_BOTTOM}
              stroke="var(--brand-secondary)"
              strokeWidth="1"
              strokeDasharray="3 3"
              opacity="0.8"
            />
            <text
              x={xPos(leaseEndDate) + 3}
              y={HAIRLINE_TOP + 7}
              fontFamily="var(--font-mono)"
              fontSize="8"
              fill="var(--brand-secondary)"
              letterSpacing="0.08em"
            >
              LEASE END
            </text>
          </>
        )}
      </svg>
    </div>
  );
}
