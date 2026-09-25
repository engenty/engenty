"use client";

import { createComponentImplementation } from "@a2ui/react/v0_9";
import { DynamicStringSchema, DynamicValueSchema } from "@a2ui/web_core/v0_9";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  cn,
  emberChartConfig,
} from "@engenty/ui-core";
import { Area, AreaChart } from "recharts";
import { z } from "zod";
import { pointsOf } from "./chart-data.js";
import { asText, useResolvedProp } from "./host.js";

const TONE_TEXT: Record<string, string> = {
  success: "text-(--success)",
  warning: "text-(--warning)",
};

export const Metric = createComponentImplementation(
  {
    name: "Metric",
    schema: z.object({
      caption: DynamicStringSchema.optional(),
      label: DynamicStringSchema.optional(),
      sparkline: DynamicValueSchema.optional(),
      tone: z.enum(["default", "success", "warning"]).optional(),
      value: DynamicStringSchema.optional(),
    }),
  },
  ({ context, props }) => {
    const spark = useResolvedProp(context, "sparkline", props.sparkline);
    const points = pointsOf(spark);
    const tone =
      typeof props.tone === "string" && TONE_TEXT[props.tone]
        ? props.tone
        : "default";
    const config = emberChartConfig(["value"]);
    return (
      <div className="ui-card-raised flex flex-col gap-1 px-3 py-2.5">
        <p className="text-[11px] text-muted-foreground uppercase tracking-wide">
          {asText(props.label)}
        </p>
        <p
          className={cn(
            "font-semibold text-lg tabular-nums leading-tight",
            TONE_TEXT[tone]
          )}
        >
          {asText(props.value)}
        </p>
        {asText(props.caption) ? (
          <p className="text-muted-foreground text-xs">
            {asText(props.caption)}
          </p>
        ) : null}
        {points.length > 1 ? (
          <ChartContainer className="mt-1" config={config} height={36}>
            <AreaChart
              data={points}
              margin={{ bottom: 0, left: 0, right: 0, top: 2 }}
            >
              <defs>
                <linearGradient id="metricFill" x1="0" x2="0" y1="0" y2="1">
                  <stop
                    offset="0%"
                    stopColor="var(--color-value)"
                    stopOpacity={0.35}
                  />
                  <stop
                    offset="100%"
                    stopColor="var(--color-value)"
                    stopOpacity={0}
                  />
                </linearGradient>
              </defs>
              <ChartTooltip content={<ChartTooltipContent />} />
              <Area
                dataKey="value"
                fill="url(#metricFill)"
                isAnimationActive
                stroke="var(--color-value)"
                strokeWidth={1.5}
                type="monotone"
              />
            </AreaChart>
          </ChartContainer>
        ) : null}
      </div>
    );
  }
);
