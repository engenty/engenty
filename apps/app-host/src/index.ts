import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadWorkspaceDotEnvIntoProcess } from "@engenty/environment/env";
import { createLogger } from "@engenty/telemetry";
import { serve } from "@hono/node-server";
import { createAppHost } from "./app.js";
import { AppStore } from "./app-store.js";
import { loadAppHostConfig } from "./config.js";
import { AppRuntime } from "./runtime.js";

const packageRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  ".."
);
loadWorkspaceDotEnvIntoProcess(packageRoot);

const logger = createLogger({ name: "apps/app-host" });

function main(): void {
  const config = loadAppHostConfig();
  const store = new AppStore({
    maxSourceBytes: config.maxSourceBytes,
    spacesDir: config.spacesDir,
  });
  const runtime = new AppRuntime(config, store);
  runtime.start();

  const app = createAppHost({ config, runtime, store });

  serve(
    { fetch: app.fetch, hostname: config.hostname, port: config.port },
    (info) => {
      logger.info("apps/app-host listening", {
        authenticated: Boolean(config.internalToken),
        bindUrl: `http://${config.hostname}:${info.port}`,
        perAppNamespace: config.perAppNamespace,
        spacesDir: config.spacesDir,
      });
    }
  );
}

try {
  main();
} catch (err) {
  logger.error("apps/app-host failed to start", {
    message: err instanceof Error ? err.message : String(err),
  });
  process.exitCode = 1;
}
