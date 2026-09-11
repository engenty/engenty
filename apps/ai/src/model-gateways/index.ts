import { registerModelGateway } from "./model-gateway.js";
import { openRouterGateway } from "./openrouter-gateway.js";
import { vercelGateway } from "./vercel-gateway.js";

// Built-in adapters register on import, so anything that reaches the registry
// through this module sees them. A new gateway is one more line here.
//
// Registration ORDER is load-bearing for pricing: `ai.model_pricing` is keyed by
// model id alone, so when two gateways serve the same id the first one visited
// writes the price row. Vercel stays first so an install that adds OpenRouter
// does not silently reprice everything it was already billing.
registerModelGateway(vercelGateway);
registerModelGateway(openRouterGateway);

export {
  getModelGateway,
  listModelGateways,
  type ModelGateway,
  type ModelGatewayListOptions,
  type ModelGatewayRecord,
  registerModelGateway,
} from "./model-gateway.js";
export {
  normalizeOpenRouterModel,
  OPENROUTER_GATEWAY_ID,
  OPENROUTER_MODELS_URL,
  openRouterGateway,
  openRouterTags,
} from "./openrouter-gateway.js";
export {
  GATEWAY_MODELS_URL,
  normalizeGatewayModel,
  VERCEL_GATEWAY_ID,
  vercelGateway,
} from "./vercel-gateway.js";
