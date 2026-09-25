import { describe, expect, it } from "vitest";
import {
  connectorIdsWithSpaceAccounts,
  inferSourceKind,
  installedPluginIds,
  isRecommendedPlugin,
  isTenantImportedPlugin,
  kebabIdFrom,
  pluginMatchesQuery,
  snakePrefixFrom,
} from "./marketplace-model";

describe("marketplace-model", () => {
  it("treats connections-external as a tenant install", () => {
    expect(isTenantImportedPlugin({ module_id: "connections-external" })).toBe(
      true
    );
    expect(isTenantImportedPlugin({ module_id: "connections-google" })).toBe(
      false
    );
  });

  it("recommends curated builtins, not imports", () => {
    expect(isRecommendedPlugin({ module_id: "connections-google" })).toBe(true);
    expect(isRecommendedPlugin({ module_id: "connections-external" })).toBe(
      false
    );
    expect(isRecommendedPlugin({ module_id: "inbox" })).toBe(false);
  });

  it("derives kebab ids and snake prefixes from a domain", () => {
    expect(kebabIdFrom("api.sentry.io")).toBe("api-sentry-io");
    expect(snakePrefixFrom("api.sentry.io")).toBe("api_sentry_io");
  });

  it("infers MCP vs OpenAPI from a pasted URL", () => {
    expect(inferSourceKind("https://example.com/mcp")).toBe("mcp");
    expect(inferSourceKind("https://example.com/openapi.json")).toBe("openapi");
    expect(inferSourceKind("https://example.com/docs")).toBe(null);
  });

  it("unions plugin mounts and space accounts as installed", () => {
    expect(
      installedPluginIds({
        pluginMountIds: new Set(["google-gmail"]),
        spaceAccountConnectorIds: new Set(["github"]),
      })
    ).toEqual(new Set(["google-gmail", "github"]));
  });

  it("names connectors that have an account in the Space", () => {
    const account = {
      display_name: null,
      external_account: "me@x",
      id: "a",
      space_id: "s1",
    };
    expect(
      connectorIdsWithSpaceAccounts([
        { connections: [account], id: "google-gmail" },
        { connections: [], id: "slack" },
      ])
    ).toEqual(new Set(["google-gmail"]));
  });

  it("filters plugins by name, id, or description", () => {
    const plugin = {
      description: "Team chat",
      id: "slack",
      name: "Slack",
    };
    expect(pluginMatchesQuery(plugin, "chat")).toBe(true);
    expect(pluginMatchesQuery(plugin, "linear")).toBe(false);
  });
});
