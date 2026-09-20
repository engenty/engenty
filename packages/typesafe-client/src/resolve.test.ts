import { describe, expect, it } from "vitest";
import {
  isJevConfigured,
  readJevEnv,
  resolveJevClient,
  warmJev,
} from "./resolve.js";

const envOf = (values: Record<string, string | undefined>) => (key: string) =>
  values[key];

describe("resolveJevClient", () => {
  it("is null without a key", () => {
    expect(resolveJevClient(envOf({}))).toBeNull();
  });

  it("opens TypeSafe's own API on its key", () => {
    const jev = resolveJevClient(envOf({ TYPESAFE_API_KEY: "ts-key" }));
    expect(jev?.route).toBe("typesafe");
    expect(jev?.model).toBe("jev-latest");
  });

  it("opens the Vercel gateway door on the gateway key alone", () => {
    const jev = resolveJevClient(envOf({ AI_GATEWAY_API_KEY: "vc-key" }));
    expect(jev?.route).toBe("vercel-gateway");
    expect(jev?.model).toBe("typesafe-ai/jev");
  });

  it("honours the model override on either door", () => {
    const jev = resolveJevClient(
      envOf({ AI_GATEWAY_API_KEY: "vc-key", TYPESAFE_MODEL: "jev-preview" })
    );
    expect(jev?.model).toBe("jev-preview");
  });

  it("reads only the three keys", () => {
    expect(Object.keys(readJevEnv(envOf({ OTHER: "x" }))).sort()).toEqual([
      "AI_GATEWAY_API_KEY",
      "TYPESAFE_API_KEY",
      "TYPESAFE_MODEL",
    ]);
  });
});

describe("isJevConfigured", () => {
  it("answers the door question without building a client", () => {
    expect(isJevConfigured(envOf({}))).toBe(false);
    expect(isJevConfigured(envOf({ AI_GATEWAY_API_KEY: "vc-key" }))).toBe(true);
    expect(isJevConfigured(envOf({ TYPESAFE_API_KEY: "ts-key" }))).toBe(true);
  });
});

describe("warmJev", () => {
  it("does nothing without a door, probes behind one", () => {
    const probed: string[] = [];
    const fetchImpl = (async (input: string) => {
      probed.push(String(input));
      return new Response("{}", {
        headers: { "content-type": "application/json" },
      });
    }) as unknown as typeof fetch;

    expect(warmJev(envOf({}), { fetchImpl })).toBe(false);
    expect(probed).toEqual([]);

    expect(
      warmJev(envOf({ AI_GATEWAY_API_KEY: "vc-key" }), { fetchImpl })
    ).toBe(true);
    expect(probed).toEqual(["https://ai-gateway.vercel.sh/typesafe/v1/models"]);
  });
});
