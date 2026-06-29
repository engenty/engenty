import { loadCoreRuntimeEnvFromCallerSrcDir } from "@engenty/environment/env";
import { initCoreI18n } from "@engenty/i18n/core";
import { initLangfuseOtel } from "@engenty/telemetry";
import { startApiServer } from "./api/server.js";

loadCoreRuntimeEnvFromCallerSrcDir(import.meta.url);

type ApiRuntime = Awaited<ReturnType<typeof startApiServer>>;

declare global {
  // Persist across watch-mode module re-executions in the same process.
  // eslint-disable-next-line no-var
  var __engentyApiRuntime: ApiRuntime | undefined;
  // eslint-disable-next-line no-var
  var __engentyApiSignalHandlersInstalled: boolean | undefined;
  // eslint-disable-next-line no-var
  var __engentyApiBootLock: Promise<void> | undefined;
}

function closeRuntime(runtime: ApiRuntime | undefined): Promise<void> {
  if (!runtime) {
    return Promise.resolve();
  }
  return new Promise((resolve) => {
    try {
      runtime.server.close(() => resolve());
    } catch {
      resolve();
    }
  });
}

function ensureSignalHandlers() {
  if (globalThis.__engentyApiSignalHandlersInstalled) {
    return;
  }
  const shutdown = () => {
    void closeRuntime(globalThis.__engentyApiRuntime).finally(() => {
      process.exit(0);
    });
  };
  process.once("SIGINT", shutdown);
  process.once("SIGTERM", shutdown);
  globalThis.__engentyApiSignalHandlersInstalled = true;
}

async function main() {
  await initCoreI18n({ coreNamespaces: {} });
  await initLangfuseOtel();
  await closeRuntime(globalThis.__engentyApiRuntime);
  globalThis.__engentyApiRuntime = await startApiServer();
  ensureSignalHandlers();
}

const previousBoot = globalThis.__engentyApiBootLock ?? Promise.resolve();
globalThis.__engentyApiBootLock = previousBoot
  .then(main)
  .catch(async (error) => {
    const { initEvlog, log } = await import("./observability/evlog.js");
    initEvlog();
    log.error(
      "api-entry",
      error instanceof Error ? error.message : String(error)
    );
  });
