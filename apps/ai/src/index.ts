import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadWorkspaceDotEnvIntoProcess } from "@engenty/environment/env";
import { createLogger } from "@engenty/telemetry";
import { serve } from "@hono/node-server";
import { DatabaseNotReadyError } from "./ai/db-readiness.js";
import { ensureMastraStorageReachable } from "./ai/mastra-storage-preflight.js";

const packageRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  ".."
);
// Load dotenv BEFORE importing ./app.js: app.js eagerly evaluates ../ai/index.js,
// which constructs the Mastra instance with Postgres run-snapshot storage from
// SUPABASE_DB_URL at module-eval time. A static import would hoist above this
// call and build Mastra without storage (breaking native HITL resume).
loadWorkspaceDotEnvIntoProcess(packageRoot);

const logger = createLogger({ name: "apps/ai" });
// Dedicated env var (not bare PORT) so core and ai never collide on a shared
// PORT. Mirrors `ports.ai` in the repo-root ports.config.mjs.
const port = Number(process.env.ENGENTY_AI_PORT ?? 8790);
// Defaults to loopback for local dev; containers must set HOST=0.0.0.0 (as
// deploy/docker-compose.yaml does) or the service is unreachable from the
// gateway despite a passing localhost healthcheck.
const hostname = process.env.ENGENTY_AI_HOST ?? process.env.HOST ?? "127.0.0.1";

async function main() {
  // Gate on run-snapshot Postgres readiness BEFORE importing ./app.js. Mastra
  // opens the PostgresStore at startup to create its tables; an unreachable DB
  // would otherwise crash the process with an opaque uncaught rejection. This
  // waits/retries (~60s by default, see ENGENTY_AI_DB_READY_TIMEOUT_MS) so a DB
  // that is merely still booting recovers instead of crashing the dev process,
  // then fails loud with one actionable line (see mastra-storage-preflight.ts).
  await ensureMastraStorageReachable();

  const { createApp } = await import("./app.js");
  const { registerEngentySandboxShutdownHook } = await import(
    "./ai/sandbox/register-sandbox-shutdown-hook.js"
  );
  const app = await createApp();
  registerEngentySandboxShutdownHook();

  serve(
    {
      fetch: app.fetch,
      port,
      hostname,
    },
    (info) => {
      logger.info("apps/ai listening", {
        bindUrl: `http://${hostname}:${info.port}`,
        publicUrl:
          process.env.PORTLESS_URL?.trim() ||
          process.env.ENGENTY_AI_BASE_URL?.trim() ||
          undefined,
      });
    }
  );
}

main().catch((err) => {
  // Fail loud but legible: a real misconfig (DB down / bad URL) exits non-zero
  // with one actionable line, never an unhandled-rejection stack spew.
  if (err instanceof DatabaseNotReadyError) {
    logger.error(err.message, {
      attempts: err.attempts,
      hint: err.hint,
      target: err.target,
      timeoutMs: err.timeoutMs,
    });
  } else {
    logger.error("apps/ai failed to start", {
      message: err instanceof Error ? err.message : String(err),
    });
  }
  process.exitCode = 1;
});
