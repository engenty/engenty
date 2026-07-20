import { describe, expect, it } from "vitest";
import {
  mapImportRowToSecretCreateInput,
  parseImportOwnerScope,
  parseImportSecretKind,
  type SecretImportContext,
} from "./import-secrets.js";

const ctx: SecretImportContext = {
  clients: [{ id: "client-1", display_name: "Acme GmbH" }],
  currentUserId: "user-1",
  projects: [
    { id: "project-1", title: "Website Relaunch", client_id: "client-1" },
  ],
  tenantId: "tenant-1",
};

describe("parseImportSecretKind", () => {
  it("parses english and german synonyms", () => {
    expect(parseImportSecretKind("password")).toBe("username_password");
    expect(parseImportSecretKind("API-Schlüssel")).toBe("api_key");
    expect(parseImportSecretKind("kreditkarte")).toBe("credit_card");
    expect(parseImportSecretKind("notiz")).toBe("note");
  });
});

describe("parseImportOwnerScope", () => {
  it("defaults synonyms to scopes", () => {
    expect(parseImportOwnerScope("personal")).toBe("user");
    expect(parseImportOwnerScope("workspace")).toBe("tenant");
    expect(parseImportOwnerScope("kunde")).toBe("client");
    expect(parseImportOwnerScope("projekt")).toBe("project");
  });
});

describe("mapImportRowToSecretCreateInput", () => {
  it("creates a personal username/password secret", () => {
    expect(
      mapImportRowToSecretCreateInput(
        {
          name: "GitHub",
          kind: "login",
          username: "ada",
          password: "secret",
          url: "https://github.com",
        },
        ctx
      )
    ).toEqual({
      owner_scope: "user",
      owner_id: "user-1",
      name: "GitHub",
      kind: "username_password",
      url: "https://github.com",
      description: undefined,
      payload: { username: "ada", password: "secret" },
    });
  });

  it("resolves client owner by name", () => {
    expect(
      mapImportRowToSecretCreateInput(
        {
          name: "Hosting",
          kind: "api_key",
          owner_scope: "client",
          client_name: "Acme GmbH",
          value: "tok_123",
        },
        ctx
      )
    ).toMatchObject({
      owner_scope: "client",
      owner_id: "client-1",
      kind: "api_key",
      payload: { value: "tok_123" },
    });
  });

  it("requires name and payload", () => {
    expect(() =>
      mapImportRowToSecretCreateInput({ kind: "note", content: "x" }, ctx)
    ).toThrow(/name/i);
    expect(() =>
      mapImportRowToSecretCreateInput({ name: "Empty", kind: "note" }, ctx)
    ).toThrow(/note content/i);
  });
});
