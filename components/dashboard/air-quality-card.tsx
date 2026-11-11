import { Wind } from "lucide-react";
import { ModuleCard } from "./operations-grid";
import { SourceTag } from "@/components/shared/source-tag";
import { isStale, STALE_AFTER_DAYS } from "@/lib/data/staleness";
import type { AirQualityProfile } from "@/schemas";

// Reference-driven air-quality tile (Phase 8 Wave C C.7, dual-city in Wave D
// D.2). A point-in-time EPA AirNow reading for BOTH the origin and destination
// of the viewing relocation — so you can see how the air you're leaving
// compares to the air you're moving to (Denver ozone vs. Long Beach coastal,
// Sacramento Central-Valley smoke, etc.).

const MONTHS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

const PARAM_LABELS: Record<string, string> = {
  O3: "Ozone",
  "PM2.5": "Fine particles",
  PM10: "Coarse particles",
  NO2: "Nitrogen dioxide",
  CO: "Carbon monoxide",
  SO2: "Sulfur dioxide",
};

// AQI bands → status tone. Good is reassuring (ok); Moderate / sensitive-group
// is a heads-up (warn); Unhealthy and worse is a real warning (danger).
const CATEGORY_TONE: Record<string, "ok" | "warn" | "danger"> = {
  Good: "ok",
  Moderate: "warn",
  "Unhealthy for Sensitive Groups": "warn",
  Unhealthy: "danger",
  "Very Unhealthy": "danger",
  Hazardous: "danger",
};

const TONE_TEXT: Record<"ok" | "warn" | "danger" | "default", string> = {
  ok: "text-[var(--ok)]",
  warn: "text-[var(--warn)]",
  danger: "text-[var(--danger)]",
  default: "text-foreground",
};

function formatObserved(s: string): string {
  // "2026-05-30 15:00 PST" → "May 30, 2026, 3:00 PM PST". The year stays in —
  // dropping it let a six-week-old snapshot pass for current (AD-041).
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})\s+(\d{2}):(\d{2})\s+(\w+)$/);
  if (!m) return s;
  const [, yyyy, mm, dd, hh, min, tz] = m;
  const month = MONTHS[Number(mm) - 1] ?? mm;
  let h = Number(hh);
  const ampm = h >= 12 ? "PM" : "AM";
  h = h % 12 || 12;
  return `${month} ${Number(dd)}, ${yyyy}, ${h}:${min} ${ampm} ${tz}`;
}

export type CityAir = {
  profile: AirQualityProfile | null;
  name: string;
  code: string;
};

function CityAirPanel({ city }: { city: CityAir }) {
  const { profile, name, code } = city;
  const tone = profile
    ? CATEGORY_TONE[profile.category] ?? "default"
    : "default";
  const dominant = profile?.dominantParameter
    ? PARAM_LABELS[profile.dominantParameter] ?? profile.dominantParameter
    : "—";

  return (
    <div className="rounded-[var(--radius-md)] border border-border/70 bg-background/40 p-3">
      <p className="label-cap text-[10px] text-muted-foreground">
        {code} · {name}
      </p>
      {profile ? (
        <>
          <div className="mt-1.5 flex items-baseline gap-1.5">
            <span className={`mono-num text-2xl font-semibold ${TONE_TEXT[tone]}`}>
              {profile.aqi}
            </span>
            <span className="label-cap text-[9px] text-muted-foreground">AQI</span>
            <span className={`ml-auto text-xs font-medium ${TONE_TEXT[tone]}`}>
              {profile.category}
            </span>
          </div>
          <p className="mt-1.5 text-[10px] leading-snug text-muted-foreground">
            Main pollutant: {dominant}
          </p>
          {isStale(profile.observedAt, STALE_AFTER_DAYS.airQuality) ? (
            <p className="text-[10px] leading-snug text-[var(--warn)]">
              Older snapshot · {formatObserved(profile.observedAt)}
            </p>
          ) : (
            <p className="text-[10px] leading-snug text-muted-foreground">
              {formatObserved(profile.observedAt)}
            </p>
          )}
        </>
      ) : (
        <p className="mt-2 text-xs italic text-muted-foreground">
          No recent reading
        </p>
      )}
    </div>
  );
}

export function AirQualityCard({
  origin,
  destination,
}: {
  origin: CityAir;
  destination: CityAir;
}) {
  // Both cities pull from the same EPA AirNow source; tag it once.
  const sourceId = destination.profile?.source ?? origin.profile?.source ?? null;

  return (
    <ModuleCard
      icon={<Wind className="size-5" strokeWidth={1.75} />}
      iconClass="text-[var(--info)]"
      iconBg="bg-[var(--info)]/14"
      code="AIR QUALITY"
      title="Air quality"
      description="Latest readings on record, both cities."
      metaRow={
        <div className="grid flex-1 grid-cols-1 gap-3 sm:grid-cols-2">
          <CityAirPanel city={origin} />
          <CityAirPanel city={destination} />
        </div>
      }
      footnote={<SourceTag id={sourceId} />}
    />
  );
}
