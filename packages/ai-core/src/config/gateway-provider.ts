/**
 * Constructing a model for a gateway, and teaching the AI SDK's implicit model
 * path to do the same.
 *
 * This lives in `ai-core` rather than in `apps/ai` because model calls are not
 * confined to `apps/ai`: `modules/inbox` classifies messages, the knowledge base
 * ingests and summarises, `csv-import` infers headers, `web-ingest` titles
 * pages. Several of those read the role-binding table themselves, so they can
 * be handed an OpenRouter ref by an operator's binding and must be able to
 * honour it in whichever process they happen to run in.
 */

import { createOpenAI } from "@ai-sdk/openai";
import { gateway, type LanguageModel } from "ai";
import { readGatewayApiKeyFromEnv } from "./ai-gateway-api-key.js";
import { withLlmTrace } from "./llm-trace.js";
import { OPENROUTER_GATEWAY_ID, parseModelRef } from "./model-ref.js";

const OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1";

/**
 * OpenRouter ranks and attributes traffic by these. They are optional, cost
 * nothing, and are the difference between appearing on its app leaderboard as
 * "Engenty" and appearing as an anonymous key.
 */
const OPENROUTER_HEADERS: Record<string, string> = {
  "HTTP-Referer": "https://engenty.com",
  "X-Title": "Engenty",
};

export class UnconfiguredModelGatewayError extends Error {
  readonly gateway: string;

  constructor(gatewayId: string, envKey: string) {
    super(
      `Model gateway "${gatewayId}" is not configured: set ${envKey} in platform settings.`
    );
    this.name = "UnconfiguredModelGatewayError";
    this.gateway = gatewayId;
  }
}

let openRouterProvider: ReturnType<typeof createOpenAI> | null = null;
let openRouterProviderKey: string | null = null;

/**
 * OpenRouter speaks the OpenAI wire protocol, so it needs no dedicated SDK
 * package — `createOpenAI` with a base URL is the whole integration, against the
 * same `@ai-sdk/provider` version `ai@7` expects. Cached per key so a rotation
 * through the Setup UI is picked up without a restart.
 */
function openRouterClient(apiKey: string): ReturnType<typeof createOpenAI> {
  if (!openRouterProvider || openRouterProviderKey !== apiKey) {
    openRouterProvider = createOpenAI({
      apiKey,
      baseURL: OPENROUTER_BASE_URL,
      headers: OPENROUTER_HEADERS,
    });
    openRouterProviderKey = apiKey;
  }
  return openRouterProvider;
}

/**
 * An OpenRouter chat model, or a throw naming the missing credential.
 *
 * The return type is annotated rather than inferred: the inferred one names
 * `LanguageModelV4` from a transitive `@ai-sdk/provider`, which `tsc` cannot
 * write into this package's declarations.
 */
export function openRouterLanguageModel(modelId: string): LanguageModel {
  const apiKey = readGatewayApiKeyFromEnv(OPENROUTER_GATEWAY_ID);
  if (!apiKey) {
    throw new UnconfiguredModelGatewayError(
      OPENROUTER_GATEWAY_ID,
      "OPENROUTER_API_KEY"
    );
  }
  return withLlmTrace(openRouterClient(apiKey).chat(modelId));
}

interface AnyProvider {
  embeddingModel(modelId: string): unknown;
  imageModel(modelId: string): unknown;
  languageModel(modelId: string): unknown;
  specificationVersion: string;
}

let installed = false;

/**
 * Teach `globalThis.AI_SDK_DEFAULT_PROVIDER` about gateways.
 *
 * Around thirty call sites pass a bare string to `generateText` / `streamText` /
 * `embed`. The SDK resolves those through the default provider, which is the
 * Vercel gateway unless something says otherwise. Rewriting all thirty to thread
 * a gateway through would be a large change to code that has no opinion about
 * gateways and should not gain one — what they want is "resolve whatever id I
 * was configured with".
 *
 * So the default provider becomes gateway-aware instead, in one place: a bare id
 * still goes to Vercel exactly as before, and only a ref with a gateway head
 * (`openrouter:openai/gpt-4o-mini`) is routed elsewhere.
 *
 * Idempotent — hosts boot along different paths, and installing twice would
 * wrap the wrapper.
 */
export function installGatewayAwareDefaultProvider(): void {
  if (installed) {
    return;
  }
  installed = true;

  const vercel = gateway as unknown as AnyProvider;

  (
    globalThis as { AI_SDK_DEFAULT_PROVIDER?: unknown }
  ).AI_SDK_DEFAULT_PROVIDER = {
    // Embeddings and images stay on Vercel: OpenRouter serves chat completions
    // only. An install that moves its chat roles across keeps working search
    // rather than losing it to a gateway that was never going to answer.
    embeddingModel: (modelId: string) =>
      vercel.embeddingModel(parseModelRef(modelId).modelId),
    imageModel: (modelId: string) =>
      vercel.imageModel(parseModelRef(modelId).modelId),
    languageModel: (modelId: string) => {
      const ref = parseModelRef(modelId);
      if (ref.gateway === OPENROUTER_GATEWAY_ID) {
        return openRouterLanguageModel(ref.modelId);
      }
      return withLlmTrace(vercel.languageModel(ref.modelId) as LanguageModel);
    },
    specificationVersion: vercel.specificationVersion,
  } satisfies AnyProvider;
}

/** Test seam: forget the install so a suite can assert the wiring twice. */
export function resetGatewayAwareDefaultProviderForTests(): void {
  installed = false;
  openRouterProvider = null;
  openRouterProviderKey = null;
  (
    globalThis as { AI_SDK_DEFAULT_PROVIDER?: unknown }
  ).AI_SDK_DEFAULT_PROVIDER = undefined;
}
