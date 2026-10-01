import { beforeEach, describe, expect, it } from "vitest";
import {
  lookupSecret,
  openSecretRequest,
  resetSecretRequestsForTests,
  submitSecretRequest,
} from "../secret-requests.js";

const SCOPE = {
  agentId: "space.researcher",
  spaceId: "space-1",
  tenantId: "tenant-1",
  threadId: "thread-1",
};
const KEY = "git:github.com";

function open() {
  return openSecretRequest({
    fieldIds: ["username", "password"],
    key: KEY,
    scope: SCOPE,
  });
}

describe("a secret a person enters for a host tool", () => {
  beforeEach(() => resetSecretRequestsForTests());

  it("is kept for the agent and conversation that asked", () => {
    const requestId = open();
    expect(
      submitSecretRequest({
        requestId,
        spaceId: SCOPE.spaceId,
        tenantId: SCOPE.tenantId,
        values: { password: "ghp_secret", username: "" },
      })
    ).toEqual({ ok: true });
    expect(lookupSecret(SCOPE, KEY)).toEqual({ password: "ghp_secret" });
  });

  it("is not visible to another conversation, agent, Space or remote", () => {
    const requestId = open();
    submitSecretRequest({
      requestId,
      spaceId: SCOPE.spaceId,
      tenantId: SCOPE.tenantId,
      values: { password: "ghp_secret" },
    });
    expect(lookupSecret({ ...SCOPE, threadId: "thread-2" }, KEY)).toBeNull();
    expect(lookupSecret({ ...SCOPE, agentId: "other" }, KEY)).toBeNull();
    expect(lookupSecret({ ...SCOPE, spaceId: "space-2" }, KEY)).toBeNull();
    expect(lookupSecret(SCOPE, "git:gitlab.com")).toBeNull();
  });

  it("cannot be answered from another Space or tenant", () => {
    const requestId = open();
    for (const where of [
      { spaceId: "space-2", tenantId: SCOPE.tenantId },
      { spaceId: SCOPE.spaceId, tenantId: "tenant-2" },
    ]) {
      expect(
        submitSecretRequest({
          requestId,
          ...where,
          values: { password: "x" },
        })
      ).toEqual({ error: "not_found", ok: false });
    }
    expect(lookupSecret(SCOPE, KEY)).toBeNull();
  });

  it("is answered once, and only with the fields it asked for", () => {
    const requestId = open();
    submitSecretRequest({
      requestId,
      spaceId: SCOPE.spaceId,
      tenantId: SCOPE.tenantId,
      values: { extra: "ignored", password: "first" },
    });
    expect(lookupSecret(SCOPE, KEY)).toEqual({ password: "first" });
    expect(
      submitSecretRequest({
        requestId,
        spaceId: SCOPE.spaceId,
        tenantId: SCOPE.tenantId,
        values: { password: "second" },
      })
    ).toEqual({ error: "expired", ok: false });
    expect(lookupSecret(SCOPE, KEY)).toEqual({ password: "first" });
  });
});
