import { createFakeApprovalDb } from "@engenty/approvals-sdk";
import { afterEach, describe, expect, it } from "vitest";

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
