"use client";

import { Badge, cn } from "@engenty/ui-core";
import { defineRegistry } from "@json-render/react";
import { shadcnComponents } from "@json-render/shadcn";
import {
  Activity,
  Box,
  Briefcase,
  Building2,
  CalendarDays,
  Check,
  Clock3,
  Database,
  FolderKanban,
  Lightbulb,
  Link2,
  List,
  Sparkles,
  Target,
  TrendingUp,
  Users,
} from "lucide-react";
import type { ComponentType } from "react";
import { catalog } from "./catalog";

const iconMap: Record<string, ComponentType<{ className?: string }>> = {
  activity: Activity,
  box: Box,
  briefcase: Briefcase,
  building: Building2,
  calendar: CalendarDays,
  check: Check,
  clock: Clock3,
  database: Database,
  folder: FolderKanban,
  lightbulb: Lightbulb,
  link: Link2,
  list: List,
  sparkles: Sparkles,
  target: Target,
  "trending-up": TrendingUp,
  users: Users,
};

function MetricComponent({
  props,
}: {
  props: {
    label: string;
    value: string;
    caption: string | null;
    icon: string | null;
    tone: "default" | "success" | "warning" | null;
  };
}) {
  const Icon = props.icon ? iconMap[props.icon] : null;
  return (
    <div className="rounded-lg border bg-card/50 p-2">
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-1">
          <p className="text-muted-foreground text-sm">{props.label}</p>
          <p className="font-semibold text-3xl tracking-tight">{props.value}</p>
          {props.caption ? (
            <p className="text-muted-foreground text-xs">{props.caption}</p>
          ) : null}
        </div>
        {Icon ? (
          <Icon
            className={cn(
              "mt-0.5 size-4 text-muted-foreground",
              props.tone === "success" &&
                "text-emerald-600 dark:text-emerald-400",
              props.tone === "warning" && "text-amber-600 dark:text-amber-400"
            )}
          />
        ) : null}
      </div>
    </div>
  );
}

function ListComponent({
  props,
}: {
  props: {
    title: string | null;
    items: Array<{
      label: string;
      value: string | null;
      badge: string | null;
    }>;
  };
}) {
  return (
    <div className="space-y-2">
      {props.title ? (
        <p className="font-medium text-sm">{props.title}</p>
      ) : null}
      <div className="space-y-2">
        {props.items.map((item, index) => (
          <div
            className="flex items-start justify-between gap-3 rounded-lg border bg-background/60 px-3 py-2"
            key={index}
          >
            <div>
              <p className="text-sm">{item.label}</p>
              {item.value ? (
                <p className="text-muted-foreground text-xs">{item.value}</p>
              ) : null}
            </div>
            {item.badge ? (
              <Badge variant="secondary">{item.badge}</Badge>
            ) : null}
          </div>
        ))}
      </div>
    </div>
  );
}

export const { registry } = defineRegistry(catalog, {
  components: {
    Stack: shadcnComponents.Stack,
    Grid: shadcnComponents.Grid,
    Card: shadcnComponents.Card,
    Text: shadcnComponents.Text,
    Badge: shadcnComponents.Badge,
    Button: shadcnComponents.Button,
    Link: shadcnComponents.Link,
    Separator: shadcnComponents.Separator,
    Metric: MetricComponent,
    List: ListComponent,
  },
  actions: {
    sendMessage: async () => {},
  },
});
