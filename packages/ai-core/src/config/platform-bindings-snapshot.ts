/**
 * The live platform role bindings, held per process.
 *
 * `ai.model_binding` is the only place a model is chosen. Each server process
 * (apps/ai, apps/core) keeps a copy here, refreshed from the table, so every
 * resolver can answer synchronously without a DB handle. There is no fallback
 * model: a role with no binding is a missing configuration and fails loudly.
 *
 * Browser-safe: no telemetry, no DB client.
 */
import type { ModelBindings } from "./model-roles.js";

let snapshot: ModelBindings | undefined;

/** Thrown when a role is asked for before it is bound. */
export class ModelRoleNotBoundError extends Error {
  readonly role: string;

  constructor(role: string, reason: "unbound" | "not_loaded") {
    super(
      reason === "not_loaded"
        ? `Model role "${role}" requested before the platform bindings were loaded`
        : `Model role "${role}" is not bound — set it in manage → Role bindings`
    );
    this.name = "ModelRoleNotBoundError";
    this.role = role;
  }
}

export function setPlatformBindings(bindings: ModelBindings | undefined): void {
  snapshot = bindings && bindings.size > 0 ? bindings : undefined;
}

export function platformBindings(): ModelBindings | undefined {
  return snapshot;
}

/** The binding for `role`, or throw {@link ModelRoleNotBoundError}. */
export function requirePlatformBinding(
  role: string,
  bindings: ModelBindings | undefined = snapshot
) {
  if (!bindings) {
    throw new ModelRoleNotBoundError(role, "not_loaded");
  }
  const bound = bindings.get(role);
  if (!bound?.modelId.trim()) {
    throw new ModelRoleNotBoundError(role, "unbound");
  }
  return bound;
}

const EMPTY_RETRY_MS = 5000;

/**
 * Load the bindings now and keep them fresh. Retries fast while the table is
 * still empty (apps/ai seeds it on its first boot). Returns a stop function.
 */
export async function startPlatformBindingsSync(
  load: () => Promise<ModelBindings | undefined>,
  intervalMs = 60_000
): Promise<() => void> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let stopped = false;
  const tick = async () => {
    try {
      setPlatformBindings(await load());
    } catch {
      // Keep the last good snapshot; a failed read must not unbind roles.
    }
    if (!stopped) {
      timer = setTimeout(tick, snapshot ? intervalMs : EMPTY_RETRY_MS);
      (timer as { unref?: () => void }).unref?.();
    }
  };
  await tick();
  return () => {
    stopped = true;
    if (timer) {
      clearTimeout(timer);
    }
  };
}
