import { describe, expect, it } from "vitest";
import { selectTokenAuth, tokenCredentialFields } from "./prefer-token-auth.js";

const figmaToken = {
  fields: [{ key: "api_key", label: "API key", required: true, secret: true }],
  kind: "api_key" as const,
  placement: {
    in: "header" as const,
    name: "X-Figma-Token",
    value_template: "{{api_key}}",
  },
};

describe("selectTokenAuth", () => {
  it("replaces unconfigured OAuth with the spec's API token", () => {
    const selected = selectTokenAuth(
      {
        auth_config: {
          auth_url: "https://www.figma.com/oauth",
          kind: "oauth2",
          scopes: ["files:read"],
          token_url: "https://api.figma.com/v1/oauth/token",
        },
        client_id_enc: null,
      },
      { auth: figmaToken, ok: true }
    );
    expect(selected).toEqual(figmaToken);
  });

  it("keeps OAuth once a client is stored", () => {
    expect(
      selectTokenAuth(
        {
          auth_config: {
            auth_url: "https://www.figma.com/oauth",
            kind: "oauth2",
            scopes: [],
            token_url: "https://api.figma.com/v1/oauth/token",
          },
          client_id_enc: "enc",
        },
        { auth: figmaToken, ok: true }
      )
    ).toBeNull();
  });
});

describe("tokenCredentialFields", () => {
  it("names the Figma header as a personal access token", () => {
    expect(tokenCredentialFields(figmaToken)[0]?.label).toBe(
      "Personal access token"
    );
  });
});
