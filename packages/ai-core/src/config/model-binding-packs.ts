/**
 * Per-gateway seed packs for `ai.model_binding`.
 *
 * JSON under `packages/ai-core/data/model-bindings/` is the editable source
 * (same pattern as commercial region packs). This module only loads them.
 */
import anthropicPack from "../../data/model-bindings/anthropic.json" with {
  type: "json",
};
import openaiPack from "../../data/model-bindings/openai.json" with {
  type: "json",
};
import openrouterPack from "../../data/model-bindings/openrouter.json" with {
  type: "json",
};
import opperPack from "../../data/model-bindings/opper.json" with {
  type: "json",
};
import vercelPack from "../../data/model-bindings/vercel.json" with {
  type: "json",
};
import {
  ANTHROPIC_GATEWAY_ID,
  DEFAULT_MODEL_GATEWAY_ID,
  OPENAI_GATEWAY_ID,
  OPENROUTER_GATEWAY_ID,
  OPPER_GATEWAY_ID,
} from "./model-ref.js";

export interface ModelBindingPack {
  gateway: string;
  label: string;
  roles: Readonly<Record<string, string>>;
}

/**
 * Wizard order: the first configured gateway in this list owns a fresh
 * install's bindings when more than one key is present.
 */
export const BINDING_PACK_GATEWAY_PREFERENCE: readonly string[] = [
  DEFAULT_MODEL_GATEWAY_ID,
  OPENROUTER_GATEWAY_ID,
  OPPER_GATEWAY_ID,
  OPENAI_GATEWAY_ID,
  ANTHROPIC_GATEWAY_ID,
];

const PACK_ENV_KEYS: Readonly<Record<string, string>> = {
  [DEFAULT_MODEL_GATEWAY_ID]: "AI_GATEWAY_API_KEY",
  [OPENROUTER_GATEWAY_ID]: "OPENROUTER_API_KEY",
  [OPPER_GATEWAY_ID]: "OPPER_API_KEY",
  [OPENAI_GATEWAY_ID]: "OPENAI_API_KEY",
  [ANTHROPIC_GATEWAY_ID]: "ANTHROPIC_API_KEY",
};

const PACKS: readonly ModelBindingPack[] = [
  vercelPack,
  openrouterPack,
  opperPack,
  openaiPack,
  anthropicPack,
];

const PACK_BY_GATEWAY = new Map(
  PACKS.map((pack) => [pack.gateway, pack] as const)
);

export function listBindingPacks(): readonly ModelBindingPack[] {
  return PACKS;
}

export function bindingPackFor(
  gateway: string | null | undefined
): ModelBindingPack {
  const id = (gateway ?? DEFAULT_MODEL_GATEWAY_ID).trim().toLowerCase();
  return PACK_BY_GATEWAY.get(id) ?? vercelPack;
}

export function seedGatewayFromEnv(
  readEnv?: (key: string) => string | undefined
): string | null {
  const read = readEnv ?? ((key) => process.env[key]);
  for (const gateway of BINDING_PACK_GATEWAY_PREFERENCE) {
    const envKey = PACK_ENV_KEYS[gateway];
    if (envKey && read(envKey)?.trim()) {
      return gateway;
    }
  }
  return null;
}

export function gatewayIdFromApiKeyEnvName(envKey: string): string | null {
  const needle = envKey.trim();
  for (const gateway of BINDING_PACK_GATEWAY_PREFERENCE) {
    if (PACK_ENV_KEYS[gateway] === needle) {
      return gateway;
    }
  }
  return null;
}

export interface StockBinding {
  gateway: string;
  modelId: string;
  role: string;
}

function fingerprint(
  gateway: string,
  roles: Readonly<Record<string, string>>
): string {
  return Object.keys(roles)
    .sort()
    .map((role) => `${gateway}|${role}|${roles[role]}`)
    .join("\n");
}

const STOCK = new Set(
  PACKS.map((pack) => fingerprint(pack.gateway, pack.roles))
);

/**
 * Empty, or still exactly a shipped pack — nobody has rebound a role yet.
 * Used so the setup wizard can switch packs when a provider key is saved.
 */
export function isStockPlatformBindings(
  current: readonly StockBinding[],
  platformRoles: readonly string[]
): boolean {
  const platform = current.filter((row) => platformRoles.includes(row.role));
  if (platform.length === 0) {
    return true;
  }
  if (platform.length !== platformRoles.length) {
    return false;
  }
  const gateway = platform[0]?.gateway;
  if (!gateway || platform.some((row) => row.gateway !== gateway)) {
    return false;
  }
  const byRole = new Map(platform.map((row) => [row.role, row]));
  const roles: Record<string, string> = {};
  for (const role of platformRoles) {
    const row = byRole.get(role);
    if (!row) {
      return false;
    }
    roles[role] = row.modelId;
  }
  return STOCK.has(fingerprint(gateway, roles));
}
