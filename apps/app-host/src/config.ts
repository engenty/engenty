import { resolveSpacesDir } from "@engenty/environment/env";

/**
 * app-host configuration.
 *
 * The service is deliberately unreachable from outside the internal Docker
 * network: it publishes no port, has no gateway target, and serves no browser
 * traffic. Everything here is about the apps/ai → app-host hop.
 */

export interface AppHostConfig {
  /** Bind address. Containers must set 0.0.0.0; local dev stays on loopback. */
  hostname: string;
  /** Shared secret apps/ai presents on every internal call. */
  internalToken: string | null;
  /** Hard ceiling on a single deployment's total source bytes. */
  maxSourceBytes: number;
  /** One Rivet namespace per App, so one App's actors cannot name another's. */
  perAppNamespace: boolean;
  port: number;
  production: boolean;
  /** Upper bound on how long a guest request may take. */
  requestTimeoutMs: number;
  scaling: {
    maxReplicas: number;
    minReplicas: number;
    targetConcurrency: number;
  };
  /**
   * Root of the spaces tree: every App's source repository and data directory
   * live under it (see app-store.ts for the layout). Shared with engenty-ai,
   * which binds a space's `apps/` into that space's computer.
   */
  spacesDir: string;
}

function intFromEnv(name: string, fallback: number): number {
  const parsed = Number.parseInt(process.env[name] ?? "", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function boolFromEnv(name: string, fallback: boolean): boolean {
  const raw = process.env[name];
  if (raw === undefined || raw === "") {
    return fallback;
  }
  return raw === "1" || raw.toLowerCase() === "true";
}

export function loadAppHostConfig(): AppHostConfig {
  const production = process.env.NODE_ENV === "production";
  const internalToken = process.env.ENGENTY_APP_HOST_TOKEN?.trim() || null;

  if (production && !internalToken) {
    throw new Error(
      "ENGENTY_APP_HOST_TOKEN is required in production — app-host refuses to serve unauthenticated internal calls"
    );
  }

  return {
    spacesDir: resolveSpacesDir(),
    // Mirrors apps/ai: loopback by default, containers override via HOST.
    hostname:
      process.env.ENGENTY_APP_HOST_HOST ?? process.env.HOST ?? "127.0.0.1",
    internalToken,
    maxSourceBytes: intFromEnv("ENGENTY_APP_HOST_MAX_SOURCE_BYTES", 2_000_000),
    // Mirrors `ports.appHost` in the repo-root apps/ports.config.mjs.
    port: intFromEnv("ENGENTY_APP_HOST_PORT", 8795),
    perAppNamespace: boolFromEnv("ENGENTY_APP_HOST_PER_APP_NAMESPACE", true),
    production,
    requestTimeoutMs: intFromEnv("ENGENTY_APP_HOST_REQUEST_TIMEOUT_MS", 30_000),
    scaling: {
      // One replica per App. `/data/app.db` is opened through the guest's
      // `node:sqlite`, which checks the file out to a host copy and writes it
      // back on close — two replicas would be two checkouts of one file, last
      // writer wins. A single process owns the database, as any Node service
      // would.
      maxReplicas: intFromEnv("ENGENTY_APP_HOST_MAX_REPLICAS", 1),
      // Scale to zero: an idle app costs nothing but its stored release.
      minReplicas: 0,
      targetConcurrency: intFromEnv("ENGENTY_APP_HOST_TARGET_CONCURRENCY", 8),
    },
  };
}
