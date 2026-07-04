import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

const KEY_ENV = "CONNECTIONS_TOKEN_ENC_KEY";

function getKey(): Buffer {
  const raw = process.env[KEY_ENV];
  if (!raw) {
    throw new Error(
      `${KEY_ENV} is not set — cannot encrypt/decrypt connection tokens`
    );
  }
  const key = Buffer.from(raw, "base64");
  if (key.byteLength !== 32) {
    throw new Error(`${KEY_ENV} must be 32 bytes (base64-encoded)`);
  }
  return key;
}

/** AES-256-GCM encrypt. Returns `base64(iv).base64(ciphertext).base64(authTag)`. */
export function encryptToken(plain: string): string {
  const key = getKey();
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([
    cipher.update(plain, "utf8"),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag();
  return [
    iv.toString("base64"),
    ciphertext.toString("base64"),
    authTag.toString("base64"),
  ].join(".");
}

/** AES-256-GCM decrypt. */
export function decryptToken(value: string): string {
  const key = getKey();
  const parts = value.split(".");
  if (parts.length !== 3) {
    throw new Error("Invalid encrypted token format");
  }
  const [ivB64, ctB64, tagB64] = parts;
  const iv = Buffer.from(ivB64, "base64");
  const ciphertext = Buffer.from(ctB64, "base64");
  const authTag = Buffer.from(tagB64, "base64");
  const decipher = createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(authTag);
  return Buffer.concat([
    decipher.update(ciphertext),
    decipher.final(),
  ]).toString("utf8");
}
