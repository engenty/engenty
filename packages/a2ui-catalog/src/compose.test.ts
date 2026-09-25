import { describe, expect, it } from "vitest";
import { pointsOf, rowsOf, seriesOf } from "./catalog/chart-data.js";
import {
  aggregateInboxDashboard,
  composeInboxDashboard,
  type InboxDashboardData,
} from "./compose.js";
import { validateEngentyA2uiComponents } from "./spec.js";

const SAMPLE: InboxDashboardData = {
  attention: {
    caption: "2 threads",
    sparkline: [
      { label: "Mon", value: 1 },
      { label: "Tue", value: 2 },
    ],
    value: "2",
  },
  categories: [
    { label: "conversation", value: 4 },
    { label: "newsletter", value: 3 },
  ],
  items: [
    {
      category: "conversation",
      from: "Ada",
      subject: "Quote",
      when: "today",
    },
  ],
  newsletters: {
    caption: "3 this week",
    sparkline: [
      { label: "Mon", value: 0 },
      { label: "Tue", value: 1 },
    ],
    value: "3",
  },
  senders: [{ label: "Ada", value: 2 }],
  unread: {
    caption: "5 new",
    sparkline: [
      { label: "Mon", value: 2 },
      { label: "Tue", value: 3 },
    ],
    value: "5",
  },
  volume: [
    { label: "Mon", value: 3 },
    { label: "Tue", value: 5 },
  ],
};

describe("chart-data", () => {
  it("reads a points array and a named series", () => {
    expect(pointsOf([{ label: "A", value: 1 }])).toEqual([
      { label: "A", value: 1 },
    ]);
    expect(
      seriesOf([{ name: "sent", points: [{ label: "A", value: 2 }] }])
    ).toEqual([{ name: "sent", points: [{ label: "A", value: 2 }] }]);
    expect(
      rowsOf([{ name: "sent", points: [{ label: "A", value: 2 }] }])
    ).toEqual([{ label: "A", sent: 2 }]);
  });
});

describe("composeInboxDashboard", () => {
  it("builds a catalog-valid surface for metrics-and-charts", () => {
    const surface = composeInboxDashboard({
      data: SAMPLE,
      included: ["metrics", "categories", "volume", "senders", "mail"],
      layout: "metrics-and-charts",
    });
    expect(validateEngentyA2uiComponents(surface.components)).toEqual([]);
    expect(surface.components.some((c) => c.component === "Metric")).toBe(true);
    expect(surface.components.some((c) => c.component === "DonutChart")).toBe(
      true
    );
    expect(surface.components.some((c) => c.id === "mail")).toBe(true);
  });

  it("list-only drops charts", () => {
    const surface = composeInboxDashboard({
      data: SAMPLE,
      included: ["metrics", "mail"],
      layout: "list-only",
    });
    expect(validateEngentyA2uiComponents(surface.components)).toEqual([]);
    expect(surface.components.some((c) => c.component === "Metric")).toBe(
      false
    );
    expect(surface.components.some((c) => c.component === "Row")).toBe(true);
  });

  it("charts-over-list keeps charts and drops KPI tiles", () => {
    const surface = composeInboxDashboard({
      data: SAMPLE,
      included: ["metrics", "categories", "mail"],
      layout: "charts-over-list",
    });
    expect(validateEngentyA2uiComponents(surface.components)).toEqual([]);
    expect(surface.components.some((c) => c.component === "Metric")).toBe(
      false
    );
    expect(surface.components.some((c) => c.component === "DonutChart")).toBe(
      true
    );
  });

  it("aggregates counts from threads without inventing labels", () => {
    const data = aggregateInboxDashboard([
      {
        last_message_at: "2026-09-22T10:00:00Z",
        latest_category: "newsletter",
        latest_from_email: "news@example.com",
        latest_from_name: "News",
        latest_status: "new",
        subject: "Weekly",
        unhandled_count: 1,
      },
      {
        last_message_at: "2026-09-22T11:00:00Z",
        latest_category: "conversation",
        latest_from_email: "ada@example.com",
        latest_from_name: "Ada",
        latest_status: "read",
        subject: "Quote",
        unhandled_count: 0,
      },
    ]);
    expect(data.unread.value).toBe("1");
    expect(data.newsletters.value).toBe("1");
    expect(data.categories).toEqual(
      expect.arrayContaining([
        { label: "newsletter", value: 1 },
        { label: "conversation", value: 1 },
      ])
    );
    expect(data.items[0]?.subject).toBe("Weekly");
  });
});
