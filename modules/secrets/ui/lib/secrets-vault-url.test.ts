import { describe, expect, it } from "vitest";
import {
  parseSecretsScopeFilter,
  parseSecretsSidebarTab,
  secretsVaultHref,
} from "./secrets-vault-url.js";

describe("secretsVaultHref", () => {
  it("builds the vault root with no filters", () => {
    expect(
      secretsVaultHref({
        q: "",
        scope: null,
        client: null,
        project: null,
        tab: "clients",
      })
    ).toBe("/mdl/secrets");
  });

  it("encodes client and project filters", () => {
    expect(
      secretsVaultHref({
        client: "c1",
        project: null,
        scope: null,
        tab: "clients",
      })
    ).toBe("/mdl/secrets?client=c1");
    expect(
      secretsVaultHref({
        project: "p1",
        client: null,
        scope: null,
        tab: "projects",
      })
    ).toBe("/mdl/secrets?project=p1&tab=projects");
  });

  it("merges with current filters", () => {
    expect(
      secretsVaultHref(
        { tab: "projects" },
        { q: "vpn", scope: null, client: "c1", project: null, tab: "clients" }
      )
    ).toBe("/mdl/secrets?q=vpn&client=c1&tab=projects");
  });
});

describe("parse helpers", () => {
  it("parses tab and scope", () => {
    expect(parseSecretsSidebarTab("projects")).toBe("projects");
    expect(parseSecretsSidebarTab("other")).toBe("clients");
    expect(parseSecretsScopeFilter("user")).toBe("user");
    expect(parseSecretsScopeFilter("client")).toBeNull();
  });
});
