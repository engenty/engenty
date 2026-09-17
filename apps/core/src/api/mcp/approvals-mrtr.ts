import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import type { PrincipalContext } from "../../security/auth.js";
import { hashMcpArguments } from "./audience.js";

export interface McpMrtrPayload {
  approvalRequestId: string;
  argsHash: string;
  clientId: string;
  exp: number;
  nonce: string;
  operationId: string;
  spaceId: string;
  tenantId: string;
  userId: string;
}

const spentNonces = new Set<string>();

export function mintMrtrPayload(params: {
  approvalRequestId: string;
  arguments: unknown;
  clientId: string;
  operationId: string;
  principal: PrincipalContext;
}): McpMrtrPayload {
  return {
    approvalRequestId: params.approvalRequestId,
    argsHash: hashMcpArguments(params.arguments),
    clientId: params.clientId,
    nonce: randomBytes(16).toString("hex"),
    exp: Math.floor(Date.now() / 1000) + 600,
    operationId: params.operationId,
    spaceId: params.principal.spaceId ?? "",
    tenantId: params.principal.tenantId,
    userId: params.principal.actingForUserId ?? params.principal.principalId,
  };
}

export function verifyMrtrPayload(params: {
  arguments: unknown;
  clientId: string;
  operationId: string;
  payload: McpMrtrPayload;
  principal: PrincipalContext;
}): { ok: true } | { ok: false; reason: string } {
  if (spentNonces.has(params.payload.nonce)) {
    return { ok: false, reason: "replayed_state" };
  }
  if (params.payload.exp <= Math.floor(Date.now() / 1000)) {
    return { ok: false, reason: "expired_state" };
  }
  if (params.payload.clientId !== params.clientId) {
    return { ok: false, reason: "client_mismatch" };
  }
  if (params.payload.operationId !== params.operationId) {
    return { ok: false, reason: "operation_mismatch" };
  }
  if (params.payload.spaceId !== (params.principal.spaceId ?? "")) {
    return { ok: false, reason: "space_mismatch" };
  }
  if (params.payload.tenantId !== params.principal.tenantId) {
    return { ok: false, reason: "tenant_mismatch" };
  }
  const userId =
    params.principal.actingForUserId ?? params.principal.principalId;
  if (params.payload.userId !== userId) {
    return { ok: false, reason: "user_mismatch" };
  }
  if (params.payload.argsHash !== hashMcpArguments(params.arguments)) {
    return { ok: false, reason: "modified_arguments" };
  }
  spentNonces.add(params.payload.nonce);
  return { ok: true };
}

export function mrtrRequestState(
  payload: McpMrtrPayload,
  secret: string
): string {
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const mac = createHmac("sha256", secret).update(body).digest("base64url");
  return `v1.${body}.${mac}`;
}

export function parseMrtrRequestState(
  state: string,
  secret: string
): McpMrtrPayload | null {
  const parts = state.split(".");
  if (parts.length !== 3 || parts[0] !== "v1") {
    return null;
  }
  const expected = createHmac("sha256", secret)
    .update(parts[1] ?? "")
    .digest("base64url");
  const actual = parts[2] ?? "";
  const expectedBytes = Buffer.from(expected);
  const actualBytes = Buffer.from(actual);
  if (
    expectedBytes.length !== actualBytes.length ||
    !timingSafeEqual(expectedBytes, actualBytes)
  ) {
    return null;
  }
  try {
    return JSON.parse(
      Buffer.from(parts[1], "base64url").toString("utf8")
    ) as McpMrtrPayload;
  } catch {
    return null;
  }
}

export function resetMrtrNoncesForTests(): void {
  spentNonces.clear();
}
