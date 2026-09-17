import { describe, expect, it } from "vitest";
import { z } from "zod";
import {
  createContextTokensResolver,
  DEFAULT_HISTORY_TOKEN_LIMIT,
  estimateToolBlockTokens,
  historyTokenLimit,
  MIN_HISTORY_TOKEN_LIMIT,
  OUTPUT_RESERVE_TOKENS,
  RUNTIME_TAIL_RESERVE_TOKENS,
} from "../history-token-budget.js";

describe("historyTokenLimit", () => {
  it("subtracts the tool block and the reserves from the model's window", () => {
    expect(
      historyTokenLimit({ contextTokens: 200_000, env: {}, toolTokens: 50_000 })
    ).toBe(
      200_000 - 50_000 - OUTPUT_RESERVE_TOKENS - RUNTIME_TAIL_RESERVE_TOKENS
    );
  });

  it("keeps the fixed default when the window is unknown", () => {
    expect(historyTokenLimit({ contextTokens: null, env: {} })).toBe(
      DEFAULT_HISTORY_TOKEN_LIMIT
    );
  });

  it("never drops below the floor on a small window", () => {
    expect(
      historyTokenLimit({ contextTokens: 32_000, env: {}, toolTokens: 20_000 })
    ).toBe(MIN_HISTORY_TOKEN_LIMIT);
  });

  it("lets the env override win", () => {
    expect(
      historyTokenLimit({
        contextTokens: 1_000_000,
        env: { ENGENTY_AI_HISTORY_TOKEN_LIMIT: "250000" },
      })
    ).toBe(250_000);
  });
});

describe("estimateToolBlockTokens", () => {
  it("grows with the tools' schemas and descriptions", () => {
    const small = estimateToolBlockTokens({
      ping: { description: "ping", inputSchema: z.object({}) },
    });
    const large = estimateToolBlockTokens({
      ping: { description: "ping", inputSchema: z.object({}) },
      search: {
        description: "Search every record in the tenant by free text.",
        inputSchema: z.object({
          limit: z.number().optional(),
          query: z.string().describe("free text"),
        }),
      },
    });
    expect(small).toBeGreaterThan(0);
    expect(large).toBeGreaterThan(small);
  });
});

describe("createContextTokensResolver", () => {
  const rows = [
    { context_tokens: 1_048_576, model_id: "deepseek/deepseek-v4-pro" },
    { context_tokens: 1_000_000, model_id: "deepseek/deepseek-v4-pro" },
    { context_tokens: 128_000, model_id: "deepseek/deepseek-v4-pro-0813" },
  ];

  it("returns the smallest window among exact catalog matches, once per id", async () => {
    let calls = 0;
    const resolve = createContextTokensResolver(
      () =>
        ({
          listGatewayModels: async ({ search }: { search?: string }) => {
            calls += 1;
            return rows.filter((row) => row.model_id.includes(search ?? ""));
          },
        }) as never
    );
    await expect(resolve("deepseek/deepseek-v4-pro")).resolves.toBe(1_000_000);
    await expect(resolve("deepseek/deepseek-v4-pro")).resolves.toBe(1_000_000);
    expect(calls).toBe(1);
  });

  it("answers null for a miss, a store without the catalog, or a read failure", async () => {
    await expect(
      createContextTokensResolver(
        () => ({ listGatewayModels: async () => [] }) as never
      )("nope/none")
    ).resolves.toBeNull();
    await expect(
      createContextTokensResolver(() => ({}) as never)(
        "deepseek/deepseek-v4-pro"
      )
    ).resolves.toBeNull();
    await expect(
      createContextTokensResolver(
        () =>
          ({
            listGatewayModels: async () => {
              throw new Error("db down");
            },
          }) as never
      )("deepseek/deepseek-v4-pro")
    ).resolves.toBeNull();
  });
});
