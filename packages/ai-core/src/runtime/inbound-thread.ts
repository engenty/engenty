import type {
  InboundEvent,
  ResolvedThread,
  RouteDecision,
} from "../inbound-contracts.js";
import { resolveActionDefinitionById } from "../registry.js";
import type { ThreadStore } from "../threads/store.js";
import { getThreadStore } from "../threads/store.js";
import { isAgentThreadId } from "./agent-thread-id.js";
import { deterministicOrchestratorThreadId } from "./deterministic-thread-id.js";
import { upsertThreadState } from "./thread-state.js";

function normalizeThreadKey(value: string | null | undefined): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
}

function buildExternalThreadKey(event: InboundEvent): string | null {
  const externalThreadKey = normalizeThreadKey(event.external_thread_key);
  if (!externalThreadKey) {
    return null;
  }
  const tenantNamespace =
    typeof event.tenant_id === "string" && event.tenant_id.length > 0
      ? event.tenant_id
      : "global";
  return `external:${tenantNamespace}:${event.channel}:${externalThreadKey}`;
}

export function resolveInboundThreadKey(event: InboundEvent): string | null {
  const directThreadKey = normalizeThreadKey(event.thread_key);
  if (directThreadKey) {
    return directThreadKey;
  }

  if (
    event.inbound_kind === "message_external" &&
    event.channel !== "web_copilot"
  ) {
    return buildExternalThreadKey(event);
  }
  return null;
}

export async function upsertThread(params: {
  decision: RouteDecision;
  event: InboundEvent;
  session: ResolvedThread;
  store?: ThreadStore | null;
  summary?: string | null;
  status?: "idle" | "running" | "waiting" | "failed" | "completed";
}) {
  const { decision, session } = params;
  const threadId = session.thread_id;
  if (!threadId) {
    return null;
  }
  let currentAgentId: string | null = null;
  if (decision.target.type === "agent") {
    currentAgentId = decision.target.agent_id;
  } else if (
    decision.target.type === "action" &&
    decision.target.thread_id != null &&
    decision.target.thread_id === threadId
  ) {
    const action = resolveActionDefinitionById(decision.target.action_id);
    currentAgentId = action?.agent_id ?? null;
  }
  if (!currentAgentId) {
    return null;
  }
  const store = params.store ?? getThreadStore();
  if (!store) {
    return null;
  }
  const sessionKey = session.thread_key;
  return upsertThreadState({
    current_agent_id: currentAgentId,
    last_message_at: params.event.created_at,
    route_context: {
      ...params.event.context,
      channel: params.event.channel,
      inbound_kind: params.event.inbound_kind,
      thread_key: sessionKey,
    },
    thread_id: threadId,
    status: params.status,
    store,
    summary: params.summary,
    tenant_id: params.event.tenant_id,
    user_id: params.event.user_id,
  });
}

export async function resolveThread(params: {
  event: InboundEvent;
  threadStore?: ThreadStore | null;
}): Promise<ResolvedThread> {
  const { event } = params;
  if (event.inbound_kind === "action_trigger" && !event.requested_agent_id) {
    return {
      current_agent_id: null,
      thread_key: null,
      source: "none",
      thread_id: null,
    };
  }

  const sessionKey = resolveInboundThreadKey(event);
  if (!sessionKey) {
    return {
      current_agent_id: null,
      thread_key: null,
      source: "none",
      thread_id: null,
    };
  }

  const store = params.threadStore ?? getThreadStore();
  if (!store) {
    return {
      current_agent_id: null,
      thread_key: sessionKey,
      source: "none",
      thread_id: null,
    };
  }

  if (isAgentThreadId(sessionKey)) {
    const existing = await store.getById(sessionKey);
    return {
      current_agent_id:
        typeof existing?.current_agent_id === "string"
          ? existing.current_agent_id
          : null,
      thread_key: sessionKey,
      thread_id: sessionKey,
      source: existing ? "existing" : "new",
    };
  }

  if (
    typeof event.tenant_id !== "string" ||
    event.tenant_id.length === 0 ||
    typeof event.user_id !== "string" ||
    event.user_id.length === 0
  ) {
    return {
      current_agent_id: null,
      thread_key: sessionKey,
      source: "none",
      thread_id: null,
    };
  }

  const derivedThreadId = deterministicOrchestratorThreadId({
    tenant_id: event.tenant_id,
    scope: event.user_id,
    stable_key: sessionKey,
  });
  const existingDerived = await store.getById(derivedThreadId);
  if (existingDerived) {
    return {
      current_agent_id:
        typeof existingDerived.current_agent_id === "string"
          ? existingDerived.current_agent_id
          : null,
      thread_key: sessionKey,
      thread_id: existingDerived.id,
      source: "existing",
    };
  }

  return {
    current_agent_id: null,
    thread_key: sessionKey,
    thread_id: derivedThreadId,
    source: "new",
  };
}
