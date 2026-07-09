import { capabilityCovers } from "./capability-match.js";
import type { PluginProfilePolicy } from "./index.js";

/**
 * Build an ownership ABAC profile policy: for the named operations, only the
 * row's owner may act — unless the principal holds an override capability
 * (the moderator path). Abstains (returns null) for other modules/operations,
 * for rows it can't resolve an owner for, and for override holders.
 */
export function ownershipPolicy(opts: {
  moduleId: string;
  operationIds: string[];
  /** Holders of this capability may touch anyone's rows. */
  overrideCapability: string;
  /** Resolve the owning principal id for the row targeted by this input. */
  loadOwnerId: (input: unknown) => Promise<string | null>;
}): PluginProfilePolicy {
  return async (input) => {
    if (input.moduleId !== opts.moduleId) {
      return null;
    }
    if (!opts.operationIds.includes(input.operationId)) {
      return null;
    }
    if (capabilityCovers(input.auth.capabilities, opts.overrideCapability)) {
      return null; // moderator / admin path
    }
    const ownerId = await opts.loadOwnerId(input.input);
    if (ownerId && ownerId === input.auth.principalId) {
      return null; // the owner
    }
    return {
      action: "deny",
      reason: `${input.operationId}: only the owner may do this`,
    };
  };
}
