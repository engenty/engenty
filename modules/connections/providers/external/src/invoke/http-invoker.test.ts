import { describe, expect, it, vi } from "vitest";
import type { ActionInvoke } from "../types.js";
import {
  buildHttpRequest,
  ExternalActionError,
  executeHttpAction,
  MAX_RESPONSE_CHARS,
} from "./http-invoker.js";

/** Stub DNS so the SSRF guard sees a public address for `api.example`. */
const publicLookup = vi.fn(async () => [
  { address: "93.184.216.34", family: 4 },
]);

const httpInvoke = (
  overrides: Partial<Extract<ActionInvoke, { kind: "http" }>> = {}
): Extract<ActionInvoke, { kind: "http" }> => ({
  body_content_type: null,
  kind: "http",
  method: "get",
  params: [],
  path_template: "/items/{id}",
  ...overrides,
});

describe("buildHttpRequest", () => {
  it("substitutes path params, places query and header params", () => {
    const request = buildHttpRequest({
      accessToken: "tok",
      auth: { kind: "oauth2", auth_url: "", scopes: [], token_url: "" },
      baseUrl: "https://api.example/v1",
      input: { expand: ["a", "b"], id: "42/x", "x-trace": "t1" },
      invoke: httpInvoke({
        params: [
          { location: "path", name: "id", required: true },
          { location: "query", name: "expand", required: false },
          { location: "header", name: "x-trace", required: false },
        ],
      }),
    });
    expect(request.url.toString()).toBe(
      "https://api.example/v1/items/42%2Fx?expand=a&expand=b"
    );
    expect(request.headers.get("x-trace")).toBe("t1");
    expect(request.headers.get("authorization")).toBe("Bearer tok");
  });

  it("throws on a missing required path param", () => {
    expect(() =>
      buildHttpRequest({
        accessToken: "tok",
        auth: { kind: "none" },
        baseUrl: "https://api.example",
        input: {},
        invoke: httpInvoke({
          params: [{ location: "path", name: "id", required: true }],
        }),
      })
    ).toThrow(ExternalActionError);
  });

  it("serializes JSON bodies and sets the content type", () => {
    const request = buildHttpRequest({
      accessToken: "tok",
      auth: { kind: "none" },
      baseUrl: "https://api.example",
      input: { body: { name: "n" } },
      invoke: httpInvoke({
        body_content_type: "application/json",
        method: "post",
        path_template: "/items",
      }),
    });
    expect(request.body).toBe('{"name":"n"}');
    expect(request.headers.get("content-type")).toBe("application/json");
    expect(request.method).toBe("POST");
  });

  it("places api_key credentials from the value template", () => {
    const request = buildHttpRequest({
      accessToken: JSON.stringify({ api_key: "sk-1" }),
      auth: {
        fields: [{ key: "api_key", label: "API key" }],
        kind: "api_key",
        placement: { in: "query", name: "key", value_template: "{{api_key}}" },
      },
      baseUrl: "https://api.example",
      input: {},
      invoke: httpInvoke({ path_template: "/items" }),
    });
    expect(request.url.searchParams.get("key")).toBe("sk-1");
  });
});

describe("executeHttpAction", () => {
  it("returns parsed JSON on success", async () => {
    const fetchImpl = vi.fn(
      async () =>
        new Response('{"ok":true}', {
          headers: { "content-type": "application/json" },
          status: 200,
        })
    ) as unknown as typeof fetch;
    const output = await executeHttpAction({
      accessToken: "tok",
      fetchImpl,
      input: {},
      invoke: httpInvoke({ path_template: "/ping" }),
      lookupImpl: publicLookup,
      record: {
        auth_config: { kind: "none" },
        base_url: "https://api.example",
        required_headers: [],
      },
    });
    expect(output).toEqual({ ok: true });
  });

  it("throws a typed error with status and trimmed body on failure", async () => {
    const fetchImpl = vi.fn(
      async () => new Response("boom", { status: 503 })
    ) as unknown as typeof fetch;
    await expect(
      executeHttpAction({
        accessToken: "tok",
        fetchImpl,
        input: {},
        invoke: httpInvoke({ path_template: "/ping" }),
        lookupImpl: publicLookup,
        record: {
          auth_config: { kind: "none" },
          base_url: "https://api.example",
          required_headers: [],
        },
      })
    ).rejects.toMatchObject({ name: "ExternalActionError", status: 503 });
  });

  it("clamps oversized responses with an explicit truncation marker", async () => {
    const big = "x".repeat(MAX_RESPONSE_CHARS + 100);
    const fetchImpl = vi.fn(
      async () =>
        new Response(big, {
          headers: { "content-type": "application/json" },
          status: 200,
        })
    ) as unknown as typeof fetch;
    const output = (await executeHttpAction({
      accessToken: "tok",
      fetchImpl,
      input: {},
      invoke: httpInvoke({ path_template: "/big" }),
      lookupImpl: publicLookup,
      record: {
        auth_config: { kind: "none" },
        base_url: "https://api.example",
        required_headers: [],
      },
    })) as { body: string; truncated: boolean };
    expect(output.truncated).toBe(true);
    expect(output.body.length).toBe(MAX_RESPONSE_CHARS);
  });

  it("fails clearly when the record has no base URL", async () => {
    await expect(
      executeHttpAction({
        accessToken: "tok",
        fetchImpl: fetch,
        input: {},
        invoke: httpInvoke(),
        record: {
          auth_config: { kind: "none" },
          base_url: null,
          required_headers: [],
        },
      })
    ).rejects.toThrow(/no base URL/u);
  });
});

describe("required headers", () => {
  it("sends registry-required headers, and never lets them shadow auth", () => {
    const request = buildHttpRequest({
      accessToken: JSON.stringify({ api_key: "k" }),
      auth: {
        fields: [{ key: "api_key", label: "API key" }],
        kind: "api_key",
        placement: {
          in: "header",
          name: "Authorization",
          value_template: "Bearer {{api_key}}",
        },
      },
      baseUrl: "https://api.example",
      input: {},
      invoke: httpInvoke({ path_template: "/things" }),
      requiredHeaders: [
        { description: null, name: "Notion-Version", value: "2022-06-28" },
        { description: null, name: "Authorization", value: "static-loses" },
      ],
    });
    expect(request.headers.get("notion-version")).toBe("2022-06-28");
    expect(request.headers.get("authorization")).toBe("Bearer k");
  });

  it("refuses to call a base URL that resolves to a private address", async () => {
    await expect(
      executeHttpAction({
        accessToken: "tok",
        fetchImpl: vi.fn() as unknown as typeof fetch,
        input: {},
        invoke: httpInvoke({ path_template: "/ping" }),
        lookupImpl: vi.fn(async () => [
          { address: "169.254.169.254", family: 4 },
        ]),
        record: {
          auth_config: { kind: "none" },
          base_url: "https://api.example",
          required_headers: [],
        },
      })
    ).rejects.toThrow(/blocked IP/u);
  });
});
