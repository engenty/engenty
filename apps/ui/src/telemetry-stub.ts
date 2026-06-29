/**
 * Browser stub for @engenty/telemetry.
 * Used so the UI app never bundles Node-only OpenTelemetry/evlog code.
 * Exports a no-op logger; same API as the real package for createLogger.
 */

export type LogLevel = "debug" | "info" | "warn" | "error";

export interface RuntimeLogger {
  debug: (msg: string, meta?: Record<string, unknown>) => void;
  error: (msg: string, meta?: Record<string, unknown>) => void;
  info: (msg: string, meta?: Record<string, unknown>) => void;
  warn: (msg: string, meta?: Record<string, unknown>) => void;
}

export interface CreateLoggerOptions {
  baseLevel?: LogLevel;
  debugEnvKey?: string;
  debugOverride?: boolean;
  name?: string;
}

const noop = (_msg: string, _meta?: Record<string, unknown>) => {};

export function createLogger(_opts: CreateLoggerOptions = {}): RuntimeLogger {
  return {
    debug: noop,
    error: noop,
    info: noop,
    warn: noop,
  };
}

/** Browser stub: no `process.env` reads in the client bundle. */
export function env(
  _key: string,
  _fallback: string | undefined
): string | undefined {
  return;
}

/** Browser stub: unset keys are not defined. */
export function envIsDefined(_key: string): boolean {
  return false;
}

/** Browser stub: env flags are never true. */
export function envIsTruthy(_key: string): boolean {
  return false;
}

/** Browser stub: no raw LOG_LEVEL token. */
export function getProcessLogLevel(): string | undefined {
  return;
}

/** Browser stub: default log level for createLogger parity. */
export function getLogLevel(): LogLevel {
  return "info";
}

/** Browser stub: client builds are never LOG_LEVEL=debug via Node env. */
export function isDebug(): boolean {
  return false;
}

/** Browser stub: not production in the browser bundle. */
export function isProduction(): boolean {
  return false;
}

/** Browser stub: no Node `NODE_ENV` string in the client. */
export function nodeEnv(): string | undefined {
  return;
}
