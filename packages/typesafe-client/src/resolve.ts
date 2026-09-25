// The one place that turns a bound Jev model plus an environment into a
// client. The classifier binding names the model; the environment only says
// which door (TypeSafe's own key, or the Vercel AI Gateway key) is open.

import {
  AI_GATEWAY_API_KEY_ENV,
  type ResolvedTypeSafeClientOptions,
  resolveTypeSafeClientOptions,
  TYPESAFE_API_KEY_ENV,
  TypeSafeClient,
  type TypeSafeClientOptions,
} from "./client.js";

export type EnvReader = (key: string) => string | undefined;

// No Node types in this package (it must stay importable from a browser
// build), so the default reader looks for a process on the global.
const defaultReadEnv: EnvReader = (key) =>
  (globalThis as { process?: { env?: Record<string, string | undefined> } })
    .process?.env?.[key];

/** The env slice the client resolver reads: the two keys, never a model. */
export function readJevEnv(
  readEnv: EnvReader = defaultReadEnv
): Record<string, string | undefined> {
  return {
    [AI_GATEWAY_API_KEY_ENV]: readEnv(AI_GATEWAY_API_KEY_ENV),
    [TYPESAFE_API_KEY_ENV]: readEnv(TYPESAFE_API_KEY_ENV),
  };
}

export interface ResolvedJev {
  client: TypeSafeClient;
  /** The model the client will name on every call, spelled for its route. */
  model: string;
  route: ResolvedTypeSafeClientOptions["route"];
}

export type JevClientOptions = Pick<
  TypeSafeClientOptions,
  "fetchImpl" | "retries" | "timeoutMs"
>;

/**
 * A client for the bound Jev model on whichever door the environment opens,
 * or null when neither key is set.
 */
export function resolveJevClient(
  modelId: string,
  readEnv: EnvReader = defaultReadEnv,
  options: JevClientOptions = {}
): ResolvedJev | null {
  const route = resolveTypeSafeClientOptions(readJevEnv(readEnv), modelId);
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

/**
 * Open the connection before the first real question. A fresh process pays
 * ~1.4 s for its first call (module load + TLS), longer than any classifier
 * budget; the probe spends no tokens and the pool then keeps the connection.
 * Fire-and-forget: a failure here is the same as no warm-up.
 */
export function warmJev(
  modelId: string,
  readEnv: EnvReader = defaultReadEnv,
  options: Pick<TypeSafeClientOptions, "fetchImpl"> = {}
): boolean {
  const jev = resolveJevClient(modelId, readEnv, options);
  if (!jev) {
    return false;
  }
  jev.client.listModels().catch(() => {
    // The next real call reports its own error.
  });
  return true;
}
