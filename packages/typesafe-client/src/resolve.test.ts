import { describe, expect, it } from "vitest";
import { readJevEnv, resolveJevClient, warmJev } from "./resolve.js";

const envOf = (values: Record<string, string | undefined>) => (key: string) =>
  values[key];

describe("resolveJevClient", () => {
  it("is null without a key", () => {
    expect(resolveJevClient("typesafe-ai/jev", envOf({}))).toBeNull();
  });

  it("opens TypeSafe's own API on its key", () => {
    const jev = resolveJevClient(
      "typesafe-ai/jev",
      envOf({ TYPESAFE_API_KEY: "ts-key" })
    );
    expect(jev?.route).toBe("typesafe");
    expect(jev?.model).toBe("jev-latest");
  });

  it("opens the Vercel gateway door on the gateway key alone", () => {
    const jev = resolveJevClient(
      "typesafe-ai/jev",
      envOf({ AI_GATEWAY_API_KEY: "vc-key" })
    );
    expect(jev?.route).toBe("vercel-gateway");
    expect(jev?.model).toBe("typesafe-ai/jev");
  });

  it("names the bound model, not an env override", () => {
    const jev = resolveJevClient(
      "typesafe-ai/jev-preview",
      envOf({ AI_GATEWAY_API_KEY: "vc-key", TYPESAFE_MODEL: "jev-other" })
    );
    expect(jev?.model).toBe("typesafe-ai/jev-preview");
  });

  it("reads only the two keys", () => {
    expect(Object.keys(readJevEnv(envOf({ OTHER: "x" }))).sort()).toEqual([
      "AI_GATEWAY_API_KEY",
      "TYPESAFE_API_KEY",
    ]);
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

    expect(warmJev("typesafe-ai/jev", envOf({}), { fetchImpl })).toBe(false);
    expect(probed).toEqual([]);

    expect(
      warmJev("typesafe-ai/jev", envOf({ AI_GATEWAY_API_KEY: "vc-key" }), {
        fetchImpl,
      })
    ).toBe(true);
    expect(probed).toEqual(["https://ai-gateway.vercel.sh/typesafe/v1/models"]);
  });
});
