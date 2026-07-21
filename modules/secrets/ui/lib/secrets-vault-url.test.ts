import { describe, expect, it } from "vitest";
import {
  parseSecretsKindFilter,
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
        kind: null,
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
        kind: null,
        tab: "clients",
      })
    ).toBe("/mdl/secrets?client=c1");
    expect(
      secretsVaultHref({
        project: "p1",
        client: null,
        scope: null,
        kind: null,
        tab: "projects",
      })
    ).toBe("/mdl/secrets?project=p1&tab=projects");
  });

  it("encodes kind filter", () => {
    expect(
      secretsVaultHref({
        kind: "api_key",
        scope: null,
        client: null,
        project: null,
        tab: "clients",
      })
    ).toBe("/mdl/secrets?kind=api_key");
  });

  it("merges with current filters", () => {
    expect(
      secretsVaultHref(
        { tab: "projects" },
        {
          q: "vpn",
          scope: null,
          kind: "api_key",
          client: "c1",
          project: null,
          tab: "clients",
        }
      )
    ).toBe("/mdl/secrets?q=vpn&kind=api_key&client=c1&tab=projects");
  });
});

describe("parse helpers", () => {
  it("parses tab, scope, and kind", () => {
    expect(parseSecretsSidebarTab("projects")).toBe("projects");
    expect(parseSecretsSidebarTab("other")).toBe("clients");
    expect(parseSecretsScopeFilter("user")).toBe("user");
    expect(parseSecretsScopeFilter("client")).toBeNull();
    expect(parseSecretsKindFilter("api_key")).toBe("api_key");
    expect(parseSecretsKindFilter("password")).toBeNull();
  });
});
