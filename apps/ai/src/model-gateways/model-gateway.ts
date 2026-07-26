import type { GatewayModelUpsertInput } from "../gateway-models.js";

/**
 * What a gateway reports about one model.
 *
 * `gateway` and `price_tier` are absent on purpose: the sync stamps the first
 * (so an adapter cannot write rows into another gateway's namespace) and
 * derives the second (price tiers are our classification of the gateway's
 * prices, not something the gateway states).
 */
export type ModelGatewayRecord = Omit<
  GatewayModelUpsertInput,
  "gateway" | "price_tier"
>;

export interface ModelGatewayListOptions {
  fetchImpl?: typeof fetch;
  now: Date;
}

/**
 * A source of catalog rows.
 *
 * Adding OpenRouter or a direct vendor API is a matter of writing one of these
 * and registering it — model resolution, the store and the manage UI never
 * learn a second shape, because the gateway is a column on the row rather than
 * a prefix on the model id.
 */
export interface ModelGateway {
  /** Written to `ai.model.gateway`. Stored data, so it must stay stable. */
  readonly id: string;
  listModels(opts: ModelGatewayListOptions): Promise<ModelGatewayRecord[]>;
  /** Catalog endpoint, recorded on every row for provenance. */
  readonly sourceUrl: string;
}

const gateways = new Map<string, ModelGateway>();

export function registerModelGateway(gateway: ModelGateway): void {
  gateways.set(gateway.id, gateway);
}

export function getModelGateway(id: string): ModelGateway | null {
  return gateways.get(id) ?? null;
}

/** Registration order, which is the order a sync visits them in. */
export function listModelGateways(): ModelGateway[] {
  return [...gateways.values()];
}
