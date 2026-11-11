import { Sun, Footprints, Waves, Sparkles } from "lucide-react";

export type QuickInsightsProps = {
  data: {
    sunnyDays: number;
    originSunnyDays: number;
    walkability: number;
    originWalkability: number | null;
    walkabilityLabel: string;
    topNeighborhood: string;
    avgSeaMi: string;
    originName: string;
    destName: string;
  };
};

type Insight = {
  icon: typeof Sun;
  iconClass: string;
  iconBg: string;
  label: string;
  value: string;
  /** Smaller value type for text-y values (neighborhood names) vs. big numerics. */
  compact?: boolean;
  sub: string;
};

export function QuickInsights({ data }: QuickInsightsProps) {
  const insights: Insight[] = [
    {
      icon: Footprints,
      iconClass: "text-[var(--info)]",
      iconBg: "bg-[var(--info)]/14",
      label: "Walkability",
      value: String(data.walkability),
      sub:
        data.originWalkability !== null
          ? `${data.walkabilityLabel} · vs ${data.originName} ${data.originWalkability}`
          : data.walkabilityLabel,
    },
    {
      icon: Sun,
      iconClass: "text-[var(--warn)]",
      iconBg: "bg-[var(--warn)]/14",
      label: "Clear days a year",
      value: String(data.sunnyDays),
      sub: `${data.destName} · vs ${data.originName} ${data.originSunnyDays}`,
    },
    {
      icon: Waves,
      iconClass: "text-[var(--brand-secondary)]",
      iconBg: "bg-[var(--brand-secondary)]/14",
      label: "Distance to coast",
      value: data.avgSeaMi === "N/A" ? "Inland" : `${data.avgSeaMi} mi`,
      compact: data.avgSeaMi === "N/A",
      sub: data.avgSeaMi === "N/A" ? "No coastline" : `${data.destName} listings`,
    },
    {
      icon: Sparkles,
      iconClass: "text-[var(--ok)]",
      iconBg: "bg-[var(--ok)]/14",
      label: "Top neighborhood",
      value: data.topNeighborhood,
      compact: true,
      sub: "Highest fit",
    },
  ];

  return (
    <section className="rounded-[var(--radius-lg)] border border-border bg-card p-4">
      <p className="label-cap text-[10px] text-muted-foreground">Quick insights</p>

      <div className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {insights.map((tile) => {
          const Icon = tile.icon;
          return (
            <div
              key={tile.label}
              className="flex flex-col gap-3 rounded-[var(--radius-md)] border border-border/70 bg-background/40 p-4"
            >
              <div className="flex items-center gap-2">
                <span
                  className={`grid size-8 shrink-0 place-items-center rounded-[var(--radius-md)] ${tile.iconBg}`}
                >
                  <Icon className={`size-4 ${tile.iconClass}`} strokeWidth={1.75} />
                </span>
                {/* Full label, no truncation — wraps if it must. */}
                <p className="text-xs font-medium leading-tight text-muted-foreground">
                  {tile.label}
                </p>
              </div>
              <div>
                <p
                  className={`mono-num font-semibold leading-tight text-foreground ${
                    tile.compact ? "text-lg" : "text-3xl"
                  }`}
                >
                  {tile.value}
                </p>
                <p className="mt-1 text-[11px] leading-snug text-muted-foreground">
                  {tile.sub}
                </p>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
