/**
 * Shared types and Space policy helpers for Knowledge Base gateway operations.
 */
import type {
  OperationSpacePolicy,
  PluginAuthContext,
  PluginServerApi,
} from "@engenty/plugin-sdk";
import type { KbRepoFactory } from "../../src/dal/contracts.js";
import type { KnowledgeBase } from "../../src/schema/types.js";
import { createKbLinks, type KbLinks } from "../../src/services/kb-links.js";

export type KbRepos = KbRepoFactory;

export type KbGetRepo = (auth?: PluginAuthContext) => KbRepos;

export type KbGatewayServer = Pick<
  PluginServerApi,
  "registerOperation" | "getStorageService"
> &
  /**
   * Cross-module dispatch, used by `kb_source_ingest` to spawn the agentic
   * ingest task. Optional so pure registration surfaces (and tests) that never
   * dispatch stay valid — the op degrades to the in-process ingest path when
   * these are absent.
   */
  Partial<Pick<PluginServerApi, "callGatewayMethod" | "hasOperation">>;

export const KB_SPACE_OWNED_COLLECTION = {
  kind: "space_owned",
} as const satisfies OperationSpacePolicy;

export function kbSpaceOwnedRecord(idInputKey: string): OperationSpacePolicy {
  return {
    kind: "space_owned",
    record: { idInputKey, moduleId: "knowledge-base" },
  };
}

/**
 * Ordinary reads and writes. Writes are medium risk with `requiresApproval`:
 * `manual` mode still asks a human, `auto` passes once the space mounts the
 * module's write capability, `pass-all` never asks. Writing articles and
 * categories is the KB agents' bread-and-butter — versioned, reversible,
 * in-platform — and grading it `high` stalled every ingest run on a blind
 * approval regardless of the trust the space had declared.
 */
export const kbGatewayOp = (
  read: boolean,
  spacePolicy: OperationSpacePolicy
) => ({
  idempotent: read,
  moduleId: "knowledge-base" as const,
  requiresApproval: !read,
  riskLevel: read ? ("low" as const) : ("medium" as const),
  spacePolicy,
});

/** Destructive writes (deletes): gated in every mode short of pass-all. */
export const kbDestructiveOp = (spacePolicy: OperationSpacePolicy) => ({
  idempotent: false,
  moduleId: "knowledge-base" as const,
  requiresApproval: true,
  riskLevel: "high" as const,
  spacePolicy,
});

export function spaceIdFromKbAuth(
  auth: PluginAuthContext | undefined,
  input?: unknown
): string | undefined {
  const fromAuth = auth?.spaceId?.trim();
  if (fromAuth) {
    return fromAuth;
  }
  if (input && typeof input === "object" && !Array.isArray(input)) {
    const value = (input as Record<string, unknown>).space_id;
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }
}

/**
 * Link builders for the records of one knowledge base, or null when the KB is
 * unknown. Resolves the KB's space key once; a KB without a resolvable space
 * links in the `/mdl/…` form the shell redirects.
 *
 * Accepts the KB row when the handler already holds it, so listing a KB does
 * not fetch it a second time.
 */
export async function kbLinksFor(
  repos: KbRepos,
  kb: KnowledgeBase | string | null | undefined
): Promise<KbLinks | null> {
  const row = typeof kb === "string" ? await repos.kb.getById(kb) : kb;
  if (!row?.slug) {
    return null;
  }
  const spaceKey = row.space_id
    ? await repos.spaces.keyById(row.space_id)
    : null;
  return createKbLinks({ spaceKey });
}
