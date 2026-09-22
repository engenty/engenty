import { describe, expect, it } from "vitest";
import {
  accountUses,
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

  it("unions plugin mounts, space accounts, and agent grants as installed", () => {
    expect(
      installedPluginIds({
        grantedConnectorIds: new Set(["slack"]),
        pluginMountIds: new Set(["google-gmail"]),
        spaceConnectionConnectorIds: new Set(["github"]),
      })
    ).toEqual(new Set(["google-gmail", "github", "slack"]));
  });

  it("names where an account is used without a policy matrix", () => {
    expect(
      accountUses({
        account: {
          all_spaces: true,
          display_name: "me",
          external_account: "me@x",
          id: "a",
          owner_user_id: "u",
        },
        grantedToAgent: true,
        mountedOnSpace: true,
      })
    ).toEqual(["allSpaces", "thisSpace", "thisAgent"]);
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
