import type { AgentSessionStore } from "../../dal/agent-sessions/index.js";
import type { AgentSessionStatus } from "../../dal/agent-sessions/types.js";
import type { AiSessionScope } from "../sessions/types.js";

/** Persist thread status for session-list indicators (best-effort). */
export async function patchThreadStatus(input: {
  scope: AiSessionScope;
  status: AgentSessionStatus;
  store: AgentSessionStore;
  threadId: string;
}): Promise<void> {
  try {
    await input.store.updateSessionForUser({
      status: input.status,
      tenantId: input.scope.tenantId,
      threadId: input.threadId,
      userId: input.scope.userId,
    });
  } catch (error) {
    console.error(
      `[conversation] failed to set thread status=${input.status}:`,
      error
    );
  }
}
