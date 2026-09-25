/**
 * The one entry from a `classifier` binding to something that answers
 * System One questions.
 *
 * The classifier is Jev only (`typesafe-ai/jev`, `jev-*`, a `typesafe:` ref):
 * asked through TypeSafe's API — TypeSafe's own key when set, else the Vercel
 * AI Gateway's TypeSafe route on the gateway key. A non-Jev ref has no client;
 * callers fail open (heuristics, unverified results, guardrails skipped).
 * Callers never build a client from the environment alone.
 */

import {
  type ClassifierClient,
  type EnvReader,
  isJevModel,
  type JevClientOptions,
  resolveJevClient,
  type TypeSafeRoute,
  warmJev,
} from "@engenty/typesafe-client";
import { parseModelRef } from "../config/model-ref.js";

export interface ResolvedClassifier {
  client: ClassifierClient;
  /** The model named on the wire, in the route's Jev spelling. */
  model: string;
  route: TypeSafeRoute;
}

export interface ClassifierClientOptions extends JevClientOptions {
  /** Reads the key env vars (defaults to `process.env`). */
  readEnv?: EnvReader;
}

const TYPESAFE_REF_HEAD = "typesafe:";

/**
 * Whether the bound ref is a Jev model. The gateway head does not matter: Jev
 * is reached through TypeSafe's key or the Vercel route, whichever is set.
 */
export function isJevClassifierRef(modelRef: string): boolean {
  const raw = modelRef.trim();
  if (raw.toLowerCase().startsWith(TYPESAFE_REF_HEAD)) {
    return true;
  }
  return isJevModel(parseModelRef(raw).modelId);
}

/** The Jev id a ref carries: `typesafe:` refs whole, others without a gateway head. */
function jevModelIdOf(modelRef: string): string {
  const raw = modelRef.trim();
  return raw.toLowerCase().startsWith(TYPESAFE_REF_HEAD)
    ? raw
    : parseModelRef(raw).modelId;
}

/**
 * A client for the bound classifier, or null when the ref is not Jev or no
 * TypeSafe/gateway key is set.
 */
export function createClassifierClient(
  modelRef: string | null | undefined,
  options: ClassifierClientOptions = {}
): ResolvedClassifier | null {
  const ref = modelRef?.trim();
  if (!(ref && isJevClassifierRef(ref))) {
    return null;
  }
  const { readEnv, ...clientOptions } = options;
  const jev = resolveJevClient(jevModelIdOf(ref), readEnv, clientOptions);
  return jev
    ? { client: jev.client, model: jev.model, route: jev.route }
    : null;
}

/**
 * Open Jev's connection before the first real question (a cold process pays
 * ~1.4 s). True when the bound classifier is reachable at all.
 */
export function warmClassifier(modelRef: string, readEnv?: EnvReader): boolean {
  return isJevClassifierRef(modelRef)
    ? warmJev(jevModelIdOf(modelRef), readEnv)
    : false;
}
