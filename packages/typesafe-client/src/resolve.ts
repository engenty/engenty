// The one place that turns an environment into a Jev client. Every caller —
// the browser fast loop, the effort router, inbox categories, the KB search
// verifier — resolves the same door the same way, and tests hand in a client
// instead of an environment.

import {
  AI_GATEWAY_API_KEY_ENV,
  type ResolvedTypeSafeClientOptions,
  resolveTypeSafeClientOptions,
  TYPESAFE_API_KEY_ENV,
  TYPESAFE_MODEL_ENV,
  TypeSafeClient,
  type TypeSafeClientOptions,
} from "./client.js";

export type EnvReader = (key: string) => string | undefined;

// No Node types in this package (it must stay importable from a browser
// build), so the default reader looks for a process on the global.
const defaultReadEnv: EnvReader = (key) =>
  (globalThis as { process?: { env?: Record<string, string | undefined> } })
    .process?.env?.[key];

/** The env slice the client resolver reads. */
export function readJevEnv(
  readEnv: EnvReader = defaultReadEnv
): Record<string, string | undefined> {
  return {
    [AI_GATEWAY_API_KEY_ENV]: readEnv(AI_GATEWAY_API_KEY_ENV),
    [TYPESAFE_API_KEY_ENV]: readEnv(TYPESAFE_API_KEY_ENV),
    [TYPESAFE_MODEL_ENV]: readEnv(TYPESAFE_MODEL_ENV),
  };
}

export interface ResolvedJev {
  client: TypeSafeClient;
  /** The model the client will name on every call. */
  model: string;
  route: ResolvedTypeSafeClientOptions["route"];
}

/** A client on whichever door the environment opens, or null when neither key is set. */
export function resolveJevClient(
  readEnv: EnvReader = defaultReadEnv,
  options: Pick<
    TypeSafeClientOptions,
    "fetchImpl" | "retries" | "timeoutMs"
  > = {}
): ResolvedJev | null {
  const route = resolveTypeSafeClientOptions(readJevEnv(readEnv));
  if (!route) {
    return null;
  }
  return {
    client: new TypeSafeClient({
      apiKey: route.apiKey,
      baseUrl: route.baseUrl,
      model: route.model,
      ...options,
    }),
    model: route.model,
    route: route.route,
  };
}

/** Whether a Jev door is open, without building a client for it. */
export function isJevConfigured(readEnv: EnvReader = defaultReadEnv): boolean {
  return resolveTypeSafeClientOptions(readJevEnv(readEnv)) !== null;
}

/**
 * Open the connection before the first real question. A fresh process pays
 * ~1.4 s for its first call (module load + TLS), longer than any classifier
 * budget; the probe spends no tokens and the pool then keeps the connection.
 * Fire-and-forget: a failure here is the same as no warm-up.
 */
export function warmJev(
  readEnv: EnvReader = defaultReadEnv,
  options: Pick<TypeSafeClientOptions, "fetchImpl"> = {}
): boolean {
  const jev = resolveJevClient(readEnv, options);
  if (!jev) {
    return false;
  }
  jev.client.listModels().catch(() => {
    // The next real call reports its own error.
  });
  return true;
}
