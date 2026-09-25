import { describe, expect, it, vi } from "vitest";
import {
  createClassifierClient,
  isJevClassifierRef,
} from "./classifier-client.js";

const envOf = (values: Record<string, string | undefined>) => (key: string) =>
  values[key];

describe("isJevClassifierRef", () => {
  it("recognises Jev ids on any gateway, nothing else", () => {
    expect(isJevClassifierRef("typesafe-ai/jev")).toBe(true);
    expect(isJevClassifierRef("vercel:typesafe-ai/jev")).toBe(true);
    expect(isJevClassifierRef("typesafe:jev-latest")).toBe(true);
    expect(isJevClassifierRef("openai/gpt-oss-20b")).toBe(false);
    expect(isJevClassifierRef("openrouter:openai/gpt-oss-20b")).toBe(false);
    expect(isJevClassifierRef("openrouter:typesafe-ai/jev")).toBe(true);
  });
});

describe("createClassifierClient — Jev", () => {
  it("is null without a key and without a ref", () => {
    expect(
      createClassifierClient("typesafe-ai/jev", { readEnv: envOf({}) })
    ).toBeNull();
    expect(createClassifierClient(null)).toBeNull();
  });

  it("asks the Vercel TypeSafe route for the bound model", async () => {
    const fetchImpl = vi.fn(async () =>
      Response.json({
        answers: {
          q: {
            choice: "a",
            confidence: 0.9,
            probabilities: { a: 0.95, b: 0.05 },
            type: "choice",
          },
        },
        model: "typesafe-ai/jev",
      })
    );
    const classifier = createClassifierClient("typesafe-ai/jev", {
      fetchImpl: fetchImpl as unknown as typeof fetch,
      readEnv: envOf({ AI_GATEWAY_API_KEY: "vck" }),
    });
    expect(classifier?.route).toBe("vercel-gateway");
    const response = await classifier?.client.systemOne({
      questions: { q: { criteria: { a: null, b: null }, type: "choice" } },
      state: "x",
    });
    expect(response?.answers.q).toMatchObject({ choice: "a" });
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [
      string,
      RequestInit,
    ];
    expect(url).toBe("https://ai-gateway.vercel.sh/typesafe/v1/systemone");
    expect(JSON.parse(String(init.body)).model).toBe("typesafe-ai/jev");
  });
});

describe("createClassifierClient — Jev only", () => {
  it("has no client for a non-Jev model, so callers fail open", () => {
    expect(
      createClassifierClient("openai/gpt-oss-20b", {
        readEnv: envOf({ AI_GATEWAY_API_KEY: "vck" }),
      })
    ).toBeNull();
  });

  it("reaches Jev bound on another gateway through the TypeSafe key", () => {
    const classifier = createClassifierClient("openrouter:typesafe-ai/jev", {
      readEnv: envOf({ TYPESAFE_API_KEY: "ts" }),
    });
    expect(classifier?.route).toBe("typesafe");
  });

  it("is null when neither key is set", () => {
    expect(
      createClassifierClient("typesafe-ai/jev", { readEnv: envOf({}) })
    ).toBeNull();
  });
});
