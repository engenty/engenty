import {
  __resetConnectorRegistryForTests,
  type ConnectionSummary,
  type ConnectorActionContext,
  connectorOperationId,
  registerConnectorDefinition,
} from "@engenty/connections-sdk";
import { afterEach, describe, expect, it } from "vitest";
import { githubConnector } from "./connector.js";

const VALID_GROUPS = new Set(["read", "write", "destructive"]);

function stubContext(fetchImpl: typeof fetch): ConnectorActionContext {
  const connection: ConnectionSummary = {
    auth_kind: "oauth2",
    autonomous_mode: "off",
    connector_id: "github",
    created_at: new Date(0).toISOString(),
    display_name: null,
    error_message: null,
    external_account: null,
    granted_scopes: ["repo"],
    id: "conn-1",
    non_owner_max_group: null,
    owner_user_id: "user-1",
    sharing: "personal",
    status: "active",
    tenant_id: "tenant-1",
  };
  return {
    accessToken: "gho_test-token",
    connection,
    fetchImpl,
    log: () => undefined,
  };
}

/** Minimal JSON Response stub. */
function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    headers: { "content-type": "application/json" },
    status,
  });
}

afterEach(() => {
  __resetConnectorRegistryForTests();
});

describe("github connector definition", () => {
  it("has unique action ids", () => {
    const ids = githubConnector.actions.map((action) => action.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("only uses valid action groups (and none destructive in v1)", () => {
    for (const action of githubConnector.actions) {
      expect(VALID_GROUPS.has(action.group)).toBe(true);
    }
    expect(
      githubConnector.actions.filter((a) => a.group === "destructive")
    ).toHaveLength(0);
  });

  it("projects the expected operation ids", () => {
    const operationIds = githubConnector.actions.map((action) =>
      connectorOperationId(githubConnector, action.id)
    );
    expect(operationIds).toEqual(
      expect.arrayContaining([
        "github_repos_list",
        "github_repo_get",
        "github_pr_get",
        "github_pr_create",
      ])
    );
    expect(operationIds).toHaveLength(4);
  });

  it("does not expose a raw-token action (checkout credential is not a gateway op)", () => {
    const ids = githubConnector.actions.map((a) => a.id);
    expect(ids).not.toContain("repo_token");
    // The only write action is pr_create — the human delivery gate.
    expect(githubConnector.actions.filter((a) => a.group === "write")).toEqual([
      expect.objectContaining({ id: "pr_create" }),
    ]);
  });

  it("requests the repo scope up front and opts into a JSON token response", () => {
    expect(githubConnector.auth.kind).toBe("oauth2");
    if (githubConnector.auth.kind !== "oauth2") {
      return;
    }
    expect(githubConnector.auth.oauth2.baseScopes).toContain("repo");
    expect(githubConnector.auth.oauth2.tokenRequestHeaders?.accept).toBe(
      "application/json"
    );
  });

  it("registers cleanly in the shared connector registry", () => {
    expect(() => registerConnectorDefinition(githubConnector)).not.toThrow();
  });

  it("lists repositories, mapping the GitHub shape", async () => {
    const fetchStub = (async (url: string) => {
      expect(url).toContain("/user/repos");
      return jsonResponse([
        {
          default_branch: "main",
          description: "demo",
          full_name: "acme/widget",
          html_url: "https://github.com/acme/widget",
          private: true,
        },
      ]);
    }) as unknown as typeof fetch;
    const action = githubConnector.actions.find((a) => a.id === "repos_list");
    const result = (await action?.handler({}, stubContext(fetchStub))) as {
      repositories: { full_name: string; default_branch: string }[];
    };
    expect(result.repositories).toEqual([
      expect.objectContaining({
        full_name: "acme/widget",
        default_branch: "main",
      }),
    ]);
  });

  it("creates a pull request via POST and maps the result", async () => {
    const fetchStub = (async (url: string, init?: RequestInit) => {
      expect(url).toContain("/repos/acme/widget/pulls");
      expect(init?.method).toBe("POST");
      const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
      expect(body).toMatchObject({
        title: "Add X",
        head: "coder/task-1",
        base: "main",
      });
      return jsonResponse({
        base: { ref: "main" },
        head: { ref: "coder/task-1" },
        html_url: "https://github.com/acme/widget/pull/7",
        number: 7,
        state: "open",
        title: "Add X",
      });
    }) as unknown as typeof fetch;
    const action = githubConnector.actions.find((a) => a.id === "pr_create");
    const result = (await action?.handler(
      {
        repo: "acme/widget",
        title: "Add X",
        head: "coder/task-1",
        base: "main",
      },
      stubContext(fetchStub)
    )) as { number: number; html_url: string };
    expect(result).toMatchObject({
      number: 7,
      html_url: "https://github.com/acme/widget/pull/7",
    });
  });

  it("throws github_api_error with the GitHub message on failure", async () => {
    const fetchStub = (async () =>
      jsonResponse({ message: "Not Found" }, 404)) as unknown as typeof fetch;
    const action = githubConnector.actions.find((a) => a.id === "repo_get");
    await expect(
      action?.handler({ repo: "acme/missing" }, stubContext(fetchStub))
    ).rejects.toThrow("github_api_error: Not Found (404)");
  });
});
