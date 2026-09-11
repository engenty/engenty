// HEARTBEAT.md — what an agent should do when it wakes on its own.
//
// It was registered as an editable instruction document and composed into NO
// run (Phase 7 #10): agent.json lists only `.agents` and `.soul`, and the
// headless task-job path assembled the agent without instruction layers at all.
// So every word a module wrote about unattended behaviour was dead text.
//
// It belongs to exactly one situation — a run nobody asked for, started by a
// trigger — which is why it is resolved here per run instead of being folded
// into the agent's base instructions: in a chat the agent was asked, and
// "you woke up on your own, here is how to behave" is then false.
import { listRegisteredInstructionDocuments } from "@engenty/ai-core";
import { createLogger } from "@engenty/telemetry";
import { createInstructionOverridesStore } from "../../dal/instructions/instruction-overrides-store.js";
import { createDbSourceFromEnv } from "../../infra/tenant-db.js";

const logger = createLogger({ name: "heartbeat-layer" });

const HEARTBEAT_FILENAME = "heartbeat.md";

/** The module-declared HEARTBEAT.md for an agent, if it ships one. */
export function findHeartbeatDocument(agentId: string): {
  body: string;
  key: string;
} | null {
  const document = listRegisteredInstructionDocuments().find(
    (candidate) =>
      candidate.owner_kind === "agent" &&
      candidate.owner_id === agentId &&
      candidate.filename?.toLowerCase() === HEARTBEAT_FILENAME
  );
  if (!document) {
    return null;
  }
  const body = document.default_body.trim();
  return body ? { body, key: document.key } : null;
}

/**
 * The heartbeat layer for an unattended run: the tenant/user override when one
 * exists, else the module's shipped text. Never throws — a missing override
 * store means the seed still reaches the run.
 */
export async function resolveHeartbeatInstructions(params: {
  agentId: string;
  tenantId: string;
  userId: string;
}): Promise<string | null> {
  const seed = findHeartbeatDocument(params.agentId);
  if (!seed) {
    return null;
  }
  const source = createDbSourceFromEnv();
  if (!source) {
    return seed.body;
  }
  try {
    const store = createInstructionOverridesStore(source);
    const [userOverride, tenantOverride] = await Promise.all([
      store.getScopedOverride({
        documentKey: seed.key,
        scope: "user",
        tenantId: params.tenantId,
        userId: params.userId,
      }),
      store.getScopedOverride({
        documentKey: seed.key,
        scope: "tenant",
        tenantId: params.tenantId,
        userId: params.userId,
      }),
    ]);
    const override = (userOverride?.body ?? tenantOverride?.body ?? "").trim();
    return override || seed.body;
  } catch (error) {
    logger.warn("heartbeat override lookup failed; using the shipped text", {
      agentId: params.agentId,
      error: error instanceof Error ? error.message : String(error),
    });
    return seed.body;
  }
}
