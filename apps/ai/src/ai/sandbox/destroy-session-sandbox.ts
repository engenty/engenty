import { createLogger } from "@engenty/telemetry";

import { destroyEngentySandboxById } from "./destroy-engenty-sandbox.js";
import { listEngentyDockerSandboxes } from "./engenty-sandbox-docker.js";
import { parseEngentySandboxId } from "./parse-engenty-sandbox-id.js";

const logger = createLogger({ name: "apps/ai/destroy-session-sandbox" });

/**
 * Tear down every session-lifecycle container belonging to one thread.
 *
 * A conversation can hold MORE than one: the container id is keyed by thread
 * AND agent, so a copilot chat that delegated to the CLI agent has two. This
 * used to derive a single id from the thread, which meant closing such a
 * conversation left the sub-agent's container running until the age sweep.
 *
 * Lookup is by label rather than by constructing ids, because the set of agents
 * that ran in a thread is not knowable from the thread alone.
 *
 * Returns the number destroyed. Never rejects — teardown is best-effort on
 * every one of its call sites.
 */
export async function destroySessionLifecycleSandboxes(
  threadId: string
): Promise<number> {
  const target = threadId.trim();
  if (!target) {
    return 0;
  }
  const rows = await listEngentyDockerSandboxes({ runningOnly: false });
  let destroyed = 0;
  for (const row of rows) {
    const parsed = parseEngentySandboxId(row.sandbox_id);
    if (parsed?.lifecycle !== "session" || parsed.thread_id !== target) {
      continue;
    }
    try {
      await destroyEngentySandboxById(row.sandbox_id);
      destroyed += 1;
    } catch (err) {
      logger.warn("failed to destroy session sandbox", {
        message: err instanceof Error ? err.message : String(err),
        sandboxId: row.sandbox_id,
      });
    }
  }
  return destroyed;
}
