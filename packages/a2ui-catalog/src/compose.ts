export {
  aggregateInboxDashboard,
  DASHBOARD_BLOCKS,
  DASHBOARD_LAYOUTS,
  DASHBOARD_THREAD_LIMIT,
  type DashboardBlockId,
  type DashboardLayout,
  type DashboardMailItem,
  type DashboardMetric,
  type InboxDashboardData,
  type InboxDashboardThread,
} from "./compose-data.js";

import type {
  DashboardBlockId,
  DashboardLayout,
  InboxDashboardData,
} from "./compose-data.js";

function included(set: ReadonlySet<string>, id: DashboardBlockId): boolean {
  return set.has(id);
}

function metricTile(
  id: string,
  label: string,
  path: string,
  sparkPath: string
): Record<string, unknown> {
  return {
    caption: { path: `${path}/caption` },
    component: "Metric",
    id,
    label,
    sparkline: { path: sparkPath },
    value: { path: `${path}/value` },
  };
}

function mailList(): Record<string, unknown>[] {
  return [
    {
      children: { componentId: "mail", path: "/items" },
      component: "List",
      id: "mailList",
    },
    {
      badge: { path: "category" },
      component: "Row",
      id: "mail",
      meta: { path: "when" },
      subtitle: { path: "from" },
      title: { path: "subject" },
    },
  ];
}

/**
 * Assemble an A2UI surface from Jev's layout choice and the blocks it kept.
 * Data is already bound; this only copies the authored recipes.
 */
export function composeInboxDashboard(params: {
  data: InboxDashboardData;
  included: readonly DashboardBlockId[];
  layout: DashboardLayout;
}): { components: Record<string, unknown>[]; data: Record<string, unknown> } {
  const keep = new Set(params.included);
  if (params.layout === "list-only") {
    keep.clear();
    keep.add("mail");
  }
  const children: string[] = ["title"];
  const components: Record<string, unknown>[] = [
    {
      children,
      component: "Column",
      gap: "md",
      id: "root",
    },
    {
      component: "Text",
      id: "title",
      text: "Inbox",
      variant: "h3",
    },
  ];

  if (included(keep, "metrics") && params.layout === "metrics-and-charts") {
    children.push("metrics");
    components.push({
      children: ["unread", "attention", "newsletters"],
      columns: 3,
      component: "Grid",
      id: "metrics",
    });
    components.push(
      metricTile("unread", "Unread", "/unread", "/unread/sparkline"),
      metricTile(
        "attention",
        "Needs attention",
        "/attention",
        "/attention/sparkline"
      ),
      metricTile(
        "newsletters",
        "Newsletters",
        "/newsletters",
        "/newsletters/sparkline"
      )
    );
  }

  const chartIds: string[] = [];
  if (included(keep, "categories")) {
    chartIds.push("categories");
    components.push({
      action: { event: { name: "filter_category" } },
      component: "DonutChart",
      id: "categories",
      slices: { path: "/categories" },
      title: "By category",
    });
  }
  if (included(keep, "volume")) {
    chartIds.push("volume");
    components.push({
      component: "AreaChart",
      id: "volume",
      points: { path: "/volume" },
      title: "Volume",
    });
  }
  if (chartIds.length > 0) {
    children.push("charts");
    components.push({
      children: chartIds,
      columns: chartIds.length >= 3 ? 3 : 2,
      component: "Grid",
      id: "charts",
    });
  }

  if (included(keep, "senders") && params.layout !== "list-only") {
    children.push("senders");
    components.push({
      action: { event: { name: "filter_sender" } },
      component: "BarChart",
      id: "senders",
      points: { path: "/senders" },
      title: "Top senders",
    });
  }

  if (included(keep, "mail")) {
    children.push("mailList");
    components.push(...mailList());
  }

  return {
    components,
    data: {
      attention: params.data.attention,
      categories: params.data.categories,
      items: params.data.items,
      newsletters: params.data.newsletters,
      senders: params.data.senders,
      unread: params.data.unread,
      volume: params.data.volume,
    },
  };
}
