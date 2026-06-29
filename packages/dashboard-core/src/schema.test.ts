import { describe, expect, it } from "vitest";
import { dashboardJsonUiConfigSchema } from "./schema";

describe("dashboardJsonUiConfigSchema", () => {
  it("accepts a valid two-flow JSON widget definition", () => {
    const template = JSON.stringify({
      root: "root",
      elements: {
        root: {
          type: "Stack",
          children: ["metric1", "list1"],
          props: { direction: "vertical", gap: "md" },
        },
        metric1: {
          type: "Metric",
          props: {
            label: "Active projects",
            value: { $state: "/projects/total" },
            icon: "folder",
          },
        },
        list1: {
          type: "List",
          props: {
            items: { $state: "/agentic/highlights" },
          },
        },
      },
    });
    const parsed = dashboardJsonUiConfigSchema.safeParse({
      summary: "Compact overview",
      queries: [
        {
          id: "projects",
          path: "/api/projects",
          contextKey: "projects",
          refreshPolicy: "always",
        },
      ],
      template,
      agentic: {
        agentId: "dashboard_widget_data",
        instructions: "Summarize the current projects into short bullets.",
        inputContextKeys: ["projects"],
        outputSchema: {
          type: "object",
          properties: {
            highlights: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  label: { type: "string" },
                  badge: { type: "string" },
                },
                required: ["label"],
              },
            },
          },
          required: ["highlights"],
        },
        cachePolicy: {
          mode: "ttl",
          ttlSeconds: 300,
        },
      },
    });

    expect(parsed.success).toBe(true);
  });

  it("accepts agentic config with empty inputContextKeys", () => {
    const parsed = dashboardJsonUiConfigSchema.safeParse({
      template: JSON.stringify({
        root: "root",
        elements: {
          root: {
            type: "Text",
            props: { text: { $state: "/agentic/greeting" } },
          },
        },
      }),
      agentic: {
        agentId: "dashboard_widget_data",
        instructions: "Return a greeting.",
        inputContextKeys: [],
        outputSchema: {
          type: "object",
          properties: { greeting: { type: "string" } },
          required: ["greeting"],
        },
        cachePolicy: { mode: "manual" },
      },
    });
    expect(parsed.success).toBe(true);
  });

  it("rejects unknown top-level config keys", () => {
    const parsed = dashboardJsonUiConfigSchema.safeParse({
      summary: "Unsafe widget",
      unknownKey: "not allowed",
      template: JSON.stringify({
        root: "root",
        elements: {
          root: {
            type: "Text",
            props: { text: "Hello" },
          },
        },
      }),
    });

    expect(parsed.success).toBe(false);
  });
});
