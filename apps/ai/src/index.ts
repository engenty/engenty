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

// A floating rejection must not kill this process: it hosts every tenant's
// agent runtime, and dependency code does let async work escape ownership —
// observed live 2026-08-03 when a Slack adapter post failed (invalid token;
// a platform outage behaves the same) inside Chat SDK's render driver and
// took the whole process down (the specific window is also patched:
// patches/@mastra__core@1.52.1.patch). Log loudly instead of crashing.
// Deliberately NOT handling uncaughtException — a synchronous throw means
// unknown corrupted state, and the default crash-and-supervise is correct.
process.on("unhandledRejection", (reason) => {
  logger.error("unhandled promise rejection (process kept alive)", {
    message: reason instanceof Error ? reason.message : String(reason),
    stack: reason instanceof Error ? reason.stack : undefined,
  });
});
// Dedicated env var (not bare PORT) so core and ai never collide on a shared
// PORT. Mirrors `ports.ai` in the repo-root ports.config.mjs.
const port = Number(process.env.ENGENTY_AI_PORT ?? 8790);
// Defaults to loopback for local dev; containers must set HOST=0.0.0.0 (as
// deploy/docker-compose.yaml does) or the service is unreachable from the
// gateway despite a passing localhost healthcheck.
const hostname = process.env.ENGENTY_AI_HOST ?? process.env.HOST ?? "127.0.0.1";

// Hard deadline for a graceful stop. MUST stay below the orchestrator's kill
// timeout (Docker's default is 10s) or the graceful path is decorative: the
// SIGKILL lands first and every stop costs the full wait anyway.
const shutdownTimeoutMs = Number(
  process.env.ENGENTY_AI_SHUTDOWN_TIMEOUT_MS ?? 8000
);

async function main() {
  // Gate on run-snapshot Postgres readiness BEFORE importing ./app.js. Mastra
  // opens the PostgresStore at startup to create its tables; an unreachable DB
  // would otherwise crash the process with an opaque uncaught rejection. This
  // waits/retries (~60s by default, see ENGENTY_AI_DB_READY_TIMEOUT_MS) so a DB
  // that is merely still booting recovers instead of crashing the dev process,
  // then fails loud with one actionable line (see mastra-storage-preflight.ts).
  await ensureMastraStorageReachable();

  // Setup-UI overrides into process.env BEFORE app.js evaluates the Mastra
  // instance, whose observability config reads the sink keys at that moment.
  const { hydrateAiPlatformSettings } = await import(
    "./platform-settings-hydrate.js"
  );
  await hydrateAiPlatformSettings(logger);

  const { createApp } = await import("./app.js");
  const { mastra } = await import("../ai/index.js");
  const { sweepEngentySandboxes } = await import(
    "./ai/sandbox/sandbox-shutdown-sweep.js"
  );
  const { startSandboxStagingReaper } = await import(
    "./ai/sandbox/sandbox-staging-reaper.js"
  );
  // Containers are destroyed per run; their host staging dirs are not. Without
  // this the sandbox root grows until the disk fills.
  startSandboxStagingReaper();
  const { createNodeWebSocket } = await import("@hono/node-ws");
  // The cascade voice broker needs WS upgrades on this server. createApp
  // registers the route with the upgrade helper; injectWebSocket attaches
  // the upgrade listener to the node server below.
  const wsBridge: { inject: ((server: unknown) => void) | null } = {
    inject: null,
  };
  // Seed platform bindings (and the catalog) inside createApp before the
  // classifier warm: after a DB reset `ai.model_binding` is empty, and the
  // bindings-only resolvers throw until that seed lands.
  const app = await createApp({
    createUpgradeWebSocket: (honoApp) => {
      const nodeWs = createNodeWebSocket({ app: honoApp });
      wsBridge.inject = (server) =>
        nodeWs.injectWebSocket(
          server as Parameters<typeof nodeWs.injectWebSocket>[0]
        );
      return nodeWs.upgradeWebSocket;
    },
  });

  // The effort router's first classifier question must not pay the cold
  // connection (Jev; an LLM classifier has nothing to warm).
  const { warmClassifier } = await import("@engenty/ai-core");
  const { resolvePlatformClassifierModelId } = await import(
    "./ai/classifier-model.js"
  );
  const classifierModelId = await resolvePlatformClassifierModelId();
  if (classifierModelId && warmClassifier(classifierModelId)) {
    logger.info("Classifier reachable; warming the connection", {
      model: classifierModelId,
    });
  } else {
    // Named at boot because every symptom of a missing classifier is silent:
    // Auto just stops picking high, search stops trimming, and classifying
    // mail fails on a button nobody is watching.
    logger.warn(
      "Platform classifier unreachable (no key for its bound model): Auto effort falls back to its lexical guess, KB search skips verification, and inbox classification is unavailable",
      { model: classifierModelId }
    );
  }

  const server = serve(
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
  wsBridge.inject?.(server);

  // Exit on SIGTERM/SIGINT.
  //
  // This process used to have no way to stop. app.ts registers SIGTERM
  // listeners to halt its queue consumers, and registering ANY listener
  // suppresses Node's default terminate-on-SIGTERM — but nothing closed the
  // HTTP server and nothing called exit, so the open listener kept the event
  // loop alive until Docker gave up and sent SIGKILL. Every stop cost the full
  // kill timeout, and on a deploy that wait is pure downtime: Coolify removes
  // the old containers BEFORE starting the new stack (compose build packs get
  // no rolling update), so the site is already dark while we sit there.
  //
  // Measured on the v0.1.106 deploy: 63s between "Removing old containers" and
  // "Starting new application", with the image pulls taking 1s of it.
  const shutdown = (signal: NodeJS.Signals) => {
    logger.info("apps/ai shutting down", { signal, shutdownTimeoutMs });

    // Never let cleanup outlive the orchestrator's patience. unref'd so this
    // timer cannot, by itself, be the thing keeping the process alive.
    const deadline = setTimeout(() => {
      logger.warn("apps/ai shutdown timed out — exiting anyway", {
        signal,
        shutdownTimeoutMs,
      });
      closeAllConnections();
      process.exit(0);
    }, shutdownTimeoutMs);
    deadline.unref();

    void Promise.all([
      closeServer(),
      sweepEngentySandboxes(signal),
      // Exporters batch; an unflushed Langfuse queue is a lost trace.
      mastra.observability.flush().catch((error: unknown) => {
        logger.warn("observability flush failed", { error: String(error) });
      }),
    ]).then(() => {
      clearTimeout(deadline);
      logger.info("apps/ai shutdown complete", { signal });
      process.exit(0);
    });
  };

  // `once`, so a second Ctrl-C is handled by Node's default (immediate exit)
  // rather than being swallowed — an impatient operator gets what they asked
  // for instead of a process that appears to ignore them.
  process.once("SIGTERM", shutdown);
  process.once("SIGINT", shutdown);

  function closeAllConnections(): void {
    (server as { closeAllConnections?: () => void }).closeAllConnections?.();
  }

  // Since Node 19, close() drops idle keep-alive sockets by itself, so this
  // resolves promptly for ordinary traffic (verified on the pinned node:24
  // runtime). What it will NOT interrupt is an ACTIVE connection — and this
  // service streams agent runs over long-lived SSE, which can stay active for
  // minutes. Those are what the deadline above exists for; without it, one
  // open stream would hold shutdown until SIGKILL and we would be back where
  // we started.
  function closeServer(): Promise<void> {
    return new Promise<void>((resolve) => {
      server.close(() => resolve());
    });
  }
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
