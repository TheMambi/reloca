"use client";

import {
  Bar,
  BarChart,
  Cell,
  LabelList,
  ResponsiveContainer,
  XAxis,
  YAxis,
} from "recharts";
import type { ForecastBar } from "@/lib/lease/forecast";

// Token vars hold the full `oklch(...)` value already (see app/globals.css —
// `--info: oklch(0.74 0.12 230)` etc.), so wrap them with `var(...)` directly.
// Wrapping in another `oklch(...)` would emit `oklch(oklch(...))` and break.
const COLOR_VAR: Record<ForecastBar["color"], string> = {
  info: "var(--info)",
  ok: "var(--ok)",
  warn: "var(--warn)",
  danger: "var(--danger)",
};

const ACTIVE_STROKE = "var(--brand-secondary)";

interface ForecasterBarChartProps {
  bars: ForecastBar[];
  activeKey: ForecastBar["key"];
}

const fmtCurrency = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});

export function ForecasterBarChart({
  bars,
  activeKey,
}: ForecasterBarChartProps) {
  // Recharts `layout="vertical"` means horizontal bars (X = value, Y = category).
  // Per Task 6.14 brief: cheapest at top → ascending sort by total. Recharts
  // renders YAxis top-to-bottom in array order, so this puts the cheapest at the
  // top of the chart.
  const height = Math.max(220, bars.length * 56);

  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart
        layout="vertical"
        data={bars}
        margin={{ top: 8, right: 96, bottom: 8, left: 0 }}
      >
        <XAxis
          type="number"
          tickFormatter={(value: number) => fmtCurrency.format(value)}
          stroke="var(--border)"
          tick={{ fill: "var(--muted-foreground)", fontSize: 10 }}
          axisLine={false}
          tickLine={false}
        />
        <YAxis
          type="category"
          dataKey="label"
          width={200}
          stroke="var(--border)"
          tick={{ fill: "var(--foreground)", fontSize: 12 }}
          axisLine={false}
          tickLine={false}
        />
        <Bar dataKey="total" radius={[0, 4, 4, 0]} isAnimationActive={false}>
          {bars.map((bar) => {
            const isActive = bar.key === activeKey;
            return (
              <Cell
                key={bar.key}
                fill={COLOR_VAR[bar.color]}
                stroke={isActive ? ACTIVE_STROKE : "transparent"}
                strokeWidth={isActive ? 2 : 0}
              />
            );
          })}
          <LabelList
            dataKey="total"
            position="right"
            // Recharts 3.x types `LabelList.formatter` value as RenderableText
            // (string | number | undefined), so coerce defensively. In practice
            // every bar has a numeric `total`.
            formatter={(value) =>
              typeof value === "number" ? fmtCurrency.format(value) : ""
            }
            style={{
              fill: "var(--foreground)",
              fontFamily: "var(--font-mono)",
              fontSize: 11,
              fontVariantNumeric: "tabular-nums",
            }}
          />
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
