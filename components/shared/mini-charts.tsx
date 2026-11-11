// Donut is the only mini-chart still in service. Sparkline / Gauge / DeltaBar
// were deleted in Wave 4 (AD-042) along with the fake instruments they drew —
// per the repo rule, unused code gets deleted, not kept around.

type DonutProps = {
  percent: number;
  label?: string;
  className?: string;
};

export function Donut({ percent, label, className }: DonutProps) {
  const r = 22;
  const c = 2 * Math.PI * r;
  const filled = c * (Math.min(100, Math.max(0, percent)) / 100);
  const a11yLabel = label ?? `${Math.round(percent)} percent complete`;
  return (
    <svg
      viewBox="0 0 60 60"
      role="img"
      aria-label={a11yLabel}
      className={className}
    >
      <circle
        cx="30"
        cy="30"
        r={r}
        fill="none"
        stroke="var(--border)"
        strokeWidth="3"
      />
      <circle
        cx="30"
        cy="30"
        r={r}
        fill="none"
        stroke="var(--brand)"
        strokeWidth="3"
        strokeDasharray={`${filled} ${c}`}
        strokeDashoffset={c / 4}
        transform="rotate(-90 30 30)"
        strokeLinecap="butt"
      />
      <text
        x="30"
        y="34"
        textAnchor="middle"
        fontFamily="var(--font-mono)"
        fontSize="11"
        fill="var(--foreground)"
      >
        {label ?? `${Math.round(percent)}%`}
      </text>
    </svg>
  );
}
