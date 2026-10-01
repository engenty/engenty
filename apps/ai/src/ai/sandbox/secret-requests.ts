// A person enters a secret — a token, a password — for something an agent's
// tool does on the host, WITHOUT it passing through the agent.
//
// The tool parks the run on a card (`secret_request` preview). What the person
// types is posted to its own route (`submitSecretRequest`), never to the run's
// resume, and kept here in memory: the resume only says "entered" or
// "declined". The host tool that asked reads the value back with
// `lookupSecret` and uses it itself — it never reaches the model, the
// transcript or the sandbox.
//
// Memory only, on purpose: open code cannot depend on the closed secrets
// module. A value is scoped to one agent in one conversation and forgotten
// after CREDENTIAL_TTL_MS or on restart; the person is asked again then.
// Nothing here logs, returns or persists a value.

import { randomUUID } from "node:crypto";

/** How long a card can be answered. */
const REQUEST_TTL_MS = 10 * 60 * 1000;
/** How long an entered value is kept for the conversation. */
const CREDENTIAL_TTL_MS = 8 * 60 * 60 * 1000;

export interface SecretScope {
  agentId: string;
  spaceId: string;
  tenantId: string;
  /** The conversation the person answered in. */
  threadId: string;
}

export type SecretValues = Record<string, string>;

interface PendingRequest {
  expiresAtMs: number;
  fieldIds: readonly string[];
  /** What the value is for, e.g. `git:github.com`. */
  key: string;
  scope: SecretScope;
  submitted: boolean;
}

const pending = new Map<string, PendingRequest>();
const secrets = new Map<
  string,
  { expiresAtMs: number; values: SecretValues }
>();

function secretKey(scope: SecretScope, key: string): string {
  return [scope.tenantId, scope.spaceId, scope.agentId, scope.threadId, key]
    .map((part) => encodeURIComponent(part))
    .join("/");
}

function dropExpired(now = Date.now()): void {
  for (const [id, request] of pending) {
    if (request.expiresAtMs < now) {
      pending.delete(id);
    }
  }
  for (const [id, secret] of secrets) {
    if (secret.expiresAtMs < now) {
      secrets.delete(id);
    }
  }
}

/** The values entered for `key` in this conversation, if any are still kept. */
export function lookupSecret(
  scope: SecretScope,
  key: string
): SecretValues | null {
  dropExpired();
  return secrets.get(secretKey(scope, key))?.values ?? null;
}

/** Forget a value the far side rejected, so the next call asks again. */
export function forgetSecret(scope: SecretScope, key: string): void {
  secrets.delete(secretKey(scope, key));
}

export function openSecretRequest(input: {
  fieldIds: readonly string[];
  key: string;
  scope: SecretScope;
}): string {
  dropExpired();
  const requestId = randomUUID();
  pending.set(requestId, {
    expiresAtMs: Date.now() + REQUEST_TTL_MS,
    fieldIds: input.fieldIds,
    key: input.key,
    scope: input.scope,
    submitted: false,
  });
  return requestId;
}

export type SubmitSecretError = "expired" | "missing_value" | "not_found";

/**
 * Keep what the person entered. The caller has checked they may enter the
 * Space; this checks the request belongs to that Space and is still open.
 */
export function submitSecretRequest(input: {
  requestId: string;
  spaceId: string;
  tenantId: string;
  values: SecretValues;
}): { ok: true } | { error: SubmitSecretError; ok: false } {
  dropExpired();
  const request = pending.get(input.requestId);
  if (
    !request ||
    request.scope.spaceId !== input.spaceId ||
    request.scope.tenantId !== input.tenantId
  ) {
    return { error: "not_found", ok: false };
  }
  if (request.submitted) {
    return { error: "expired", ok: false };
  }
  const values: SecretValues = {};
  for (const id of request.fieldIds) {
    const value = input.values[id];
    if (typeof value === "string" && value.length > 0) {
      values[id] = value;
    }
  }
  if (Object.keys(values).length === 0) {
    return { error: "missing_value", ok: false };
  }
  request.submitted = true;
  secrets.set(secretKey(request.scope, request.key), {
    expiresAtMs: Date.now() + CREDENTIAL_TTL_MS,
    values,
  });
  return { ok: true };
}

/** Close a request once its run resumed, answered or not. */
export function closeSecretRequest(requestId: string): void {
  pending.delete(requestId);
}

/** Tests only. */
export function resetSecretRequestsForTests(): void {
  pending.clear();
  secrets.clear();
}
