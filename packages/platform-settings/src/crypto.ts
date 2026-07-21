import {
  decryptPayload,
  encryptPayload,
  type KeyWrapper,
  staticKeyWrapper,
} from "@engenty/secrets-sdk";
import type { SettingScope } from "./types.js";

export type { KeyWrapper } from "@engenty/secrets-sdk";
export { staticKeyWrapper } from "@engenty/secrets-sdk";

/**
 * Static-key phase-1 backend keyed by SECRETS_ENC_KEY (shared with the secrets
 * vault via @engenty/secrets-sdk). Phase 2 swaps this for a per-tenant DEK from
 * KMS with no schema change — the dek_id column and KeyWrapper interface are
 * already threaded through.
 */
export const defaultSettingsKeyWrapper: KeyWrapper = staticKeyWrapper;

/** Platform-scoped rows have no tenant; use a stable sentinel for the key backend. */
const PLATFORM_TENANT_SENTINEL = "platform";

function keyTenant(scope: SettingScope, tenantId: string | null): string {
  return scope === "tenant" && tenantId ? tenantId : PLATFORM_TENANT_SENTINEL;
}

/**
 * AAD binds a setting ciphertext to its exact row identity so a blob cannot be
 * copied between rows (a platform secret pasted into a tenant row, or renamed,
 * fails to decrypt). Must be identical on encrypt and decrypt.
 */
export function settingAad(input: {
  scope: SettingScope;
  tenantId: string | null;
  name: string;
}): Buffer {
  const tenant = input.scope === "tenant" ? (input.tenantId ?? "") : "";
  return Buffer.from(`setting|${input.scope}|${tenant}|${input.name}`, "utf8");
}

export async function encryptSettingSecret(params: {
  keyWrapper: KeyWrapper;
  scope: SettingScope;
  tenantId: string | null;
  name: string;
  plain: string;
}): Promise<{ valueEnc: string; dekId: string | null }> {
  const { key, dekId } = await params.keyWrapper.keyForEncrypt(
    keyTenant(params.scope, params.tenantId)
  );
  const valueEnc = encryptPayload(params.plain, key, settingAad(params));
  return { valueEnc, dekId };
}

export async function decryptSettingSecret(params: {
  keyWrapper: KeyWrapper;
  scope: SettingScope;
  tenantId: string | null;
  name: string;
  valueEnc: string;
  dekId: string | null;
}): Promise<string> {
  const key = await params.keyWrapper.keyForDecrypt(
    keyTenant(params.scope, params.tenantId),
    params.dekId
  );
  return decryptPayload(params.valueEnc, key, settingAad(params));
}
