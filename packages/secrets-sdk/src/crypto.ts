import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

/**
 * Phase-1 static-key AES-256-GCM, mirroring @engenty/connections-sdk
 * token-crypto but with (a) a SEPARATE key (blast-radius isolation) and
 * (b) AAD binding the ciphertext to the secret's identity so a payload cannot
 * be swapped between rows. Phase 2 replaces getKey() with a per-tenant DEK
 * unwrapped from KMS — keep this behind the Wrapper interface below.
 */
const KEY_ENV = "SECRETS_ENC_KEY";

function getStaticKey(): Buffer {
  const raw = process.env[KEY_ENV];
  if (!raw) {
    throw new Error(`${KEY_ENV} is not set — cannot encrypt/decrypt secrets`);
  }
  const key = Buffer.from(raw, "base64");
  if (key.byteLength !== 32) {
    throw new Error(`${KEY_ENV} must be 32 bytes (base64-encoded)`);
  }
  return key;
}

/** AAD binds the blob to its row identity. Must match on encrypt + decrypt. */
export function secretAad(input: {
  secretId: string;
  ownerScope: string;
  ownerId: string;
}): Buffer {
  return Buffer.from(
    `${input.secretId}|${input.ownerScope}|${input.ownerId}`,
    "utf8"
  );
}

/** Pluggable key backend. Phase 1: static. Phase 2: per-tenant DEK from KMS. */
export interface KeyWrapper {
  keyForEncrypt(tenantId: string): Promise<{ key: Buffer; dekId: string | null }>;
  keyForDecrypt(
    tenantId: string,
    dekId: string | null
  ): Promise<Buffer>;
}

export const staticKeyWrapper: KeyWrapper = {
  async keyForEncrypt() {
    return { key: getStaticKey(), dekId: null };
  },
  async keyForDecrypt() {
    return getStaticKey();
  },
};

/** Returns `base64(iv).base64(ct).base64(tag)`. */
export function encryptPayload(plain: string, key: Buffer, aad: Buffer): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  cipher.setAAD(aad);
  const ct = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [iv, ct, tag].map((b) => b.toString("base64")).join(".");
}

export function decryptPayload(value: string, key: Buffer, aad: Buffer): string {
  const parts = value.split(".");
  if (parts.length !== 3) {
    throw new Error("Invalid encrypted payload format");
  }
  const [ivB64, ctB64, tagB64] = parts;
  const decipher = createDecipheriv(
    "aes-256-gcm",
    key,
    Buffer.from(ivB64, "base64")
  );
  decipher.setAAD(aad);
  decipher.setAuthTag(Buffer.from(tagB64, "base64"));
  return Buffer.concat([
    decipher.update(Buffer.from(ctB64, "base64")),
    decipher.final(),
  ]).toString("utf8");
}
