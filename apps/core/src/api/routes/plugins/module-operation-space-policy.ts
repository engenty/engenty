/**
 * Authoritative pre-dispatch Space policy for module operations.
 *
 * Prompt filtering and `auth.spaceId` on the handler context are not enough:
 * list/create/get/update/delete still decide independently whether to use
 * that id. This helper runs once, before the handler, so a Space-bound call
 * cannot list another Space's rows or fetch a record the user could open
 * from a different Space.
 */
import {
  forbiddenError,
  notFoundError,
  type OperationSpacePolicy,
} from "@engenty/plugin-sdk";

const DEFAULT_SPACE_INPUT_KEY = "space_id" as const;

export interface OperationSpacePolicyAuth {
  spaceId?: string;
  tenantId: string;
}

export type FindRecordSpaceId = (input: {
  moduleId: string;
  recordId: string;
  tenantId: string;
}) => Promise<string | null>;

export type IsConnectionMounted = (connectionId: string) => Promise<boolean>;

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function readString(input: unknown, key: string): string | undefined {
  if (!isPlainObject(input)) {
    return;
  }
  const value = input[key];
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function withKey(
  input: unknown,
  key: string,
  value: string
): Record<string, unknown> {
  return {
    ...(isPlainObject(input) ? input : {}),
    [key]: value,
  };
}

/**
 * Inject `auth.spaceId` into a space-owned collection/create payload so a
 * schema that requires `space_id` still parses for a Space-bound caller.
 * Other kinds never invent a `space_id`.
 */
export function prepareOperationSpaceInput(params: {
  auth: OperationSpacePolicyAuth;
  input: unknown;
  policy: OperationSpacePolicy | undefined;
}): unknown {
  const spaceId = params.auth.spaceId?.trim();
  if (
    !(params.policy?.kind === "space_owned" && spaceId && !params.policy.record)
  ) {
    return params.input;
  }
  const key = params.policy.spaceInputKey ?? DEFAULT_SPACE_INPUT_KEY;
  const explicit = readString(params.input, key);
  if (explicit && explicit !== spaceId) {
    throw forbiddenError(
      "space_id_conflict",
      "This operation is bound to the active Space and cannot use a different space_id.",
      { active_space_id: spaceId }
    );
  }
  return withKey(params.input, key, spaceId);
}

/**
 * After input schema parse: re-apply collection injection (zod may have
 * stripped an undeclared `space_id`), refuse conflicting ids, and resolve
 * get/update/delete rows against the record's Space.
 */
export async function enforceOperationSpacePolicy(params: {
  auth: OperationSpacePolicyAuth;
  findRecordSpaceId?: FindRecordSpaceId;
  input: unknown;
  isConnectionMounted?: IsConnectionMounted;
  policy: OperationSpacePolicy | undefined;
}): Promise<unknown> {
  const policy = params.policy;
  if (!policy) {
    return params.input;
  }
  if (policy.kind === "tenant_shared" || policy.kind === "platform") {
    return params.input;
  }
  if (policy.kind === "user_owned") {
    return params.input;
  }
  if (policy.kind === "account_mounted") {
    return enforceAccountMounted(params, policy);
  }
  return enforceSpaceOwned(params, policy);
}

async function enforceAccountMounted(
  params: {
    auth: OperationSpacePolicyAuth;
    input: unknown;
    isConnectionMounted?: IsConnectionMounted;
  },
  policy: Extract<OperationSpacePolicy, { kind: "account_mounted" }>
): Promise<unknown> {
  const spaceId = params.auth.spaceId?.trim();
  const key = policy.connectionInputKey;
  const connectionId = key ? readString(params.input, key) : undefined;
  if (!(spaceId && key && connectionId && params.isConnectionMounted)) {
    return params.input;
  }
  if (await params.isConnectionMounted(connectionId)) {
    return params.input;
  }
  throw forbiddenError(
    "connection_not_in_space",
    "That account belongs to a different Space than the active one. Use an account of this Space; do not retry.",
    { connection_id: connectionId }
  );
}

async function enforceSpaceOwned(
  params: {
    auth: OperationSpacePolicyAuth;
    findRecordSpaceId?: FindRecordSpaceId;
    input: unknown;
  },
  policy: Extract<OperationSpacePolicy, { kind: "space_owned" }>
): Promise<unknown> {
  const spaceId = params.auth.spaceId?.trim();
  if (!spaceId) {
    return params.input;
  }
  if (!policy.record) {
    return prepareOperationSpaceInput({
      auth: params.auth,
      input: params.input,
      policy,
    });
  }
  const recordId = readString(params.input, policy.record.idInputKey);
  if (!recordId) {
    throw notFoundError(
      "space_record_unresolved",
      "This Space-owned operation requires a record id that can be resolved to a Space.",
      { id_input_key: policy.record.idInputKey }
    );
  }
  if (!params.findRecordSpaceId) {
    throw notFoundError(
      "space_record_unresolved",
      "This Space-owned record cannot be resolved to a Space from this call.",
      { module_id: policy.record.moduleId, record_id: recordId }
    );
  }
  const recordSpaceId = await params.findRecordSpaceId({
    moduleId: policy.record.moduleId,
    recordId,
    tenantId: params.auth.tenantId,
  });
  if (!recordSpaceId) {
    throw notFoundError(
      "space_record_unresolved",
      "This record is not part of the active Space.",
      { module_id: policy.record.moduleId, record_id: recordId }
    );
  }
  if (recordSpaceId !== spaceId) {
    throw notFoundError(
      "space_record_mismatch",
      "That record belongs to a different Space. Stay inside the active Space; do not retry with the same id.",
      { active_space_id: spaceId }
    );
  }
  const key = policy.spaceInputKey ?? DEFAULT_SPACE_INPUT_KEY;
  const explicit = readString(params.input, key);
  if (explicit && explicit !== spaceId) {
    throw forbiddenError(
      "space_id_conflict",
      "This operation is bound to the active Space and cannot use a different space_id.",
      { active_space_id: spaceId }
    );
  }
  return withKey(params.input, key, spaceId);
}
