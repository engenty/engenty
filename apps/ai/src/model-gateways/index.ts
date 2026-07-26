import { registerModelGateway } from "./model-gateway.js";
import { vercelGateway } from "./vercel-gateway.js";

// Built-in adapters register on import, so anything that reaches the registry
// through this module sees them. A new gateway is one more line here.
registerModelGateway(vercelGateway);

export {
  getModelGateway,
  listModelGateways,
  type ModelGateway,
  type ModelGatewayListOptions,
  type ModelGatewayRecord,
  registerModelGateway,
} from "./model-gateway.js";
export {
  GATEWAY_MODELS_URL,
  normalizeGatewayModel,
  VERCEL_GATEWAY_ID,
  vercelGateway,
} from "./vercel-gateway.js";
