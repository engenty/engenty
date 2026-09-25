import {
  A2UI_SURFACE_MAX_BYTES,
  aggregateInboxDashboard,
  buildEngentyA2uiMessages,
  composeInboxDashboard,
  DASHBOARD_BLOCKS,
  DASHBOARD_LAYOUTS,
  DASHBOARD_THREAD_LIMIT,
  type DashboardBlockId,
  type DashboardLayout,
  ENGENTY_A2UI_CATALOG_ID,
  validateEngentyA2uiComponents,
} from "@engenty/a2ui-catalog/spec";
import { createClassifierClient, roleModelRef } from "@engenty/ai-core";
import {
  type NoulQuestion,
  validateChoiceAnswer,
} from "@engenty/typesafe-client";
import type { InboxThreadListItem } from "../src/schema/types.js";

const INCLUDE_FLOOR = 0.45;
const MAIL_FLOOR = 0.5;

/** Platform classifier when bound and keyed; otherwise null (fail open). */
function defaultJevClient() {
  try {
    return createClassifierClient(roleModelRef("classifier"))?.client ?? null;
  } catch {
    return null;
  }
}

function isLayout(value: string): value is DashboardLayout {
  return (DASHBOARD_LAYOUTS as readonly string[]).includes(value);
}

function isBlock(value: string): value is DashboardBlockId {
  return (DASHBOARD_BLOCKS as readonly string[]).includes(value);
}

function blockQuestions(): Record<string, NoulQuestion> {
  const descriptions: Record<DashboardBlockId, string> = {
    categories: "Show a donut of mail by category.",
    mail: "Show the important-mail list.",
    metrics: "Show unread / needs-attention / newsletter KPI tiles.",
    senders: "Show a bar chart of the top senders.",
    volume: "Show volume over the last days as an area chart.",
  };
  return Object.fromEntries(
    DASHBOARD_BLOCKS.map((id) => [
      `include_${id}`,
      {
        instructions: descriptions[id],
        type: "noul" as const,
      },
    ])
  );
}

export async function composeInboxDashboardSurface(params: {
  connection_id?: string;
  prompt: string;
  threads: readonly InboxThreadListItem[];
}): Promise<{
  components: Record<string, unknown>[];
  connection_id?: string;
  data: Record<string, unknown>;
  included: DashboardBlockId[];
  layout: DashboardLayout;
  title: string;
}> {
  const data = aggregateInboxDashboard(params.threads);
  let layout: DashboardLayout = "metrics-and-charts";
  const included = new Set<DashboardBlockId>(DASHBOARD_BLOCKS);
  const jev = defaultJevClient();
  if (jev) {
    const mailQuestions: Record<string, NoulQuestion> = {};
    for (let index = 0; index < data.items.length; index++) {
      mailQuestions[`m${index}`] = {
        instructions:
          "This thread needs attention now (a person, a deal, or a decision — not a newsletter or receipt).",
        type: "noul",
      };
    }
    const response = await jev.systemOne({
      questions: {
        layout: {
          criteria: {
            "charts-over-list":
              "Charts first, then the important-mail list. Use when the person asked for a picture or overview.",
            "list-only":
              "Just the important-mail list. Use when they asked to see the mail, not a dashboard.",
            "metrics-and-charts":
              "KPI tiles, charts, and the list. Use for a full inbox dashboard.",
          },
          instructions: "Which page shape fits the request?",
          type: "choice",
        },
        ...blockQuestions(),
        ...mailQuestions,
      },
      state: {
        prompt: params.prompt,
        threads: data.items.map((item, index) => ({
          index,
          ...item,
        })),
      },
    });
    try {
      layout = validateChoiceAnswer(response.answers.layout, DASHBOARD_LAYOUTS)
        .choice as DashboardLayout;
    } catch {
      layout = "metrics-and-charts";
    }
    if (!isLayout(layout)) {
      layout = "metrics-and-charts";
    }
    included.clear();
    for (const id of DASHBOARD_BLOCKS) {
      const answer = response.answers[`include_${id}`];
      if (answer?.type === "noul" && answer.noul >= INCLUDE_FLOOR) {
        included.add(id);
      }
    }
    if (included.size === 0) {
      included.add("mail");
    }
    data.items = data.items.filter((_item, index) => {
      const answer = response.answers[`m${index}`];
      return answer?.type === "noul" && answer.noul >= MAIL_FLOOR;
    });
  }
  const kept = [...included].filter(isBlock);
  const surface = composeInboxDashboard({
    data,
    included: kept,
    layout,
  });
  return {
    ...surface,
    included: kept,
    layout,
    title: "Inbox",
    ...(params.connection_id ? { connection_id: params.connection_id } : {}),
  };
}

export function dashboardUiResult(input: {
  components: Record<string, unknown>[];
  connection_id?: string;
  data: Record<string, unknown>;
  included: DashboardBlockId[];
  layout: DashboardLayout;
  title: string;
}): Record<string, unknown> {
  const issues = validateEngentyA2uiComponents(input.components);
  if (issues.length > 0) {
    return {
      error: "Invalid A2UI components — fix and retry.",
      issues: issues.slice(0, 8),
      ok: false,
    };
  }
  const payloadBytes = Buffer.byteLength(
    JSON.stringify({ components: input.components, data: input.data }),
    "utf8"
  );
  if (payloadBytes > A2UI_SURFACE_MAX_BYTES) {
    return {
      error: `UI payload is ${payloadBytes} bytes; the limit is ${A2UI_SURFACE_MAX_BYTES}.`,
      ok: false,
    };
  }
  const { messages, surfaceId } = buildEngentyA2uiMessages({
    components: input.components,
    data: input.data,
    surfaceId: `ui-${crypto.randomUUID()}`,
  });
  return {
    components: input.components.length,
    ok: true,
    summary: "The inbox dashboard has been rendered.",
    title: input.title,
    _meta: {
      engenty: {
        a2ui: {
          catalog_id: ENGENTY_A2UI_CATALOG_ID,
          live: {
            kind: "inbox_dashboard",
            included: input.included,
            layout: input.layout,
            ...(input.connection_id
              ? { connection_id: input.connection_id }
              : {}),
          },
          messages,
          surface_id: surfaceId,
          title: input.title,
        },
      },
    },
  };
}

export const LIST_LIMIT = DASHBOARD_THREAD_LIMIT;
