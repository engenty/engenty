import { log } from "evlog";
import { initEvlog } from "./evlog-init.js";
import type { LogLevel } from "./process-env.js";
import { envIsTruthy, getLogLevel } from "./process-env.js";

export type { LogLevel } from "./process-env.js";

const LEVEL_ORDER: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

export interface RuntimeLogger {
  debug: (msg: string, meta?: Record<string, unknown>) => void;
  error: (msg: string, meta?: Record<string, unknown>) => void;
  info: (msg: string, meta?: Record<string, unknown>) => void;
  warn: (msg: string, meta?: Record<string, unknown>) => void;
}

export interface CreateLoggerOptions {
  /** Minimum level from config. Default "info". */
  baseLevel?: LogLevel;
  /** Env key for debug override. When "true", enables debug. Default "AI_DEBUG". */
  debugEnvKey?: string;
  /** Override: if true, treat as debug level regardless of LOG_LEVEL. */
  debugOverride?: boolean;
  /** Name prefix for log output (e.g. "ai-core"). Default empty. */
  name?: string;
}

function ensureEvlog(): void {
  initEvlog();
}

/** Creates a LOG_LEVEL-aware runtime logger. Respects LOG_LEVEL and optional debug override env. Uses evlog for structured output. */
export function createLogger(opts: CreateLoggerOptions = {}): RuntimeLogger {
  const {
    name = "",
    baseLevel = "info",
    debugOverride = false,
    debugEnvKey = "AI_DEBUG",
  } = opts;

  const level = getLogLevel();
  const envDebug = envIsTruthy(debugEnvKey);
  const minLevel = debugOverride || envDebug ? 0 : LEVEL_ORDER[level];
  const base = LEVEL_ORDER[baseLevel];

  function shouldLog(l: LogLevel): boolean {
    return LEVEL_ORDER[l] >= minLevel && LEVEL_ORDER[l] >= base;
  }

  const tag = name || "app";

  return {
    debug: (msg, meta) => {
      if (shouldLog("debug")) {
        ensureEvlog();
        if (meta && Object.keys(meta).length > 0) {
          log.debug({ tag, message: msg, ...meta });
        } else {
          log.debug(tag, msg);
        }
      }
    },
    info: (msg, meta) => {
      if (shouldLog("info")) {
        ensureEvlog();
        if (meta && Object.keys(meta).length > 0) {
          log.info({ tag, message: msg, ...meta });
        } else {
          log.info(tag, msg);
        }
      }
    },
    warn: (msg, meta) => {
      if (shouldLog("warn")) {
        ensureEvlog();
        if (meta && Object.keys(meta).length > 0) {
          log.warn({ tag, message: msg, ...meta });
        } else {
          log.warn(tag, msg);
        }
      }
    },
    error: (msg, meta) => {
      if (shouldLog("error")) {
        ensureEvlog();
        if (meta && Object.keys(meta).length > 0) {
          log.error({ tag, message: msg, ...meta });
        } else {
          log.error(tag, msg);
        }
      }
    },
  };
}
