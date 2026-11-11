// Move timeline tile (Task 7.36).
//
// Full-width inline-SVG horizontal strip that visualises every dated event in
// the relocation — lease milestones, checklist items with due dates, scheduled
// utility cutovers, address-update deadlines. Per AD-007 we render with inline
// SVG rather than reaching for Recharts or D3 (the strip is read-only and the
// shapes are simple). Per AD-006 dates format through `Intl.DateTimeFormat`
// (no date-fns).
//
// Cursor lives in the `?at=YYYY-MM-DD` URL search param; the page-level RSC
// validates and forwards it. If `at` falls outside the strip's [start,end]
// window, the cursor is omitted rather than clamped (so a stale URL doesn't
// silently lie about where the user is in time).

import {
  getTimelineEvents,
  getTimelineWindow,
  todayIso,
  type TimelineEvent,
  type TimelineSource,
  type TimelineTone,
} from "@/lib/data/timeline";
import { getActiveMoveContext } from "@/lib/data/relocation-db";

const TONE_COLOR: Record<TimelineTone, string> = {
  ok: "var(--ok)",
  warn: "var(--warn)",
  info: "var(--info)",
  danger: "var(--danger)",
  neutral: "var(--muted-foreground)",
};

// Plain-English meaning for each dot colour, so the strip is readable at a
// glance instead of a row of unexplained dots (Wave D, D.3). Only the tones
// actually present in the events get a legend chip.
const TONE_LEGEND: Record<TimelineTone, string> = {
  ok: "Done",
  info: "Scheduled",
  neutral: "Planned",
  warn: "Key date",
  danger: "Overdue",
};

const TONE_LEGEND_ORDER: TimelineTone[] = [
  "ok",
  "info",
  "neutral",
  "warn",
  "danger",
];

const SOURCE_HREF: Record<TimelineSource, string> = {
  lease: "/lease",
  lease_event: "/lease",
  checklist: "/checklist",
  utility: "/transitions?tab=utilities",
  address: "/transitions?tab=address-updates",
};

const SVG_HEIGHT = 64;
const BASELINE_Y = 32;
const CIRCLE_R = 5;

const dateFmt = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
});

function isoToUtcMillis(iso: string): number {
  return new Date(`${iso}T00:00:00.000Z`).getTime();
}

function daysBetween(startIso: string, endIso: string): number {
  return (isoToUtcMillis(endIso) - isoToUtcMillis(startIso)) / 86_400_000;
}

function isoAtFraction(startIso: string, endIso: string, fraction: number): string {
  const startMs = isoToUtcMillis(startIso);
  const endMs = isoToUtcMillis(endIso);
  const ms = startMs + (endMs - startMs) * fraction;
  return new Date(ms).toISOString().slice(0, 10);
}

function formatLabelDate(iso: string): string {
  // ISO strings are calendar dates, not instants; force UTC so en-US doesn't
  // cross a midnight boundary in the user's local zone and shift "Apr 1" to
  // "Mar 31".
  return dateFmt.format(new Date(`${iso}T00:00:00.000Z`));
}

/** Returns the event's horizontal position as an SVG percentage string,
 *  e.g. "37.5%". We deliberately drop viewBox so circles render in true
 *  pixel space — viewBox + preserveAspectRatio="none" turned them into
 *  ovals at viewports wider than the implied 1000-unit canvas. */
function eventToXPercent(
  event: TimelineEvent,
  startIso: string,
  totalDays: number,
): string {
  if (totalDays <= 0) return "0%";
  const fromStart = daysBetween(startIso, event.at);
  const pct = Math.max(0, Math.min(100, (fromStart / totalDays) * 100));
  return `${pct}%`;
}

function summariseAriaLabel(
  events: TimelineEvent[],
  startIso: string,
  endIso: string,
): string {
  if (events.length === 0) {
    return "Move timeline. No dated events yet.";
  }
  const startLabel = formatLabelDate(startIso);
  const endLabel = formatLabelDate(endIso);
  const noun = events.length === 1 ? "event" : "events";
  return `Move timeline showing ${events.length} ${noun} between ${startLabel} and ${endLabel}.`;
}

export async function MoveTimelineTile({ at }: { at?: string }) {
  const [allEvents, { moveDate }] = await Promise.all([
    getTimelineEvents(),
    getActiveMoveContext(),
  ]);
  const today = todayIso();
  const cursorIso = at ?? today;
  const { start, end } = getTimelineWindow(allEvents, today, moveDate);
  // Post-move the window brackets the move (AD-039); anything earlier is
  // discharged history and drops off the strip rather than rendering at a
  // negative x-position.
  const events = allEvents.filter((e) => e.at >= start && e.at <= end);
  const totalDays = daysBetween(start, end);

  const isEmpty = events.length === 0;
  const cursorVisible =
    !isEmpty && cursorIso >= start && cursorIso <= end && totalDays > 0;
  const cursorXPercent = cursorVisible
    ? `${Math.max(0, Math.min(100, (daysBetween(start, cursorIso) / totalDays) * 100))}%`
    : null;

  const quartileLabels = [
    formatLabelDate(start),
    formatLabelDate(isoAtFraction(start, end, 0.25)),
    formatLabelDate(isoAtFraction(start, end, 0.75)),
    formatLabelDate(end),
  ];

  const usedTones = TONE_LEGEND_ORDER.filter((t) =>
    events.some((e) => e.tone === t),
  );
  const cursorCaption = cursorVisible
    ? cursorIso === today
      ? "Today"
      : formatLabelDate(cursorIso)
    : null;

  return (
    <section
      aria-label="Move timeline"
      className="overflow-hidden rounded-[var(--radius-lg)] border border-border bg-card"
    >
      <div className="flex items-center justify-between border-b border-border px-4 py-2 text-[10px]">
        <span className="label-cap text-muted-foreground">Move timeline</span>
        <span className="label-cap text-muted-foreground">
          {isEmpty
            ? "No dated events"
            : `${events.length} ${events.length === 1 ? "event" : "events"}`}
        </span>
      </div>

      <div className="px-4 py-4">
        <div className="mono-num grid grid-cols-4 text-[10px] text-muted-foreground">
          <span className="text-left">{quartileLabels[0]}</span>
          <span className="text-center">{quartileLabels[1]}</span>
          <span className="text-center">{quartileLabels[2]}</span>
          <span className="text-right">{quartileLabels[3]}</span>
        </div>

        <svg
          role="img"
          aria-label={summariseAriaLabel(events, start, end)}
          width="100%"
          height={SVG_HEIGHT}
          className="mt-2 block"
        >
          <line
            x1="0"
            y1={BASELINE_Y}
            x2="100%"
            y2={BASELINE_Y}
            stroke="var(--border)"
            strokeWidth={1}
          />

          {!isEmpty &&
            events.map((event, i) => {
              const cx = eventToXPercent(event, start, totalDays);
              const fill = TONE_COLOR[event.tone];
              const href = SOURCE_HREF[event.source];
              const titleText = `${event.label} — ${formatLabelDate(event.at)}`;
              return (
                <a
                  key={`${event.source}-${event.source_id}-${i}`}
                  href={href}
                >
                  {/* A card-coloured ring separates overlapping dots when two
                      events fall on near-identical dates. */}
                  <circle
                    cx={cx}
                    cy={BASELINE_Y}
                    r={CIRCLE_R}
                    fill={fill}
                    stroke="var(--card)"
                    strokeWidth={1.5}
                  >
                    <title>{titleText}</title>
                  </circle>
                </a>
              );
            })}

          {cursorXPercent !== null && (
            <line
              x1={cursorXPercent}
              y1={0}
              x2={cursorXPercent}
              y2={SVG_HEIGHT}
              stroke="var(--brand)"
              strokeWidth={1}
            />
          )}
        </svg>

        {isEmpty ? (
          <p className="mt-2 text-xs italic text-muted-foreground">
            No dated events yet.
          </p>
        ) : (
          <div className="mt-3 flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-t border-border/60 pt-3">
            <ul className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
              {usedTones.map((tone) => (
                <li key={tone} className="flex items-center gap-1.5">
                  <span
                    aria-hidden="true"
                    className="size-2 shrink-0 rounded-full"
                    style={{ backgroundColor: TONE_COLOR[tone] }}
                  />
                  <span className="text-[10px] text-muted-foreground">
                    {TONE_LEGEND[tone]}
                  </span>
                </li>
              ))}
            </ul>
            {cursorCaption && (
              <span className="flex items-center gap-1.5">
                <span
                  aria-hidden="true"
                  className="inline-block h-3 w-px shrink-0 bg-[var(--brand)]"
                />
                <span className="mono-num text-[10px] text-muted-foreground">
                  {cursorCaption}
                </span>
              </span>
            )}
          </div>
        )}
      </div>
    </section>
  );
}
