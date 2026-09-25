import { anthropicGateway } from "./anthropic-gateway.js";
import { mistralGateway } from "./mistral-gateway.js";
import { registerModelGateway } from "./model-gateway.js";
import { openAiGateway } from "./openai-gateway.js";
import { openRouterGateway } from "./openrouter-gateway.js";
import { opperGateway } from "./opper-gateway.js";
import { spaceXAiGateway } from "./spacexai-gateway.js";
import { vercelGateway } from "./vercel-gateway.js";

// Built-in adapters register on import, so anything that reaches the registry
// through this module sees them. A new gateway is one more line here.
//
// Registration ORDER is load-bearing for pricing: `ai.model_pricing` is keyed by
// model id alone, so when two gateways serve the same id the first one visited
// writes the price row. Vercel stays first so an install that adds OpenRouter
// does not silently reprice everything it was already billing.
// The direct vendors carry no prices at all, so their order after the two
// priced catalogs is what lets a Vercel price row cover `openai/gpt-4o` on
// the direct row too.
registerModelGateway(vercelGateway);
registerModelGateway(openRouterGateway);
registerModelGateway(opperGateway);
registerModelGateway(openAiGateway);
registerModelGateway(anthropicGateway);
registerModelGateway(mistralGateway);
registerModelGateway(spaceXAiGateway);

export {
  ANTHROPIC_GATEWAY_ID,
  ANTHROPIC_MODELS_URL,
  anthropicGateway,
  anthropicTags,
  normalizeAnthropicModel,
} from "./anthropic-gateway.js";
export {
  isMistralChatModel,
  MISTRAL_GATEWAY_ID,
  MISTRAL_MODELS_URL,
  mistralGateway,
  mistralTags,
  normalizeMistralModel,
} from "./mistral-gateway.js";
export {
  getModelGateway,
  listModelGateways,
  type ModelGateway,
  type ModelGatewayListOptions,
  type ModelGatewayRecord,
  registerModelGateway,
} from "./model-gateway.js";
export {
  isOpenAiChatModel,
  normalizeOpenAiModel,
  OPENAI_GATEWAY_ID,
  OPENAI_MODELS_URL,
  openAiGateway,
  openAiTags,
} from "./openai-gateway.js";
export {
  normalizeOpenRouterModel,
  OPENROUTER_GATEWAY_ID,
  OPENROUTER_MODELS_URL,
  openRouterGateway,
  openRouterTags,
} from "./openrouter-gateway.js";
export {
  isOpperCatalogModel,
  normalizeOpperModel,
  OPPER_GATEWAY_ID,
  OPPER_MODELS_URL,
  opperGateway,
  opperTags,
} from "./opper-gateway.js";
export {
  isSpaceXAiChatModel,
  normalizeSpaceXAiModel,
  SPACEXAI_GATEWAY_ID,
  SPACEXAI_MODELS_URL,
  spaceXAiGateway,
  spaceXAiTags,
} from "./spacexai-gateway.js";
export {
  GATEWAY_MODELS_URL,
  normalizeGatewayModel,
  VERCEL_GATEWAY_ID,
  vercelGateway,
} from "./vercel-gateway.js";
