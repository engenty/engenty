import { createLogger } from "@engenty/telemetry";

import { destroyAllEngentyDockerSandboxes } from "./engenty-sandbox-docker.js";
import { destroyAllEngentyGondolinVms } from "./gondolin-vm-registry.js";

const logger = createLogger({ name: "apps/ai/sandbox-shutdown" });

let registered = false;

// Dev/prod hygiene: when apps/ai exits, tear down engenty-labelled sandboxes so
// orphaned CLI containers (Docker) and micro-VMs (Gondolin) do not linger after
// `pnpm dev:ai` stops.
export function registerEngentySandboxShutdownHook(): void {
  if (registered) {
    return;
  }
  registered = true;

  const sweep = (signal: string) => {
    void Promise.all([
      destroyAllEngentyDockerSandboxes(),
      destroyAllEngentyGondolinVms(),
    ])
      .then(([dockerDestroyed, gondolinDestroyed]) => {
        const destroyed = dockerDestroyed + gondolinDestroyed;
        if (destroyed > 0) {
          logger.info("destroyed engenty sandboxes on shutdown", {
            destroyed,
            gondolinDestroyed,
            signal,
          });
        }
      })
      .catch((err) => {
        logger.warn("sandbox shutdown sweep failed", {
          message: err instanceof Error ? err.message : String(err),
          signal,
        });
      });
  };

  process.once("SIGTERM", () => sweep("SIGTERM"));
  process.once("SIGINT", () => sweep("SIGINT"));
}
