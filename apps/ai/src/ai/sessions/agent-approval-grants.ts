import { createLogger } from "@engenty/telemetry";
import {
  type AgentApprovalGrantStore,
  createAgentApprovalGrantStoreFromEnv,
} from "../../dal/registry/agent-approval-grants.js";

const logger = createLogger({ name: "ai.approvals.agent-grants" });

let cachedStore: AgentApprovalGrantStore | null | undefined;

function storeFromEnv(): AgentApprovalGrantStore | null {
  if (cachedStore === undefined) {
    cachedStore = createAgentApprovalGrantStoreFromEnv();
  }
  return cachedStore;
}

/**
 * The operations this agent may run without asking — merged into every run's
 * approval grants (chat start, resume, delegated/headless runs), so an
 * approval "for this agent" holds wherever the agent works.
 *
 * A failed read yields [] — the gate then asks again, which is the safe
 * direction to fail.
 */
export async function loadAgentApprovalGrants(params: {
  agentId: string | null | undefined;
  store?: AgentApprovalGrantStore | null;
  tenantId: string;
}): Promise<string[]> {
  const store = params.store === undefined ? storeFromEnv() : params.store;
  if (!(store && params.agentId)) {
    return [];
  }
  try {
    return await store.list({
      agentId: params.agentId,
      tenantId: params.tenantId,
    });
  } catch (err) {
    logger.warn("agent_approval_grants_load_failed", {
      agentId: params.agentId,
      error: err instanceof Error ? err.message : String(err),
    });
    return [];
  }
}

/**
 * Record "approve for this agent". Non-fatal: the caller also writes a once
 * grant for the current request, so the approved call still runs; only the
 * standing half is lost, and the next call asks again.
 */
export async function persistAgentApprovalGrants(params: {
  agentId: string | null | undefined;
  grantedBy?: string | null;
  operationIds: readonly string[];
  store?: AgentApprovalGrantStore | null;
  tenantId: string;
}): Promise<void> {
  const store = params.store === undefined ? storeFromEnv() : params.store;
  if (!(store && params.agentId)) {
    logger.warn("agent_approval_grants_store_unavailable", {
      agentId: params.agentId ?? null,
    });
    return;
  }
  try {
    await store.add({
      agentId: params.agentId,
      grantedBy: params.grantedBy ?? null,
      operationIds: params.operationIds,
      tenantId: params.tenantId,
    });
  } catch (err) {
    logger.error("agent_approval_grants_persist_failed", {
      agentId: params.agentId,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}
