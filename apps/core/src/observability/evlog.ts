/**
 * Central evlog setup for engenty API.
 * Initializes evlog with Axiom drain and sampling; provides Hono request-scoped loggers.
 */

import fs from "node:fs";
import path from "node:path";
import { getLogLevel } from "@engenty/telemetry";
import {
  createRequestLogger,
  log as evlogLog,
  initLogger,
  type RequestLogger,
} from "evlog";
import { createAxiomDrain } from "evlog/axiom";
import { createFsDrain } from "evlog/fs";
import { createDrainPipeline } from "evlog/pipeline";
import type { ApiLogger } from "../api/routes/types.js";

export type { RequestLogger } from "evlog";
export { createError, log, parseError } from "evlog";

const SERVICE_NAME = "engenty-api";
const PNPM_WORKSPACE_FILE = "pnpm-workspace.yaml";

type DrainFn = (ctx: import("evlog").DrainContext) => void | Promise<void>;

/** Find repo root by walking up to a dir containing pnpm-workspace.yaml. */
function findRepoRoot(): string {
  let dir = process.cwd();
  for (;;) {
    if (fs.existsSync(path.join(dir, PNPM_WORKSPACE_FILE))) {
      return dir;
    }
    const parent = path.dirname(dir);
    if (parent === dir) {
      break;
    }
    dir = parent;
  }
  return process.cwd();
}

/** Resolved evlog log directory (repo root logs/ or EVLOG_LOG_DIR). Exported for log inspector API. */
export function getEvlogLogDir(): string {
  if (typeof process === "undefined") {
    return "logs";
  }
  const envDir = process.env.EVLOG_LOG_DIR;
  if (envDir && typeof envDir === "string") {
    const trimmed = envDir.trim();
    if (path.isAbsolute(trimmed)) {
      return trimmed;
    }
    return path.join(findRepoRoot(), trimmed);
  }
  return path.join(findRepoRoot(), "logs");
}

function resolveEvlogLogDir(): string {
  return getEvlogLogDir();
}

function resolveAxiomDrain(): DrainFn | undefined {
  const isProduction =
    typeof process !== "undefined" && process.env.NODE_ENV === "production";
  if (!isProduction) {
    return;
  }
  const token =
    (typeof process !== "undefined" && process.env.EVLOG_AXIOM_TOKEN) ||
    (typeof process !== "undefined" && process.env.AXIOM_TOKEN);
  const dataset =
    (typeof process !== "undefined" && process.env.EVLOG_AXIOM_DATASET) ||
    (typeof process !== "undefined" && process.env.AXIOM_DATASET) ||
    "engenty-logs";

  if (!token || typeof token !== "string") {
    return;
  }

  const pipeline = createDrainPipeline<import("evlog").DrainContext>({
    batch: { size: 50, intervalMs: 5000 },
  });
  return pipeline(createAxiomDrain({ dataset, token }));
}

function resolveDrain(): DrainFn {
  const logDir = resolveEvlogLogDir();
  try {
    fs.mkdirSync(logDir, { recursive: true });
  } catch {
    // proceed; createFsDrain or first write may fail
  }
  const fsDrain = createFsDrain({ dir: logDir });
  const axiomDrain = resolveAxiomDrain();
  if (!axiomDrain) {
    return fsDrain;
  }
  return async (ctx) => {
    await Promise.allSettled([fsDrain(ctx), axiomDrain(ctx)]);
  };
}

/**
 * Initialize evlog. Call once at API startup.
 * Calls evlog's initLogger directly so the drain is registered on the same
 * instance that provides createRequestLogger (avoids pnpm multi-instance mismatch).
 */
export function initEvlog(): void {
  const isProduction =
    typeof process !== "undefined" && process.env.NODE_ENV === "production";
  const drain = resolveDrain();

  initLogger({
    env: { service: SERVICE_NAME },
    pretty: !isProduction,
    drain,
    minLevel: getLogLevel(),
    sampling: isProduction
      ? {
          rates: { info: 10, debug: 5, warn: 100, error: 100 },
          keep: [{ status: 400 }, { duration: 1000 }],
        }
      : undefined,
  });
}

/**
 * Create a request-scoped logger for Hono. Use in middleware.
 */
export function createHonoRequestLogger(options: {
  method: string;
  path: string;
  requestId?: string;
}): RequestLogger {
  return createRequestLogger({
    method: options.method,
    path: options.path,
    requestId: options.requestId,
  });
}

/**
 * Adapt a RequestLogger to the ApiLogger interface for use in route handlers
 * that receive logger via params.
 */
export function createApiLoggerFromRequestLogger(
  requestLogger: RequestLogger
): ApiLogger {
  return {
    info: (msg) => requestLogger.info(msg),
    warn: (msg) => requestLogger.warn(msg),
    error: (msg) => requestLogger.error(msg),
    debug: (msg) => requestLogger.info(msg), // RequestLogger has no debug; use info
  };
}

/**
 * Create an ApiLogger for boot-time and non-request contexts (plugin loader,
 * sync worker, etc.). Uses the same evlog instance as request loggers.
 */
export function createBootApiLogger(): ApiLogger {
  return {
    info: (msg) => evlogLog.info("core", msg),
    warn: (msg) => evlogLog.warn("core", msg),
    error: (msg) => evlogLog.error("core", msg),
    debug: (msg) => evlogLog.debug("core", msg),
  };
}
