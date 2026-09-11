/**
 * The one place a model ref becomes a callable model for a Mastra agent.
 *
 * Three sites used to answer this independently, each with a private copy of
 * `modelId.includes("/") && !modelId.startsWith("vercel/")` — a predicate that
 * asks "does this look like a gateway id?" when the real question is "which
 * gateway serves it?". Those agreed only because there was one gateway.
 *
 * Gateway *construction* lives in `@engenty/ai-core`, because model calls happen
 * in hosts that never load `apps/ai`. What is specific to this file is the
 * Vercel file-data middleware, which is an `apps/ai` concern.
 */

import {
  DEFAULT_MODEL_GATEWAY_ID,
  OPENROUTER_GATEWAY_ID,
  openRouterLanguageModel,
  parseModelRef,
  UnconfiguredModelGatewayError,
  withLlmTrace,
} from "@engenty/ai-core";
import { gateway, type LanguageModel, wrapLanguageModel } from "ai";
import { gatewayFileDataMiddleware } from "../ai/registry/gateway-file-data-middleware.js";

/**
 * A model ref → a language model, or the id verbatim when it names no gateway
 * we serve.
 *
 * The verbatim path is not a fallback for a *misconfigured* gateway — it is for
 * a bare id with no `provider/model` shape at all, which Mastra resolves through
 * its own provider registry. An id that names a known gateway with no key is an
 * error, because silently letting it through would reach that registry, miss,
 * and surface as an unrelated failure deep in the run.
 */
export function resolveLanguageModel(modelRef: string): LanguageModel | string {
  const { gateway: gatewayId, modelId } = parseModelRef(modelRef);

  // No `provider/model` shape: not ours to route. Mastra handles it.
  if (!modelId.includes("/")) {
    return modelId;
  }

  if (gatewayId === OPENROUTER_GATEWAY_ID) {
    // No file middleware here: it exists to work around the Vercel gateway
    // rewriting inline bytes into a `fileUri` that Vertex rejects. OpenRouter
    // takes standard OpenAI file parts, so running it would re-encode parts
    // that were already correct.
    return openRouterLanguageModel(modelId);
  }

  if (gatewayId === DEFAULT_MODEL_GATEWAY_ID) {
    return withLlmTrace(
      wrapLanguageModel({
        middleware: gatewayFileDataMiddleware,
        model: gateway(modelId),
      })
    );
  }

  // A gateway with a catalog adapter but no runtime binding yet. Better to say
  // so than to route it somewhere it was never meant to go.
  throw new UnconfiguredModelGatewayError(gatewayId, "a gateway credential");
}

/**
 * Mastra's model slot accepts a model instance or an id string, but types it as
 * its own union. Callers hand the result straight to an `Agent`, so the cast
 * lives here once rather than at each site.
 */
export function resolveMastraModel<T>(modelRef: string): T {
  return resolveLanguageModel(modelRef) as unknown as T;
}
