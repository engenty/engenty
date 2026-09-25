"use client";

import { createComponentImplementation } from "@a2ui/react/v0_9";
import {
  ActionSchema,
  type ComponentContext,
  DynamicStringSchema,
  DynamicValueSchema,
} from "@a2ui/web_core/v0_9";
import {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
  emberChartConfig,
} from "@engenty/ui-core";
import { useState } from "react";
import {
  Area,
  Bar,
  CartesianGrid,
  Line,
  AreaChart as RechartsArea,
  BarChart as RechartsBar,
  LineChart as RechartsLine,
  XAxis,
  YAxis,
} from "recharts";
import { z } from "zod";
import { rowsOf, seriesOf } from "./chart-data.js";
import { asText, dispatchA2uiAction, useResolvedProp } from "./host.js";

const cartesianSchema = z.object({
  action: ActionSchema.optional(),
  height: z.number().optional(),
  points: DynamicValueSchema.optional(),
  series: DynamicValueSchema.optional(),
  title: DynamicStringSchema.optional(),
});

function useCartesian(
  context: ComponentContext,
  props: { height?: unknown; points?: unknown; series?: unknown }
) {
  const seriesProp = useResolvedProp(context, "series", props.series);
  const pointsProp = useResolvedProp(context, "points", props.points);
  const series = seriesOf(seriesProp ?? pointsProp);
  const keys = series.map((s) => s.name);
  const data = rowsOf(series);
  const config = emberChartConfig(keys);
  const height = typeof props.height === "number" ? props.height : 220;
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const toggle = (key: string) => {
    setHidden((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  };
  return { config, data, height, hidden, keys, toggle };
}

function ChartTitle({ title }: { title: unknown }) {
  const text = asText(title);
  if (!text) {
    return null;
  }
  return (
    <p className="px-2 pt-1 font-medium text-foreground text-sm">{text}</p>
  );
}

function clickHandler(
  action: unknown,
  context: ComponentContext,
  extra: Record<string, unknown>
) {
  return () => dispatchA2uiAction(action, context, extra);
}

export const BarChart = createComponentImplementation(
  { name: "BarChart", schema: cartesianSchema },
  ({ context, props }) => {
    const chart = useCartesian(context, props);
    return (
      <div className="flex flex-col">
        <ChartTitle title={props.title} />
        <ChartContainer config={chart.config} height={chart.height}>
          <RechartsBar
            data={chart.data}
            onClick={(state) => {
              const label = (state as { activeLabel?: string }).activeLabel;
              if (label) {
                clickHandler(props.action, context, { label })();
              }
            }}
          >
            <CartesianGrid strokeDasharray="3 3" vertical={false} />
            <XAxis dataKey="label" tickLine={false} />
            <YAxis tickLine={false} width={32} />
            <ChartTooltip content={<ChartTooltipContent />} />
            <ChartLegend
              content={
                <ChartLegendContent
                  hiddenKeys={chart.hidden}
                  onToggle={chart.toggle}
                />
              }
            />
            {chart.keys.map((key) => (
              <Bar
                dataKey={key}
                fill={`var(--color-${key})`}
                hide={chart.hidden.has(key)}
                isAnimationActive
                key={key}
                radius={[4, 4, 0, 0]}
              />
            ))}
          </RechartsBar>
        </ChartContainer>
      </div>
    );
  }
);

export const LineChart = createComponentImplementation(
  { name: "LineChart", schema: cartesianSchema },
  ({ context, props }) => {
    const chart = useCartesian(context, props);
    return (
      <div className="flex flex-col">
        <ChartTitle title={props.title} />
        <ChartContainer config={chart.config} height={chart.height}>
          <RechartsLine data={chart.data}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} />
            <XAxis dataKey="label" tickLine={false} />
            <YAxis tickLine={false} width={32} />
            <ChartTooltip content={<ChartTooltipContent />} />
            <ChartLegend
              content={
                <ChartLegendContent
                  hiddenKeys={chart.hidden}
                  onToggle={chart.toggle}
                />
              }
            />
            {chart.keys.map((key) => (
              <Line
                activeDot={{
                  onClick: (_event, payload) => {
                    const label = (payload as { payload?: { label?: string } })
                      .payload?.label;
                    clickHandler(props.action, context, {
                      label: label ?? "",
                      series: key,
                    })();
                  },
                }}
                dataKey={key}
                hide={chart.hidden.has(key)}
                isAnimationActive
                key={key}
                stroke={`var(--color-${key})`}
                strokeWidth={2}
                type="monotone"
              />
            ))}
          </RechartsLine>
        </ChartContainer>
      </div>
    );
  }
);

export const AreaChart = createComponentImplementation(
  { name: "AreaChart", schema: cartesianSchema },
  ({ context, props }) => {
    const chart = useCartesian(context, props);
    return (
      <div className="flex flex-col">
        <ChartTitle title={props.title} />
        <ChartContainer config={chart.config} height={chart.height}>
          <RechartsArea data={chart.data}>
            <defs>
              {chart.keys.map((key) => (
                <linearGradient
                  id={`fill-${key}`}
                  key={key}
                  x1="0"
                  x2="0"
                  y1="0"
                  y2="1"
                >
                  <stop
                    offset="0%"
                    stopColor={`var(--color-${key})`}
                    stopOpacity={0.4}
                  />
                  <stop
                    offset="100%"
                    stopColor={`var(--color-${key})`}
                    stopOpacity={0.02}
                  />
                </linearGradient>
              ))}
            </defs>
            <CartesianGrid strokeDasharray="3 3" vertical={false} />
            <XAxis dataKey="label" tickLine={false} />
            <YAxis tickLine={false} width={32} />
            <ChartTooltip content={<ChartTooltipContent />} />
            <ChartLegend
              content={
                <ChartLegendContent
                  hiddenKeys={chart.hidden}
                  onToggle={chart.toggle}
                />
              }
            />
            {chart.keys.map((key) => (
              <Area
                dataKey={key}
                fill={`url(#fill-${key})`}
                hide={chart.hidden.has(key)}
                isAnimationActive
                key={key}
                stroke={`var(--color-${key})`}
                type="monotone"
              />
            ))}
          </RechartsArea>
        </ChartContainer>
      </div>
    );
  }
);
