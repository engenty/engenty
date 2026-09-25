"use client";

import { createComponentImplementation } from "@a2ui/react/v0_9";
import {
  ActionSchema,
  DynamicStringSchema,
  DynamicValueSchema,
} from "@a2ui/web_core/v0_9";
import {
  ChartContainer,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
  emberChartConfig,
} from "@engenty/ui-core";
import { useState } from "react";
import { Cell, Pie, PieChart } from "recharts";
import { z } from "zod";
import { pointsOf } from "./chart-data.js";
import { asText, dispatchA2uiAction, useResolvedProp } from "./host.js";

export const DonutChart = createComponentImplementation(
  {
    name: "DonutChart",
    schema: z.object({
      action: ActionSchema.optional(),
      center: DynamicStringSchema.optional(),
      height: z.number().optional(),
      slices: DynamicValueSchema.optional(),
      title: DynamicStringSchema.optional(),
    }),
  },
  ({ context, props }) => {
    const slicesProp = useResolvedProp(context, "slices", props.slices);
    const slices = pointsOf(slicesProp);
    const keys = slices.map((s) => s.label);
    const config = emberChartConfig(keys);
    const height = typeof props.height === "number" ? props.height : 220;
    const [hidden, setHidden] = useState<Set<string>>(new Set());
    const visible = slices.filter((slice) => !hidden.has(slice.label));
    const data = visible.map((slice) => ({
      label: slice.label,
      value: slice.value,
    }));
    const total = visible.reduce((sum, slice) => sum + slice.value, 0);
    const center = asText(props.center) || String(total);
    const title = asText(props.title);
    return (
      <div className="flex flex-col">
        {title ? (
          <p className="px-2 pt-1 font-medium text-foreground text-sm">
            {title}
          </p>
        ) : null}
        <div className="relative">
          <ChartContainer config={config} height={height}>
            <PieChart>
              <ChartTooltip content={<ChartTooltipContent />} />
              <Pie
                data={data}
                dataKey="value"
                innerRadius="58%"
                nameKey="label"
                onClick={(entry) => {
                  const label =
                    entry && typeof entry === "object"
                      ? String(
                          (entry as { label?: unknown; name?: unknown })
                            .label ??
                            (entry as { name?: unknown }).name ??
                            ""
                        )
                      : "";
                  dispatchA2uiAction(props.action, context, { label });
                }}
                paddingAngle={2}
                stroke="transparent"
              >
                {data.map((slice) => (
                  <Cell
                    fill={`var(--color-${slice.label})`}
                    key={slice.label}
                  />
                ))}
              </Pie>
            </PieChart>
          </ChartContainer>
          <ChartLegendContent
            hiddenKeys={hidden}
            onToggle={(key) => {
              setHidden((prev) => {
                const next = new Set(prev);
                if (next.has(key)) {
                  next.delete(key);
                } else {
                  next.add(key);
                }
                return next;
              });
            }}
            payload={slices.map((slice) => ({
              color: config[slice.label]?.color,
              dataKey: slice.label,
              value: slice.label,
            }))}
          />
          <p className="pointer-events-none absolute inset-0 flex items-center justify-center font-semibold text-foreground text-sm tabular-nums">
            {center}
          </p>
        </div>
      </div>
    );
  }
);
