export {
  aggregateInboxDashboard,
  DASHBOARD_BLOCKS,
  DASHBOARD_THREAD_LIMIT,
  type DashboardBlockId,
  type DashboardMailItem,
  type DashboardMetric,
  type InboxDashboardData,
  type InboxDashboardThread,
} from "./compose-data.js";

import type { DashboardBlockId, InboxDashboardData } from "./compose-data.js";
import type { SurfaceCandidate } from "./compose-surface.js";
import { assembleSurface } from "./compose-surface.js";

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

/**
 * The inbox dashboard's building blocks, bound to the data model
 * `aggregateInboxDashboard` returns. Ids match {@link DASHBOARD_BLOCKS}, so a
 * stored selection rebuilds the same page.
 */
export function inboxDashboardCandidates(): SurfaceCandidate[] {
  return [
    {
      components: [
        { component: "Text", id: "title", text: "Inbox", variant: "h3" },
      ],
      description: "The page title.",
      id: "title",
      required: true,
    },
    {
      components: [
        {
          children: ["unread", "attention", "newsletters"],
          columns: 3,
          component: "Grid",
          id: "metrics",
        },
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
        ),
      ],
      description:
        "Unread / needs-attention / newsletter KPI tiles — for a full inbox overview.",
      fallback: true,
      id: "metrics",
    },
    {
      components: [{ columns: 2, component: "Grid", id: "charts" }],
      description: "Side-by-side charts.",
      id: "charts",
    },
    {
      components: [
        {
          action: { event: { name: "filter_category" } },
          component: "DonutChart",
          id: "categories",
          slices: { path: "/categories" },
          title: "By category",
        },
      ],
      description: "A donut of mail by category — for a picture or overview.",
      fallback: true,
      id: "categories",
      parent: "charts",
    },
    {
      components: [
        {
          component: "AreaChart",
          id: "volume",
          points: { path: "/volume" },
          title: "Volume",
        },
      ],
      description: "Mail volume over the last days as an area chart.",
      fallback: true,
      id: "volume",
      parent: "charts",
    },
    {
      components: [
        {
          action: { event: { name: "filter_sender" } },
          component: "BarChart",
          id: "senders",
          points: { path: "/senders" },
          title: "Top senders",
        },
      ],
      description: "A bar chart of the top senders.",
      fallback: true,
      id: "senders",
    },
    {
      components: [
        {
          children: { componentId: "mailRow", path: "/items" },
          component: "List",
          id: "mail",
        },
        {
          badge: { path: "category" },
          component: "Row",
          id: "mailRow",
          meta: { path: "when" },
          subtitle: { path: "from" },
          title: { path: "subject" },
        },
      ],
      description:
        "The list of mail that needs attention — whenever the person wants to see the mail itself.",
      fallback: true,
      id: "mail",
    },
  ];
}

/** The dashboard for a stored selection of blocks, without asking Jev. */
export function composeInboxDashboard(params: {
  data: InboxDashboardData;
  included: readonly DashboardBlockId[];
}): { components: Record<string, unknown>[]; data: Record<string, unknown> } {
  const { components, data } = assembleSurface({
    candidates: inboxDashboardCandidates(),
    data: { ...params.data },
    kept: params.included,
  });
  return { components, data };
}
