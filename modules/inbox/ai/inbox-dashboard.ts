import { createClassifierClient, roleModelRef } from "@engenty/ai-core";
import {
  A2UI_SURFACE_MAX_BYTES,
  aggregateInboxDashboard,
  buildEngentyA2uiMessages,
  composeSurface,
  DASHBOARD_BLOCKS,
  DASHBOARD_THREAD_LIMIT,
  type DashboardBlockId,
  ENGENTY_A2UI_CATALOG_ID,
  inboxDashboardCandidates,
  validateEngentyA2uiComponents,
} from "@engenty/generative-a2ui/spec";
import type { NoulQuestion } from "@engenty/typesafe-client";
import type { InboxThreadListItem } from "../src/schema/types.js";

const MAIL_FLOOR = 0.5;

/** Platform classifier when bound and keyed; otherwise null (fail open). */
function defaultJevClient() {
  try {
    return createClassifierClient(roleModelRef("classifier"))?.client ?? null;
  } catch {
    return null;
  }
}

function isBlock(value: string): value is DashboardBlockId {
  return (DASHBOARD_BLOCKS as readonly string[]).includes(value);
}

/**
 * The dashboard for a request: Jev picks the blocks and, in the same call,
 * which mail rows need attention.
 */
export async function composeInboxDashboardSurface(params: {
  connection_id?: string;
  prompt: string;
  threads: readonly InboxThreadListItem[];
}): Promise<{
  components: Record<string, unknown>[];
  connection_id?: string;
  data: Record<string, unknown>;
  included: DashboardBlockId[];
  title: string;
}> {
  const data = aggregateInboxDashboard(params.threads);
  const mailQuestions: Record<string, NoulQuestion> = {};
  for (let index = 0; index < data.items.length; index++) {
    mailQuestions[`m${index}`] = {
      instructions:
        "This thread needs attention now (a person, a deal, or a decision — not a newsletter or receipt).",
      type: "noul",
    };
  }
  const composed = await composeSurface({
    candidates: inboxDashboardCandidates(),
    context: {
      threads: data.items.map((item, index) => ({ index, ...item })),
    },
    data: { ...data },
    includeFloor: 0.45,
    jev: defaultJevClient(),
    prompt: params.prompt,
    questions: mailQuestions,
  });
  if (composed.source === "jev") {
    const items = data.items.filter((_item, index) => {
      const answer = composed.answers[`m${index}`];
      return answer?.type === "noul" && answer.noul >= MAIL_FLOOR;
    });
    composed.data.items = items;
  }
  return {
    components: composed.components,
    data: composed.data,
    included: composed.kept.filter(isBlock),
    title: "Inbox",
    ...(params.connection_id ? { connection_id: params.connection_id } : {}),
  };
}

export function dashboardUiResult(input: {
  components: Record<string, unknown>[];
  connection_id?: string;
  data: Record<string, unknown>;
  included: DashboardBlockId[];
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
