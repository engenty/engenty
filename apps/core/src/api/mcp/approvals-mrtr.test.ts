import { describe, expect, it } from "vitest";
import type { PrincipalContext } from "../../security/auth.js";
import {
  mintMrtrPayload,
  mrtrRequestState,
  parseMrtrRequestState,
  resetMrtrNoncesForTests,
  verifyMrtrPayload,
} from "./approvals-mrtr.js";

const principal = {
  actingForUserId: "user-1",
  principalId: "mcp:cursor",
  tenantId: "tenant-1",
} as PrincipalContext;

describe("MCP MRTR request state", () => {
  it("binds consent to client, user, tenant, tool, and arguments", () => {
    resetMrtrNoncesForTests();
    const payload = mintMrtrPayload({
      approvalRequestId: "apr-1",
      arguments: { id: "1" },
      clientId: "cursor",
      operationId: "contacts_update",
      principal,
    });
    const state = mrtrRequestState(payload, "secret-32-bytes-long-for-hmac!!");
    const parsed = parseMrtrRequestState(
      state,
      "secret-32-bytes-long-for-hmac!!"
    );
    expect(parsed?.approvalRequestId).toBe("apr-1");
    expect(
      verifyMrtrPayload({
        arguments: { id: "1" },
        clientId: "cursor",
        operationId: "contacts_update",
        payload: parsed!,
        principal,
      }).ok
    ).toBe(true);
  });

  it("rejects replay, modified arguments, and the wrong client", () => {
    resetMrtrNoncesForTests();
    const payload = mintMrtrPayload({
      approvalRequestId: "apr-1",
      arguments: { id: "1" },
      clientId: "cursor",
      operationId: "contacts_update",
      principal,
    });
    expect(
      verifyMrtrPayload({
        arguments: { id: "2" },
        clientId: "cursor",
        operationId: "contacts_update",
        payload,
        principal,
      })
    ).toMatchObject({ ok: false, reason: "modified_arguments" });
    expect(
      verifyMrtrPayload({
        arguments: { id: "1" },
        clientId: "other",
        operationId: "contacts_update",
        payload,
        principal,
      })
    ).toMatchObject({ ok: false, reason: "client_mismatch" });
    verifyMrtrPayload({
      arguments: { id: "1" },
      clientId: "cursor",
      operationId: "contacts_update",
      payload,
      principal,
    });
    expect(
      verifyMrtrPayload({
        arguments: { id: "1" },
        clientId: "cursor",
        operationId: "contacts_update",
        payload,
        principal,
      })
    ).toMatchObject({ ok: false, reason: "replayed_state" });
  });
});
