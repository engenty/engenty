import {
  __resetConnectorRegistryForTests,
  type ConnectionSummary,
  type ConnectorActionContext,
  connectorOperationId,
  registerConnectorDefinition,
} from "@engenty/connections-sdk";
import { afterEach, describe, expect, it } from "vitest";
import { SLACK_USER_SCOPES, slackConnector } from "./connector.js";

const VALID_GROUPS = new Set(["read", "write", "destructive"]);

/** The user scope each action actually needs at the Slack Web API. */
const REQUIRED_SCOPES_BY_ACTION: Record<string, string[]> = {
  add_reaction: ["reactions:write"],
  get_channel_history: ["channels:history", "groups:history"],
  get_thread_replies: ["channels:history", "groups:history"],
  list_channels: ["channels:read", "groups:read"],
  list_users: ["users:read"],
  post_message: ["chat:write"],
  search_messages: ["search:read"],
  update_message: ["chat:write"],
};

function stubContext(fetchImpl: typeof fetch): ConnectorActionContext {
  const connection: ConnectionSummary = {
    autonomous_mode: "off",
    connector_id: "slack",
    created_at: new Date(0).toISOString(),
    display_name: null,
    error_message: null,
    external_account: null,
    granted_scopes: [...SLACK_USER_SCOPES],
    id: "conn-1",
    non_owner_max_group: null,
    owner_user_id: "user-1",
    sharing: "personal",
    status: "active",
    tenant_id: "tenant-1",
  };
  return {
    accessToken: "xoxp-test-token",
    connection,
    fetchImpl,
    log: () => undefined,
  };
}

afterEach(() => {
  __resetConnectorRegistryForTests();
});

describe("slack connector definition", () => {
  it("has unique action ids", () => {
    const ids = slackConnector.actions.map((action) => action.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("only uses valid action groups (and none destructive in v1)", () => {
    for (const action of slackConnector.actions) {
      expect(VALID_GROUPS.has(action.group)).toBe(true);
    }
    expect(
      slackConnector.actions.filter((a) => a.group === "destructive")
    ).toHaveLength(0);
  });

  it("projects the expected operation ids", () => {
    const operationIds = slackConnector.actions.map((action) =>
      connectorOperationId(slackConnector, action.id)
    );
    expect(operationIds).toEqual(
      expect.arrayContaining([
        "slack_list_channels",
        "slack_get_channel_history",
        "slack_get_thread_replies",
        "slack_search_messages",
        "slack_list_users",
        "slack_post_message",
        "slack_update_message",
        "slack_add_reaction",
      ])
    );
    expect(operationIds).toHaveLength(8);
  });

  it("requests every user scope the actions need via user_scope", () => {
    const userScopeParam =
      slackConnector.auth.oauth2.extraAuthParams?.user_scope ?? "";
    const requested = new Set(userScopeParam.split(","));
    for (const action of slackConnector.actions) {
      const needed = REQUIRED_SCOPES_BY_ACTION[action.id];
      expect(
        needed,
        `missing scope mapping for action ${action.id}`
      ).toBeDefined();
      for (const scope of needed ?? []) {
        expect(
          requested,
          `user_scope missing ${scope} (${action.id})`
        ).toContain(scope);
      }
      // Slack user scopes ride on user_scope, never on providerScopes/scope.
      expect(action.providerScopes ?? []).toHaveLength(0);
    }
    expect(slackConnector.auth.oauth2.baseScopes).toHaveLength(0);
  });

  it("registers cleanly in the shared connector registry", () => {
    expect(() => registerConnectorDefinition(slackConnector)).not.toThrow();
  });

  it("throws slack_api_error when Slack responds ok:false", async () => {
    const fetchStub = (async () =>
      new Response(JSON.stringify({ error: "channel_not_found", ok: false }), {
        headers: { "content-type": "application/json" },
        status: 200,
      })) as typeof fetch;
    const action = slackConnector.actions.find(
      (a) => a.id === "get_channel_history"
    );
    expect(action).toBeDefined();
    await expect(
      action?.handler({ channel: "C0000000000" }, stubContext(fetchStub))
    ).rejects.toThrow("slack_api_error: channel_not_found");
  });
});
