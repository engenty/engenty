import { createLogger } from "@engenty/telemetry";

import { destroyAllEngentyDockerSandboxes } from "./engenty-sandbox-docker.js";

const logger = createLogger({ name: "apps/ai/sandbox-shutdown" });

let swept = false;

/**
 * Tear down engenty-labelled sandboxes so orphaned CLI containers do not linger
 * after the process stops.
 *
 * This used to register its own SIGTERM/SIGINT listeners and fire the sweep
 * unawaited. That only ever completed because nothing else exited the process:
 * it survived on borrowed time until Docker's SIGKILL. Now that shutdown is
 * ordered (see apps/ai/src/index.ts) the sweep has to be awaitable, or a prompt
 * exit would cut it off.
 *
 * Never rejects — shutdown must not hang on sandbox cleanup — and runs at most
 * once, since both signals can arrive.
 */
export async function sweepEngentySandboxes(signal: string): Promise<void> {
  if (swept) {
    return;
  }
  swept = true;
  try {
    const destroyed = await destroyAllEngentyDockerSandboxes();
    if (destroyed > 0) {
      logger.info("destroyed engenty sandboxes on shutdown", {
        destroyed,
        signal,
      });
    }
  } catch (err) {
    logger.warn("sandbox shutdown sweep failed", {
      message: err instanceof Error ? err.message : String(err),
      signal,
    });
  }
}
