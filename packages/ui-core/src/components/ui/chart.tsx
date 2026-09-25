"use client";

import {
  createContext,
  type CSSProperties,
  type ReactNode,
  useContext,
  useId,
  useMemo,
} from "react";
import * as RechartsPrimitive from "recharts";
import { cn } from "../../lib/utils";

export type ChartConfig = Record<
  string,
  {
    color?: string;
    label?: ReactNode;
  }
>;

const ChartContext = createContext<{ config: ChartConfig } | null>(null);

function useChart() {
  const context = useContext(ChartContext);
  if (!context) {
    throw new Error("useChart must be used within a ChartContainer");
  }
  return context;
}

const DEFAULT_COLORS = [
  "var(--chart-1)",
  "var(--chart-2)",
  "var(--chart-3)",
  "var(--chart-4)",
  "var(--chart-5)",
];

export function emberChartConfig(keys: string[]): ChartConfig {
  return Object.fromEntries(
    keys.map((key, index) => [
      key,
      {
        color: DEFAULT_COLORS[index % DEFAULT_COLORS.length],
        label: key,
      },
    ])
  );
}

export function ChartContainer({
  children,
  className,
  config,
  height = 220,
  id,
}: {
  children: ReactNode;
  className?: string;
  config: ChartConfig;
  height?: number;
  id?: string;
}) {
  const uniqueId = useId();
  const chartId = `chart-${id ?? uniqueId.replace(/:/g, "")}`;
  const style = useMemo((): CSSProperties => {
    const vars: Record<string, string> = {};
    for (const [key, item] of Object.entries(config)) {
      if (item.color) {
        vars[`--color-${key}`] = item.color;
      }
    }
    return vars;
  }, [config]);

  return (
    <ChartContext.Provider value={{ config }}>
      <div
        className={cn(
          "flex w-full justify-center text-xs [&_.recharts-cartesian-axis-tick_text]:fill-muted-foreground [&_.recharts-cartesian-grid_line]:stroke-border/50 [&_.recharts-rectangle.recharts-tooltip-cursor]:fill-muted [&_.recharts-surface]:outline-hidden",
          className
        )}
        data-chart={chartId}
        data-slot="chart"
        style={{ ...style, height }}
      >
        <RechartsPrimitive.ResponsiveContainer height="100%" width="100%">
          {children as React.ComponentProps<
            typeof RechartsPrimitive.ResponsiveContainer
          >["children"]}
        </RechartsPrimitive.ResponsiveContainer>
      </div>
    </ChartContext.Provider>
  );
}

export const ChartTooltip = RechartsPrimitive.Tooltip;

export function ChartTooltipContent({
  active,
  className,
  payload,
}: {
  active?: boolean;
  className?: string;
  payload?: ReadonlyArray<{
    color?: string;
    dataKey?: number | string;
    name?: number | string;
    value?: number | string;
  }>;
}) {
  const { config } = useChart();
  if (!(active && payload?.length)) {
    return null;
  }
  return (
    <div
      className={cn(
        "grid min-w-28 gap-1 rounded-md border border-border-soft bg-card px-2.5 py-1.5 text-xs shadow-md",
        className
      )}
    >
      {payload.map((item) => {
        const key = String(item.dataKey ?? item.name ?? "value");
        const label = config[key]?.label ?? item.name ?? key;
        return (
          <div className="flex items-center justify-between gap-4" key={key}>
            <span className="flex items-center gap-1.5 text-muted-foreground">
              <span
                className="h-2 w-2 rounded-[2px]"
                style={{ backgroundColor: item.color }}
              />
              {label}
            </span>
            <span className="font-medium tabular-nums text-foreground">
              {typeof item.value === "number"
                ? item.value.toLocaleString()
                : String(item.value ?? "")}
            </span>
          </div>
        );
      })}
    </div>
  );
}

export const ChartLegend = RechartsPrimitive.Legend;

export function ChartLegendContent({
  hiddenKeys,
  onToggle,
  payload,
}: {
  hiddenKeys?: ReadonlySet<string>;
  onToggle?: (key: string) => void;
  payload?: ReadonlyArray<{
    color?: string;
    dataKey?: number | string;
    value?: number | string;
  }>;
}) {
  const { config } = useChart();
  if (!payload?.length) {
    return null;
  }
  return (
    <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
      {payload.map((item) => {
        const key = String(item.dataKey ?? item.value ?? "");
        const hidden = hiddenKeys?.has(key) === true;
        const label = config[key]?.label ?? item.value ?? key;
        return (
          <button
            className={cn(
              "flex items-center gap-1.5 text-muted-foreground text-xs",
              hidden && "opacity-40"
            )}
            key={key}
            onClick={() => onToggle?.(key)}
            type="button"
          >
            <span
              className="h-2 w-2 rounded-[2px]"
              style={{ backgroundColor: item.color }}
            />
            {label}
          </button>
        );
      })}
    </div>
  );
}
