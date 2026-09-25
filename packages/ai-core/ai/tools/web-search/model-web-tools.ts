/**
 * The web tools a run's own model brings, when it brings any.
 *
 * A model with built-in search and fetch does both better than a tool we
 * wrap around a second call: the results land in its own context, with the
 * provider's citations, in one step. So a run whose model has them gets them
 * under the same names as our fallbacks (`web_search`, `web_fetch`), and the
 * fallbacks stay for every other model.
 *
 * - Anthropic models (direct, or through the Vercel AI Gateway): search and
 *   fetch.
 * - OpenAI models through the Vercel AI Gateway: search. (The direct
 *   `openai:` gateway speaks chat completions, where the search tool does not
 *   exist.)
 * - Any other model through the Vercel AI Gateway: the gateway's own search,
 *   which it runs for whichever model asks.
 *
 * Everything else — OpenRouter, Opper, Mistral, xAI — keeps the fallbacks.
 */
import { anthropic } from "@ai-sdk/anthropic";
import { openai } from "@ai-sdk/openai";
import { gateway, type Tool } from "ai";

import { parseModelRef } from "../../../src/config/model-ref.js";

export type ModelWebToolSource = "anthropic" | "openai" | "gateway";

export interface ModelWebTools {
  source: ModelWebToolSource | null;
  webFetch?: Tool;
  webSearch?: Tool;
}

const MAX_USES_PER_STEP = 5;

function vendorOf(modelRef: string): { gateway: string; vendor: string } {
  const ref = parseModelRef(modelRef);
  const slash = ref.modelId.indexOf("/");
  return {
    gateway: ref.gateway,
    vendor:
      ref.gateway === "vercel"
        ? slash > 0
          ? ref.modelId.slice(0, slash).toLowerCase()
          : ""
        : ref.gateway,
  };
}

export function resolveModelWebTools(modelRef: string): ModelWebTools {
  const { gateway: via, vendor } = vendorOf(modelRef);
  if (vendor === "anthropic" && (via === "vercel" || via === "anthropic")) {
    return {
      source: "anthropic",
      webFetch: anthropic.tools.webFetch_20250910({
        maxUses: MAX_USES_PER_STEP,
      }) as Tool,
      webSearch: anthropic.tools.webSearch_20250305({
        maxUses: MAX_USES_PER_STEP,
      }) as Tool,
    };
  }
  if (via !== "vercel" || !vendor) {
    return { source: null };
  }
  if (vendor === "openai") {
    return { source: "openai", webSearch: openai.tools.webSearch({}) as Tool };
  }
  return {
    source: "gateway",
    webSearch: gateway.tools.perplexitySearch({ maxResults: 8 }) as Tool,
  };
}
