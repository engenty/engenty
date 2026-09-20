import { describe, expect, it, vi } from "vitest";
import {
  resolveTypeSafeClientOptions,
  TypeSafeClient,
  TypeSafeError,
} from "./client.js";

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    headers: { "content-type": "application/json" },
    status,
  });
}

describe("TypeSafeClient", () => {
  it("posts state, questions and the default model with a bearer header", async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse(200, { answers: {}, model: "jev-1.13.0" })
    );
    const client = new TypeSafeClient({ apiKey: "sk-test", fetchImpl });
    const result = await client.systemOne({
      questions: { q: { criteria: { a: null }, type: "choice" } },
      state: { page: "x" },
    });
    expect(result.model).toBe("jev-1.13.0");
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [
      string,
      RequestInit,
    ];
    expect(url).toBe("https://api.typesafe.ai/v1/systemone");
    expect(init.method).toBe("POST");
    expect((init.headers as Record<string, string>).authorization).toBe(
      "Bearer sk-test"
    );
    expect(JSON.parse(String(init.body))).toEqual({
      model: "jev-latest",
      questions: { q: { criteria: { a: null }, type: "choice" } },
      state: { page: "x" },
    });
  });

  it("retries 429/529/503 with backoff and then succeeds", async () => {
    vi.useFakeTimers();
    try {
      const fetchImpl = vi
        .fn()
        .mockResolvedValueOnce(jsonResponse(429, {}))
        .mockResolvedValueOnce(jsonResponse(529, {}))
        .mockResolvedValueOnce(jsonResponse(200, { answers: {}, model: "m" }));
      const client = new TypeSafeClient({ apiKey: "k", fetchImpl });
      const pending = client.systemOne({ questions: {}, state: "s" });
      await vi.runAllTimersAsync();
      await expect(pending).resolves.toEqual({ answers: {}, model: "m" });
      expect(fetchImpl).toHaveBeenCalledTimes(3);
    } finally {
      vi.useRealTimers();
    }
  });

  it("does not retry a 4xx and reports the status", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse(422, {}));
    const client = new TypeSafeClient({ apiKey: "k", fetchImpl });
    await expect(
      client.systemOne({ questions: {}, state: "s" })
    ).rejects.toMatchObject({ name: "TypeSafeError", status: 422 });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("gives up after the configured attempts", async () => {
    vi.useFakeTimers();
    try {
      const fetchImpl = vi.fn(async () => jsonResponse(429, {}));
      const client = new TypeSafeClient({ apiKey: "k", fetchImpl, retries: 2 });
      const pending = client.systemOne({ questions: {}, state: "s" });
      const outcome = pending.then(
        () => "resolved",
        (error: unknown) => error
      );
      await vi.runAllTimersAsync();
      const error = await outcome;
      expect(error).toBeInstanceOf(TypeSafeError);
      expect((error as TypeSafeError).status).toBe(429);
      expect(fetchImpl).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });

  it("lists models from either a bare array or a data envelope", async () => {
    const asArray = new TypeSafeClient({
      apiKey: "k",
      fetchImpl: vi.fn(async () => jsonResponse(200, [{ id: "jev-1.13.0" }])),
    });
    expect(await asArray.listModels()).toEqual([{ id: "jev-1.13.0" }]);
    const asEnvelope = new TypeSafeClient({
      apiKey: "k",
      fetchImpl: vi.fn(async () =>
        jsonResponse(200, { data: [{ id: "jev-1.13.0" }] })
      ),
    });
    expect(await asEnvelope.listModels()).toEqual([{ id: "jev-1.13.0" }]);
  });

  it("refuses an empty key up front", () => {
    expect(() => new TypeSafeClient({ apiKey: "  " })).toThrow(TypeSafeError);
  });
});

describe("resolveTypeSafeClientOptions", () => {
  it("prefers TypeSafe's own key and API", () => {
    expect(
      resolveTypeSafeClientOptions({
        AI_GATEWAY_API_KEY: "vck",
        TYPESAFE_API_KEY: "ts",
      })
    ).toEqual({
      apiKey: "ts",
      baseUrl: "https://api.typesafe.ai",
      model: "jev-latest",
      route: "typesafe",
    });
  });

  it("falls back to the Vercel AI Gateway's TypeSafe route with the gateway key", () => {
    expect(resolveTypeSafeClientOptions({ AI_GATEWAY_API_KEY: "vck" })).toEqual(
      {
        apiKey: "vck",
        baseUrl: "https://ai-gateway.vercel.sh/typesafe",
        model: "typesafe-ai/jev",
        route: "vercel-gateway",
      }
    );
  });

  it("honours TYPESAFE_MODEL on either route and is null without a key", () => {
    expect(
      resolveTypeSafeClientOptions({
        AI_GATEWAY_API_KEY: "vck",
        TYPESAFE_MODEL: "jev-1.13.0",
      })?.model
    ).toBe("jev-1.13.0");
    expect(resolveTypeSafeClientOptions({})).toBeNull();
    expect(resolveTypeSafeClientOptions({ TYPESAFE_API_KEY: "  " })).toBeNull();
  });

  it("posts to the gateway prefix when constructed with that base URL", async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse(200, { answers: {}, model: "typesafe-ai/jev" })
    );
    const client = new TypeSafeClient({
      apiKey: "vck",
      baseUrl: "https://ai-gateway.vercel.sh/typesafe",
      fetchImpl,
      model: "typesafe-ai/jev",
    });
    await client.systemOne({ questions: {}, state: "s" });
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [
      string,
      RequestInit,
    ];
    expect(url).toBe("https://ai-gateway.vercel.sh/typesafe/v1/systemone");
    expect(JSON.parse(String(init.body)).model).toBe("typesafe-ai/jev");
  });
});
