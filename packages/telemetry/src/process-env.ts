/**
 * Isomorphic-safe reads of `process.env` with trimming and small conventions
 * used across Engenty server code. In non-Node contexts, helpers return
 * `undefined` / defaults without throwing.
 */

/** Standard log levels recognized by {@link getLogLevel}. */
export type LogLevel = "debug" | "info" | "warn" | "error";

/**
 * Trimmed non-empty string from `process.env[key]`, or the given fallback (default `undefined`).
 * Usage:
 *  - env("KEY")             // returns trimmed value or undefined
 *  - env("KEY", "")         // returns trimmed value or "" (never undefined)
 *  - env("KEY", "default")  // returns trimmed value or "default"
 */
export function env(key: string): string | undefined;
export function env(key: string, fallback: string): string;
export function env(
  key: string,
  fallback?: string | undefined
): string | undefined {
  if (typeof process === "undefined") {
    return fallback;
  }
  const v = process.env[key];
  if (typeof v !== "string") {
    return fallback;
  }
  const t = v.trim();
  return t.length > 0 ? t : fallback;
}

/**
 * "Is truthy" flag: returns true if the trimmed value is "true", "1", or "yes" (case-insensitive).
 */
export function envIsTruthy(key: string): boolean {
  const v = env(key)?.toLowerCase();
  return (
    v === "true" ||
    v === "1" ||
    v === "yes" ||
    v === "ok" ||
    v === key.toLowerCase().trim()
  );
}

/** Whether the variable is set to a non-empty value after trim. */
export function envIsDefined(key: string): boolean {
  return env(key) !== undefined;
}

/**
 * `LOG_LEVEL` from the environment, lowercased raw token (may be unknown e.g. `verbose`).
 * Prefer {@link getLogLevel} for logger behavior.
 */
export function getProcessLogLevel(): string | undefined {
  return env("LOG_LEVEL")?.toLowerCase();
}

/**
 * Parses `LOG_LEVEL` into a known level; invalid or missing → `"info"`.
 * Aligns with {@link createLogger} filtering.
 */
export function getLogLevel(): LogLevel {
  const raw = getProcessLogLevel();
  if (raw === "debug" || raw === "info" || raw === "warn" || raw === "error") {
    return raw;
  }
  return "info";
}

/** True when parsed `LOG_LEVEL` is `debug`. */
export function isDebug(): boolean {
  return getLogLevel() === "debug";
}

/** Trimmed `NODE_ENV`, or `undefined`. */
export function nodeEnv(): string | undefined {
  return env("NODE_ENV");
}

/** True when `NODE_ENV` (trimmed) is `production`. */
export function isProduction(): boolean {
  return env("NODE_ENV") === "production";
}
