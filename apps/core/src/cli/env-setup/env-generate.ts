import { randomBytes } from "node:crypto";
import type { SecretGeneratorId } from "./env-manifest-types.js";

export function generateSecretValue(generator: SecretGeneratorId): string {
  switch (generator) {
    case "base64-32":
      // Exactly 32 decoded bytes — AES-256-GCM key (see modules/inbox token-crypto).
      return randomBytes(32).toString("base64");
    case "base64url-48":
      // 64 chars, env-safe charset — JWT signing secret.
      return randomBytes(48).toString("base64url");
    default: {
      const exhaustive: never = generator;
      throw new Error(`Unknown generator: ${exhaustive as string}`);
    }
  }
}
