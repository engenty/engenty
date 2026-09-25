import { randomBytes } from "node:crypto";
import { createFakeApprovalDb } from "@engenty/approvals-sdk";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  registerConnectorDefinition,
  removeConnectorDefinition,
} from "./registry.js";
import { createConnectionsRepo } from "./repo.js";
import type { ConnectorDefinition } from "./types.js";

const TENANT = "tenant-a";

const TEST_CONNECTOR: ConnectorDefinition = {
  actions: [],
  auth: {
    kind: "api_key",
    apiKey: {
      fields: [],
      verify: async () => ({ label: "test" }),
    },
  },
  description: "test",
  id: "test-mail",
  moduleId: "connections-testmail",
  name: "Test Mail",
  toolPrefix: "testmail",
};

function request(overrides: Record<string, unknown> = {}) {
  return {
    actor_id: "agent-a",
    context: { action_id: "send", connection_id: "conn-1" },
    created_at: "2026-08-03T12:00:00.000Z",
    decided_at: null,
    decided_by: null,
    decision: null,
    expires_at: "2099-01-01T00:00:00.000Z",
    id: `r-${JSON.stringify(overrides).length}`,
    module_id: "connections",
    operation_id: "testmail_send",
    reason: "gated",
    status: "pending",
    tenant_id: TENANT,
    ...overrides,
  };
}

describe("createConnectionsRepo approval listing", () => {
  afterEach(() => {
    removeConnectorDefinition(TEST_CONNECTOR.id);
  });

  it("lists requests filed under connector module provenances too", async () => {
    // Core's gate files a connector action's request under the CONNECTOR
    // module's id — the UI list must cover the family, not just "connections".
    registerConnectorDefinition(TEST_CONNECTOR);
    const db = createFakeApprovalDb({
      approval_requests: [
        request({ id: "r1" }),
        request({ id: "r2", module_id: "connections-testmail" }),
        request({ id: "r3", module_id: "contacts" }),
      ],
    });
    const repo = createConnectionsRepo(db.client);
    const listed = await repo.listApprovalRequests({
      status: "pending",
      tenantId: TENANT,
    });
    expect(listed.map((r) => r.id).sort()).toEqual(["r1", "r2"]);
  });
});

describe("createConnectionsRepo.upsertConnectionWithTokens", () => {
  const KEY_ENV = "CONNECTIONS_TOKEN_ENC_KEY";
  let previous: string | undefined;

  beforeEach(() => {
    previous = process.env[KEY_ENV];
    process.env[KEY_ENV] = randomBytes(32).toString("base64");
  });

  afterEach(() => {
    if (previous === undefined) {
      delete process.env[KEY_ENV];
    } else {
      process.env[KEY_ENV] = previous;
    }
  });

  function connect(
    repo: ReturnType<typeof createConnectionsRepo>,
    patch: { connectedBy?: string; spaceId: string }
  ) {
    return repo.upsertConnectionWithTokens({
      accessToken: "token",
      connectedBy: patch.connectedBy ?? "user-1",
      connectorId: "test-mail",
      expiresAt: null,
      externalAccount: "Office@x.com",
      grantedScopes: [],
      refreshToken: null,
      spaceId: patch.spaceId,
      tenantId: TENANT,
    });
  }

  it("keys the account on its Space: same account, two Spaces, two rows", async () => {
    const db = createFakeApprovalDb();
    db.tables.connections = [];
    const repo = createConnectionsRepo(db.client);

    const marketing = await connect(repo, { spaceId: "space-marketing" });
    const sales = await connect(repo, { spaceId: "space-sales" });
    expect(marketing.id).not.toBe(sales.id);
    expect(db.tables.connections).toHaveLength(2);
    expect(db.tables.connections?.[0]).toMatchObject({
      connected_by: "user-1",
      space_id: "space-marketing",
    });
  });

  it("reconnecting in the same Space replaces tokens and keeps the id", async () => {
    const db = createFakeApprovalDb();
    db.tables.connections = [];
    const repo = createConnectionsRepo(db.client);

    const first = await connect(repo, { spaceId: "space-marketing" });
    const again = await connect(repo, {
      connectedBy: "user-2",
      spaceId: "space-marketing",
    });
    expect(again.id).toBe(first.id);
    expect(db.tables.connections).toHaveLength(1);
    // Who signed in first stays on record; a reconnect only swaps tokens.
    expect(db.tables.connections?.[0]?.connected_by).toBe("user-1");
  });
});
