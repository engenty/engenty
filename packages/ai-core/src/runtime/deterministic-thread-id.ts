import { createHash } from "node:crypto";

/**
 * Derives a stable RFC-4122 UUID from tenant + scope + stable key so sessions can be
 * resolved with `getById` after `external_thread_key` was removed from the database.
 */
export function deterministicOrchestratorThreadId(params: {
  scope: string;
  stable_key: string;
  tenant_id: string;
}): string {
  const payload = `${params.tenant_id}\0${params.scope}\0${params.stable_key}`;
  const hash = createHash("sha256").update(payload, "utf8").digest();
  const bytes = Buffer.from(hash.subarray(0, 16));
  // RFC 4122 variant + version bits (requires bitwise ops on raw bytes).
  // biome-ignore lint/suspicious/noBitwiseOperators: UUID layout from digest bytes
  bytes[6] = (bytes[6]! & 0x0f) | 0x40;
  // biome-ignore lint/suspicious/noBitwiseOperators: UUID layout from digest bytes
  bytes[8] = (bytes[8]! & 0x3f) | 0x80;
  const hex = bytes.toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
}
