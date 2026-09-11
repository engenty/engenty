/**
 * Operation-level Space policy — which records an operation may touch, and
 * how the active Space binds them (spaces-agent-alignment Package 4).
 *
 * Mounting an app in a Space is a separate question (availability). This
 * policy is row membership: whether the operation invents a `space_id`,
 * refuses a cross-Space record, or leaves tenant-shared books alone.
 */
import { z } from "zod";
import {
  DEFAULT_PLUGIN_PLACEMENT,
  type PluginPlacement,
} from "./plugin-category.js";

export const OPERATION_SPACE_POLICY_KINDS = [
  "platform",
  "tenant_shared",
  "space_owned",
  "account_mounted",
  "user_owned",
] as const;

export type OperationSpacePolicyKind =
  (typeof OPERATION_SPACE_POLICY_KINDS)[number];

/** Catalog `record_scope` is the policy kind — never guessed from the module id. */
export type OperationRecordScope = OperationSpacePolicyKind;

const spaceOwnedRecordSchema = z.object({
  idInputKey: z.string().min(1),
  moduleId: z.string().min(1),
});

export const operationSpacePolicySchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("platform") }),
  z.object({ kind: z.literal("tenant_shared") }),
  z.object({
    kind: z.literal("space_owned"),
    record: spaceOwnedRecordSchema.optional(),
    spaceInputKey: z.literal("space_id").optional(),
  }),
  z.object({
    connectionInputKey: z.string().min(1).optional(),
    kind: z.literal("account_mounted"),
  }),
  z.object({ kind: z.literal("user_owned") }),
]);

export type OperationSpacePolicy = z.infer<typeof operationSpacePolicySchema>;

export function isOperationSpacePolicy(
  value: unknown
): value is OperationSpacePolicy {
  return operationSpacePolicySchema.safeParse(value).success;
}

export function recordScopeFromSpacePolicy(
  policy: OperationSpacePolicy | undefined
): OperationRecordScope | undefined {
  return policy?.kind;
}

/**
 * Temporary compatibility entries for Space-placed operations that have not
 * declared `spacePolicy` yet. Every row needs an owner and a removal task —
 * an empty list is the intended state once Packages 9/10 finish classifying.
 */
export const MISSING_SPACE_POLICY_ALLOWLIST: readonly {
  operationId: string;
  owner: string;
  removalTask: string;
}[] = [];

export function isSpacePlacedPlugin(
  placement: PluginPlacement | undefined
): boolean {
  return (placement ?? DEFAULT_PLUGIN_PLACEMENT) === "space";
}

export function spacePlacedOperationsMissingPolicy(
  operations: ReadonlyArray<{
    moduleId: string;
    operationId: string;
    pluginPlacement?: PluginPlacement;
    spacePolicy?: OperationSpacePolicy;
  }>,
  allowlist: ReadonlyArray<{
    operationId: string;
    owner?: string;
    removalTask?: string;
  }> = MISSING_SPACE_POLICY_ALLOWLIST
): Array<{ moduleId: string; operationId: string }> {
  const allowed = new Set(allowlist.map((entry) => entry.operationId));
  return operations
    .filter(
      (operation) =>
        isSpacePlacedPlugin(operation.pluginPlacement) &&
        !operation.spacePolicy &&
        !allowed.has(operation.operationId)
    )
    .map((operation) => ({
      moduleId: operation.moduleId,
      operationId: operation.operationId,
    }));
}
