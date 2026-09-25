/**
 * Constructing a model for a gateway, and teaching the AI SDK's implicit model
 * path to do the same.
 *
 * This lives in `ai-core` rather than in `apps/ai` because model calls are not
 * confined to `apps/ai`: `modules/inbox` classifies messages, the knowledge base
 * ingests and summarises, `csv-import` infers headers, `web-ingest` titles
 * pages. Several of those read the role-binding table themselves, so they can
 * be handed a non-default gateway ref by an operator's binding and must be able
 * to honour it in whichever process they happen to run in.
 */

import { createAnthropic } from "@ai-sdk/anthropic";
import { createOpenAI } from "@ai-sdk/openai";
import { gateway, type LanguageModel } from "ai";
import {
  gatewayApiKeyEnvName,
  readGatewayApiKeyFromEnv,
} from "./ai-gateway-api-key.js";
import { withLlmTrace } from "./llm-trace.js";
import {
  ANTHROPIC_GATEWAY_ID,
  DEFAULT_MODEL_GATEWAY_ID,
  MISTRAL_GATEWAY_ID,
  OPENAI_GATEWAY_ID,
  OPENROUTER_GATEWAY_ID,
  OPPER_GATEWAY_ID,
  parseModelRef,
  SPACEXAI_GATEWAY_ID,
  vendorModelId,
} from "./model-ref.js";

const OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1";

/** Opper's OpenAI-compatible surface; chat completions live under it. */
export const OPPER_COMPAT_BASE_URL = "https://api.opper.ai/v3/compat";
export const MISTRAL_BASE_URL = "https://api.mistral.ai/v1";
export const SPACEXAI_BASE_URL = "https://api.x.ai/v1";

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

interface ChatModelFactory {
  chat(modelId: string): LanguageModel;
}

/**
 * One client per gateway, cached per key so a rotation through the Setup UI is
 * picked up without a restart — the next call after a reload sees the new key
 * and rebuilds the client.
 */
const clients = new Map<string, { factory: ChatModelFactory; key: string }>();

function buildClient(gatewayId: string, apiKey: string): ChatModelFactory {
  switch (gatewayId) {
    case OPENROUTER_GATEWAY_ID:
      // OpenRouter speaks the OpenAI wire protocol, so it needs no dedicated
      // SDK package — `createOpenAI` with a base URL is the whole integration.
      return createOpenAI({
        apiKey,
        baseURL: OPENROUTER_BASE_URL,
        headers: OPENROUTER_HEADERS,
      });
    case OPPER_GATEWAY_ID:
      return createOpenAI({ apiKey, baseURL: OPPER_COMPAT_BASE_URL });
    case OPENAI_GATEWAY_ID:
      return createOpenAI({ apiKey });
    // Both speak the OpenAI chat protocol, like OpenRouter and Opper.
    case MISTRAL_GATEWAY_ID:
      return createOpenAI({ apiKey, baseURL: MISTRAL_BASE_URL });
    case SPACEXAI_GATEWAY_ID:
      return createOpenAI({ apiKey, baseURL: SPACEXAI_BASE_URL });
    case ANTHROPIC_GATEWAY_ID: {
      const anthropic = createAnthropic({ apiKey });
      return { chat: (modelId) => anthropic(modelId) as LanguageModel };
    }
    default:
      throw new UnconfiguredModelGatewayError(
        gatewayId,
        "a gateway credential"
      );
  }
}

function clientFor(gatewayId: string): ChatModelFactory {
  const apiKey = readGatewayApiKeyFromEnv(gatewayId);
  if (!apiKey) {
    throw new UnconfiguredModelGatewayError(
      gatewayId,
      gatewayApiKeyEnvName(gatewayId) ?? "a gateway credential"
    );
  }
  const cached = clients.get(gatewayId);
  if (cached && cached.key === apiKey) {
    return cached.factory;
  }
  const factory = buildClient(gatewayId, apiKey);
  clients.set(gatewayId, { factory, key: apiKey });
  return factory;
}

/**
 * A chat model on a non-default gateway, or a throw naming the missing
 * credential. The Vercel gateway is not built here: the SDK's own `gateway()`
 * reads `AI_GATEWAY_API_KEY` implicitly and `apps/ai` wraps it with middleware
 * of its own.
 *
 * The return type is annotated rather than inferred: the inferred one names
 * `LanguageModelV4` from a transitive `@ai-sdk/provider`, which `tsc` cannot
 * write into this package's declarations.
 */
export function gatewayLanguageModel(
  gatewayId: string,
  modelId: string
): LanguageModel {
  const id = gatewayId.trim().toLowerCase();
  return withLlmTrace(clientFor(id).chat(vendorModelId(id, modelId)));
}

/** An OpenRouter chat model, or a throw naming the missing credential. */
export function openRouterLanguageModel(modelId: string): LanguageModel {
  return gatewayLanguageModel(OPENROUTER_GATEWAY_ID, modelId);
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
 * (`openrouter:openai/gpt-4o-mini`, `anthropic:anthropic/claude-sonnet-4-5`) is
 * routed elsewhere.
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
    // Embeddings and images stay on Vercel: the other gateways are bound for
    // chat only. An install that moves its chat roles across keeps working
    // search rather than losing it to a gateway that was never going to answer.
    embeddingModel: (modelId: string) =>
      vercel.embeddingModel(parseModelRef(modelId).modelId),
    imageModel: (modelId: string) =>
      vercel.imageModel(parseModelRef(modelId).modelId),
    languageModel: (modelId: string) => {
      const ref = parseModelRef(modelId);
      if (ref.gateway !== DEFAULT_MODEL_GATEWAY_ID) {
        return gatewayLanguageModel(ref.gateway, ref.modelId);
      }
      return withLlmTrace(vercel.languageModel(ref.modelId) as LanguageModel);
    },
    specificationVersion: vercel.specificationVersion,
  } satisfies AnyProvider;
}

/** Test seam: forget the install so a suite can assert the wiring twice. */
export function resetGatewayAwareDefaultProviderForTests(): void {
  installed = false;
  clients.clear();
  (
    globalThis as { AI_SDK_DEFAULT_PROVIDER?: unknown }
  ).AI_SDK_DEFAULT_PROVIDER = undefined;
}
