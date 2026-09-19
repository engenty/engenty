// The AI service's credential on a LOCAL stack, minted without a human.
//
// `core.service_credential` is only ever written by a person's bearer
// (`engenty service-token create`), so a `db reset` leaves every checkout's
// ENGENTY_AI_SERVICE_SECRET pointing at a row that no longer exists: apps/ai
// logs `invalid_client` at boot and the scheduler stays off — routines never
// fire on the clock, and nobody notices until they wait for one. Locally the
// row is not a security decision (the DB is the developer's own), so
// `engenty setup` keeps it in step: same row shape, same sha256, platform-
// scoped (tenant_id NULL) so it serves every tenant the dev user creates.
// Production keeps the human, tenant-clamped mint.
import { AI_SERVICE_PLAN_CAPABILITIES } from "@engenty/plugin-sdk";
import { uuidv7 } from "uuidv7";
import {
  nowEpochSeconds,
  randomToken,
  toHash,
} from "../api/routes/auth/auth-routes.js";
import type { ServiceCredentialStore } from "../security/auth-stores/types.js";

export const LOCAL_AI_SERVICE_CREDENTIAL_NAME = "ai-service (local)";

/** The locked-down AI service set: module invocation plus the Plan facets. */
export const LOCAL_AI_SERVICE_CAPABILITIES: readonly string[] = [
  "module.read",
  "module.write",
  "module.execute",
  ...AI_SERVICE_PLAN_CAPABILITIES,
];

const SECRET_PREFIX = "engsvc";

/** `<credentialId>.<rawSecret>`, the ENGENTY_AI_SERVICE_SECRET format. */
export function parseServiceSecret(
  value: string | undefined
): { credentialId: string; secret: string } | null {
  const raw = value?.trim() ?? "";
  const separator = raw.indexOf(".");
  if (separator <= 0) {
    return null;
  }
  const credentialId = raw.slice(0, separator).trim();
  const secret = raw.slice(separator + 1).trim();
  return credentialId && secret ? { credentialId, secret } : null;
}

export type EnsureLocalServiceCredentialResult =
  | { credentialId: string; status: "kept" }
  | {
      credentialId: string;
      reason: "missing" | "unknown" | "disabled" | "wrong_secret";
      /** `<credentialId>.<rawSecret>` — the one time the raw value exists. */
      secret: string;
      status: "minted";
    };

/**
 * Keep the configured secret when its row is live and the hash matches;
 * mint a fresh platform credential otherwise. Never touches the old row: a
 * stale id may belong to another stack this .env.local once pointed at.
 */
export async function ensureLocalServiceCredential(input: {
  configured: string | undefined;
  /** Test seam for the dated fallback name. */
  now?: () => Date;
  stores: Pick<ServiceCredentialStore, "get" | "insert">;
}): Promise<EnsureLocalServiceCredentialResult> {
  const parsed = parseServiceSecret(input.configured);
  let reason: "missing" | "unknown" | "disabled" | "wrong_secret" = "missing";
  if (parsed) {
    const row = await input.stores.get(parsed.credentialId);
    if (!row) {
      reason = "unknown";
    } else if (row.disabledAt !== undefined) {
      reason = "disabled";
    } else if (row.secretHash === toHash(parsed.secret)) {
      return { credentialId: parsed.credentialId, status: "kept" };
    } else {
      reason = "wrong_secret";
    }
  }
  const id = uuidv7();
  const rawSecret = randomToken(SECRET_PREFIX);
  const record = {
    capabilities: [...LOCAL_AI_SERVICE_CAPABILITIES],
    createdAt: nowEpochSeconds(),
    id,
    secretHash: toHash(rawSecret),
    tenantId: null,
  };
  try {
    await input.stores.insert({
      ...record,
      name: LOCAL_AI_SERVICE_CREDENTIAL_NAME,
    });
  } catch (error) {
    // One ACTIVE platform credential per name. A live row of ours whose
    // secret this checkout has lost is not revoked: another worktree's
    // .env.local may still hold it, and revoking would have the two
    // checkouts re-minting each other's credential forever. A second row
    // under a dated name is the harmless outcome; `service-token list` /
    // `revoke` clean up.
    if (!isActivePlatformNameConflict(error)) {
      throw error;
    }
    await input.stores.insert({
      ...record,
      name: `${LOCAL_AI_SERVICE_CREDENTIAL_NAME} ${(input.now ?? (() => new Date()))().toISOString().slice(0, 16)}Z`,
    });
  }
  return {
    credentialId: id,
    reason,
    secret: `${id}.${rawSecret}`,
    status: "minted",
  };
}

const ACTIVE_PLATFORM_NAME_CONSTRAINT =
  "service_credential_active_platform_name";

function isActivePlatformNameConflict(error: unknown): boolean {
  return (
    error instanceof Error &&
    error.message.includes(ACTIVE_PLATFORM_NAME_CONSTRAINT)
  );
}

/** Only a local Supabase may be written to without a person's bearer. */
export function isLocalSupabaseUrl(url: string | undefined): boolean {
  try {
    const host = new URL(url ?? "").hostname;
    return (
      host === "127.0.0.1" ||
      host === "localhost" ||
      host === "::1" ||
      host.endsWith(".localhost")
    );
  } catch {
    return false;
  }
}
