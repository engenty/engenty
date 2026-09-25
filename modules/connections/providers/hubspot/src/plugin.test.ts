import {
  __resetConnectorRegistryForTests,
  type ConnectorActionContext,
  registerConnectorDefinition,
} from "@engenty/connections-sdk";
import { afterEach, describe, expect, it, vi } from "vitest";
import { hubspotConnector, verifyHubSpotCredentials } from "./connector.js";

afterEach(() => {
  __resetConnectorRegistryForTests();
});

describe("hubspot connector", () => {
  it("registers with expected identity and list_contacts action", () => {
    expect(hubspotConnector.id).toBe("hubspot");
    expect(hubspotConnector.toolPrefix).toBe("hubspot");
    expect(hubspotConnector.moduleId).toBe("connections-hubspot");
    expect(hubspotConnector.auth.kind).toBe("api_key");
    expect(hubspotConnector.actions.map((a) => a.id)).toEqual([
      "list_contacts",
    ]);
    expect(() => registerConnectorDefinition(hubspotConnector)).not.toThrow();
  });

  it("maps list_contacts results for import", async () => {
    const fetchImpl = vi.fn(async () =>
      Response.json({
        results: [
          {
            id: "1",
            properties: {
              company: "Acme",
              email: "ada@acme.com",
              firstname: "Ada",
              lastname: "Lovelace",
              phone: "555",
              jobtitle: "Engineer",
            },
          },
        ],
        paging: { next: { after: "cursor-2" } },
      })
    );
    const ctx = {
      accessToken: JSON.stringify({ access_token: "pat-test" }),
      connection: {
        auth_kind: "api_key" as const,
        autonomous_mode: "off" as const,
        connected_by: null,
        connector_id: "hubspot",
        created_at: new Date(0).toISOString(),
        display_name: null,
        error_message: null,
        external_account: "HubSpot",
        granted_scopes: [],
        id: "c1",
        space_id: "space-1",
        status: "active" as const,
        tenant_id: "t1",
      },
      fetchImpl,
      log: () => undefined,
    } satisfies ConnectorActionContext;

    const action = hubspotConnector.actions.find(
      (a) => a.id === "list_contacts"
    );
    expect(action).toBeTruthy();
    const result = (await action?.handler({ page_size: 10 }, ctx)) as {
      contacts: { email: string | null; hubspot_id: string }[];
      next_page_token: string | null;
    };
    expect(result.contacts).toEqual([
      {
        company: "Acme",
        display_name: "Ada Lovelace",
        email: "ada@acme.com",
        first_name: "Ada",
        hubspot_id: "1",
        last_name: "Lovelace",
        phone: "555",
        title: "Engineer",
      },
    ]);
    expect(result.next_page_token).toBe("cursor-2");
  });

  it("verifies credentials with a lightweight contacts call", async () => {
    const fetchImpl = vi.fn(async () => new Response("{}", { status: 200 }));
    await expect(
      verifyHubSpotCredentials({ access_token: "pat-x" }, fetchImpl)
    ).resolves.toEqual({ label: "HubSpot" });
    expect(fetchImpl).toHaveBeenCalledOnce();
  });
});
