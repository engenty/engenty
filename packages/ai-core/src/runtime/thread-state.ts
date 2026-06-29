import type { OrchestratorThreadRecord } from "../contracts.js";
import type { ThreadStore } from "../threads/store.js";
import { getThreadStore } from "../threads/store.js";

// Distinguish "field intentionally provided as null" from "field omitted, keep stored value".
function hasOwn<K extends string>(
  value: object,
  key: K
): value is Record<K, unknown> {
  return Object.hasOwn(value, key);
}

function toRouteContext(
  value: OrchestratorThreadRecord["route_context"] | undefined
): Record<string, unknown> {
  return value && typeof value === "object" ? value : {};
}

export async function getThreadSnapshot(params: {
  thread_id: string;
  store?: ThreadStore | null;
}): Promise<{
  route_context: Record<string, unknown>;
  session: OrchestratorThreadRecord | null;
}> {
  const store = params.store ?? getThreadStore();
  if (!store) {
    return {
      route_context: {},
      session: null,
    };
  }
  const session = await store.getById(params.thread_id);
  return {
    route_context: toRouteContext(session?.route_context),
    session,
  };
}

// Shared session merge policy for ai-core runtimes.
export async function upsertThreadState(params: {
  current_agent_id?: string | null;
  last_action_id?: string | null;
  last_message_at?: string | null;
  route_context?: Record<string, unknown>;
  thread_id: string;
  status?: "idle" | "running" | "waiting" | "failed" | "completed";
  store?: ThreadStore | null;
  summary?: string | null;
  tenant_id?: string | null;
  title?: string | null;
  user_id?: string | null;
  workspace_id?: string | null;
}): Promise<OrchestratorThreadRecord | null> {
  const store = params.store ?? getThreadStore();
  if (!store) {
    return null;
  }

  const { route_context, session } = await getThreadSnapshot({
    store,
    thread_id: params.thread_id,
  });

  const tenantId = hasOwn(params, "tenant_id")
    ? params.tenant_id
    : session?.tenant_id;
  const userId = hasOwn(params, "user_id") ? params.user_id : session?.user_id;
  if (!(tenantId && userId)) {
    return null;
  }

  let workspaceId: string | null;
  if (hasOwn(params, "workspace_id")) {
    workspaceId = params.workspace_id ?? null;
  } else {
    workspaceId = session?.workspace_id ?? null;
  }

  return store.upsert({
    current_agent_id: hasOwn(params, "current_agent_id")
      ? params.current_agent_id
      : (session?.current_agent_id ?? null),
    id: params.thread_id,
    last_action_id: hasOwn(params, "last_action_id")
      ? params.last_action_id
      : (session?.last_action_id ?? null),
    last_message_at: hasOwn(params, "last_message_at")
      ? params.last_message_at
      : (session?.last_message_at ?? null),
    route_context: hasOwn(params, "route_context")
      ? {
          ...route_context,
          ...params.route_context,
        }
      : route_context,
    status: hasOwn(params, "status")
      ? params.status
      : (session?.status ?? "idle"),
    summary: hasOwn(params, "summary")
      ? params.summary
      : (session?.summary ?? null),
    tenant_id: tenantId,
    title: hasOwn(params, "title") ? params.title : (session?.title ?? null),
    user_id: userId,
    workspace_id: workspaceId,
  });
}
