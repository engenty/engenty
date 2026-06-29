/**
 * Dashboard widget catalog for json-render.
 * Server-safe: no React dependency. Use for catalog.prompt() in API routes.
 */
import { defineCatalog } from "@json-render/core";
import { schema } from "@json-render/react/schema";
import { shadcnComponentDefinitions } from "@json-render/shadcn/catalog";
import { z } from "zod";

const metricIconSchema = z.enum([
  "activity",
  "box",
  "briefcase",
  "building",
  "calendar",
  "check",
  "clock",
  "database",
  "folder",
  "lightbulb",
  "link",
  "list",
  "sparkles",
  "target",
  "trending-up",
  "users",
]);

const Metric = {
  props: z.object({
    label: z.string(),
    value: z.string(),
    caption: z.string().nullable(),
    icon: metricIconSchema.nullable(),
    tone: z.enum(["default", "success", "warning"]).nullable(),
  }),
  description: "KPI metric display with optional icon and tone",
};

const listItemSchema = z.object({
  label: z.string(),
  value: z.string().nullable(),
  badge: z.string().nullable(),
});

const List = {
  props: z.object({
    title: z.string().nullable(),
    items: z.array(listItemSchema),
  }),
  description: "List of items with label, optional value, and optional badge",
};

export const catalog = defineCatalog(schema, {
  components: {
    Stack: shadcnComponentDefinitions.Stack,
    Grid: shadcnComponentDefinitions.Grid,
    Card: shadcnComponentDefinitions.Card,
    Text: shadcnComponentDefinitions.Text,
    Badge: shadcnComponentDefinitions.Badge,
    Button: shadcnComponentDefinitions.Button,
    Link: shadcnComponentDefinitions.Link,
    Separator: shadcnComponentDefinitions.Separator,
    Metric,
    List,
  },
  actions: {
    sendMessage: {
      params: z.object({
        text: z.string().trim().min(1),
      }),
      description:
        "Post text as a new user message in the current chat thread.",
    },
  },
});

export type DashboardSpec = (typeof catalog)["_specType"];
