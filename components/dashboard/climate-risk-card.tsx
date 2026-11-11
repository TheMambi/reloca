import { ShieldAlert } from "lucide-react";
import { ModuleCard } from "./operations-grid";
import { SourceTag } from "@/components/shared/source-tag";
import type { ClimateProfile } from "@/schemas";

// Reference-driven climate & environmental-risk tile (Wave E, E.1). Surfaces the
// highest-signal figures from the risk drilldown's climate section on the main
// dashboard — flood, wildfire, hot days, earthquake (+ sea-level where it
// matters) — for BOTH the viewing relocation's origin and destination, so it's
// always clear which city each figure is for. Tone logic mirrors the drilldown
// (app/properties/[neighborhood]/page.tsx) so the two surfaces agree.

type Tone = "ok" | "warn" | "danger" | "muted";

const TONE_TEXT: Record<Tone, string> = {
  ok: "text-[var(--ok)]",
  warn: "text-[var(--warn)]",
  danger: "text-[var(--danger)]",
  muted: "text-muted-foreground",
};

// FEMA flood zone + earthquake/sea-level enums → tone (same mapping as the
// drilldown's riskTone).
function riskTone(level: string): Tone {
  switch (level) {
    case "none":
    case "low":
    case "X":
      return "ok";
    case "moderate":
    case "B":
      return "warn";
    case "significant":
    case "high":
    case "A":
    case "AE":
    case "VE":
      return "danger";
    default:
      return "muted";
  }
}

// FEMA zone codes are domain jargon (User-facing copy rule) — show a plain word,
// keep the code + annual chance in the tooltip.
const FLOOD_LABEL: Record<string, string> = {
  X: "Minimal",
  B: "Moderate",
  A: "High",
  AE: "High",
  VE: "High",
};

function cap(s: string): string {
  return s.length ? s[0].toUpperCase() + s.slice(1) : s;
}

type Metric = { label: string; value: string; tone: Tone; title?: string };

function metricsFor(c: ClimateProfile, includeSea: boolean): Metric[] {
  const rows: Metric[] = [
    {
      label: "Flood risk",
      value: FLOOD_LABEL[c.flood.femaTier] ?? c.flood.femaTier,
      tone: riskTone(c.flood.femaTier),
      title: `FEMA zone ${c.flood.femaTier} · ${(c.flood.annualChanceFlood * 100).toFixed(2)}% annual chance`,
    },
    {
      label: "Wildfire",
      value: `${c.wildfire.score}/100`,
      tone: c.wildfire.score > 60 ? "danger" : c.wildfire.score > 30 ? "warn" : "ok",
      title:
        c.wildfire.nearestActiveZoneKm !== null
          ? `Nearest high-risk zone ~${c.wildfire.nearestActiveZoneKm} km`
          : undefined,
    },
    {
      label: "Hot days",
      value: `${c.heatDaysPerYear}/yr`,
      tone: c.heatDaysPerYear > 50 ? "danger" : c.heatDaysPerYear > 20 ? "warn" : "ok",
      title: "Days at or above 90°F per year",
    },
    {
      label: "Earthquake",
      value: cap(c.earthquake.riskLevel),
      tone: riskTone(c.earthquake.riskLevel),
      title: c.earthquake.lastMajorEvent ?? undefined,
    },
  ];
  if (includeSea) {
    rows.push({
      label: "Sea-level rise",
      value: cap(c.seaLevelRise.exposure),
      tone: riskTone(c.seaLevelRise.exposure),
      title:
        c.seaLevelRise.projection2050cm !== null
          ? `+${c.seaLevelRise.projection2050cm} cm projected by 2050`
          : "Inland — no coastal exposure",
    });
  }
  return rows;
}

export type CityClimate = {
  profile: ClimateProfile;
  name: string;
  code: string;
};

function CityClimatePanel({
  city,
  includeSea,
}: {
  city: CityClimate;
  includeSea: boolean;
}) {
  const rows = metricsFor(city.profile, includeSea);
  return (
    <div className="rounded-[var(--radius-md)] border border-border/70 bg-background/40 p-3">
      <p className="label-cap text-[10px] text-muted-foreground">
        {city.code} · {city.name}
      </p>
      <dl className="mt-2 space-y-1.5">
        {rows.map((r) => (
          <div key={r.label} className="flex items-center justify-between gap-2">
            <dt className="text-[11px] text-muted-foreground">{r.label}</dt>
            <dd
              className={`mono-num text-xs font-medium ${TONE_TEXT[r.tone]}`}
              title={r.title}
            >
              {r.value}
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

export function ClimateRiskCard({
  origin,
  destination,
}: {
  origin: CityClimate;
  destination: CityClimate;
}) {
  // Sea-level rise only earns a row when at least one city is exposed (it reads
  // "None" for inland pairs, which is noise). Show it for both when shown so the
  // two columns stay row-aligned.
  const includeSea =
    origin.profile.seaLevelRise.exposure !== "none" ||
    destination.profile.seaLevelRise.exposure !== "none";
  const sourceId = destination.profile.source ?? origin.profile.source ?? null;

  return (
    <ModuleCard
      href="/properties"
      ctaLabel="Open"
      icon={<ShieldAlert className="size-5" strokeWidth={1.75} />}
      iconClass="text-[var(--warn)]"
      iconBg="bg-[var(--warn)]/14"
      code="CLIMATE & RISK"
      title="Climate & risk"
      description="Environmental risk, both cities."
      metaRow={
        <div className="grid flex-1 grid-cols-1 gap-3 sm:grid-cols-2">
          <CityClimatePanel city={origin} includeSea={includeSea} />
          <CityClimatePanel city={destination} includeSea={includeSea} />
        </div>
      }
      footnote={<SourceTag id={sourceId} />}
    />
  );
}
