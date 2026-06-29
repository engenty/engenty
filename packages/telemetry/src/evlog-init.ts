import type { LoggerConfig } from "evlog";
import { initLogger, log } from "evlog";
import { env, getLogLevel, isProduction } from "./process-env.js";

export type InitEvlogConfig = Partial<
  Pick<LoggerConfig, "drain" | "env" | "minLevel" | "pretty" | "sampling">
>;

let initialized = false;

/**
 * Initialize evlog. Call once at application startup.
 * Accepts optional drain, sampling, and env overrides from the app.
 * Idempotent: subsequent calls are no-ops.
 */
export function initEvlog(config?: InitEvlogConfig): void {
  if (initialized) {
    return;
  }
  initLogger({
    env: {
      service: "engenty",
      environment: env("NODE_ENV", "development"),
      ...config?.env,
    },
    pretty: config?.pretty ?? !isProduction(),
    drain: config?.drain,
    minLevel: config?.minLevel ?? getLogLevel(),
    sampling: config?.sampling,
  });
  initialized = true;
}

/**
 * Logger interface for boot-time and non-request contexts.
 */
export interface BootLogger {
  debug: (msg: string) => void;
  error: (msg: string) => void;
  info: (msg: string) => void;
  warn: (msg: string) => void;
}

/**
 * Create a boot-time logger that uses evlog's global log.
 * Call initEvlog() first (or it will be called with defaults by createLogger).
 */
export function createBootApiLogger(): BootLogger {
  return {
    info: (msg) => log.info("core", msg),
    warn: (msg) => log.warn("core", msg),
    error: (msg) => log.error("core", msg),
    debug: (msg) => log.debug("core", msg),
  };
}
