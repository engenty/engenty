import { describe, expect, it } from "vitest";
import { runSetupChecks } from "./setup-checks.js";

function fakeClient(failing: { core?: boolean; ai?: string[] } = {}) {
  return {
    schema: (schema: string) => ({
      from: (table: string) => ({
        select: async () => {
          if (schema === "core" && failing.core) {
            return { error: { message: "connection refused" } };
          }
          if (schema === "ai" && failing.ai?.includes(table)) {
            return { error: { message: `relation ai.${table} missing` } };
          }
          return { count: 0, error: null };
        },
      }),
    }),
  } as never;
}

const healthy = (async () =>
  new Response("{}", { status: 200 })) as typeof fetch;

describe("runSetupChecks", () => {
  it("is all green on a finished install", async () => {
    const checks = await runSetupChecks({
      aiBaseUrl: "http://127.0.0.1:8790",
      client: fakeClient(),
      env: { AI_GATEWAY_API_KEY: "vck" },
      fetchImpl: healthy,
      installedModuleIds: ["engenty-copilot", "files", "connections"],
      supabaseUrl: "http://127.0.0.1:56321",
    });
    expect(checks.map((c) => [c.id, c.status])).toEqual([
      ["database", "ok"],
      ["mastra_schema", "ok"],
      ["ai_service", "ok"],
      ["baseline_modules", "ok"],
      ["ai_provider", "ok"],
    ]);
    expect(checks[0]?.detail).toContain("127.0.0.1:56321");
  });

  it("names the migrate command when Mastra's tables are missing", async () => {
    const checks = await runSetupChecks({
      aiBaseUrl: "http://127.0.0.1:8790",
      client: fakeClient({ ai: ["mastra_messages"] }),
      env: {},
      fetchImpl: healthy,
      installedModuleIds: ["engenty-copilot", "files", "connections"],
      supabaseUrl: "http://127.0.0.1:56321",
    });
    const mastra = checks.find((c) => c.id === "mastra_schema");
    expect(mastra?.status).toBe("fail");
    expect(mastra?.fix).toBe("pnpm engenty db migrate");
    expect(mastra?.detail).toContain("mastra_messages");
  });

  it("fails the AI service row when core cannot reach apps/ai", async () => {
    const checks = await runSetupChecks({
      aiBaseUrl: "https://engenty.localhost",
      client: fakeClient(),
      env: {},
      fetchImpl: (async () => {
        throw new Error("ECONNREFUSED");
      }) as typeof fetch,
      installedModuleIds: null,
      supabaseUrl: null,
    });
    const ai = checks.find((c) => c.id === "ai_service");
    expect(ai?.status).toBe("fail");
    expect(ai?.detail).toContain("https://engenty.localhost/ai/health");
    expect(ai?.fix).toContain("pnpm dev:urls:portless");
    expect(checks.some((c) => c.id === "baseline_modules")).toBe(false);
  });

  it("warns, never blocks, on a missing provider key and points at step 3", async () => {
    const checks = await runSetupChecks({
      aiBaseUrl: "http://127.0.0.1:8790",
      client: fakeClient(),
      env: {},
      fetchImpl: healthy,
      installedModuleIds: ["engenty-copilot", "files", "connections"],
      supabaseUrl: "http://127.0.0.1:56321",
    });
    const provider = checks.find((c) => c.id === "ai_provider");
    expect(provider).toMatchObject({ status: "warn", step: 3 });
  });

  it("blocks when the build lacks a baseline module", async () => {
    const checks = await runSetupChecks({
      aiBaseUrl: "http://127.0.0.1:8790",
      client: fakeClient(),
      env: {},
      fetchImpl: healthy,
      installedModuleIds: ["engenty-copilot"],
      supabaseUrl: "http://127.0.0.1:56321",
    });
    const baseline = checks.find((c) => c.id === "baseline_modules");
    expect(baseline?.status).toBe("fail");
    expect(baseline?.fix).toBe("pnpm engenty install files connections");
  });

  // Core only logs a failed preflight outside production; the gate is where
  // a wrong SUPABASE_JWT_SECRET has to stop the person with the fix in hand.
  it("blocks with the env-init command when the server lane is rejected", async () => {
    const checks = await runSetupChecks({
      aiBaseUrl: "http://127.0.0.1:8790",
      client: fakeClient(),
      env: { AI_GATEWAY_API_KEY: "vck" },
      fetchImpl: healthy,
      installedModuleIds: ["engenty-copilot", "files", "connections"],
      serverLanePreflight: async () => {
        throw new Error(
          "Server-lane preflight failed: minted engenty_server tokens signed with HS256 (shared secret) are not accepted by PostgREST (No suitable key or wrong key type)."
        );
      },
      supabaseUrl: "http://127.0.0.1:56321",
    });
    const lane = checks.find((c) => c.id === "server_lane");
    expect(lane).toMatchObject({ status: "fail" });
    expect(lane?.detail).toContain("No suitable key");
    expect(lane?.fix).toContain("SUPABASE_JWT_SECRET");
    expect(checks.map((c) => c.id)).toEqual([
      "database",
      "server_lane",
      "mastra_schema",
      "ai_service",
      "baseline_modules",
      "ai_provider",
    ]);
  });

  it("passes the lane row, and omits it when the lane is not configured", async () => {
    const base = {
      aiBaseUrl: "http://127.0.0.1:8790",
      client: fakeClient(),
      env: { AI_GATEWAY_API_KEY: "vck" },
      fetchImpl: healthy,
      installedModuleIds: ["engenty-copilot", "files", "connections"],
      supabaseUrl: "http://127.0.0.1:56321",
    };
    const withLane = await runSetupChecks({
      ...base,
      serverLanePreflight: async () => undefined,
    });
    expect(withLane.find((c) => c.id === "server_lane")?.status).toBe("ok");
    const without = await runSetupChecks({
      ...base,
      serverLanePreflight: null,
    });
    expect(without.some((c) => c.id === "server_lane")).toBe(false);
  });
});
