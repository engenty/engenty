import type { ToolsInput } from "@mastra/core/agent";
import { createTool } from "@mastra/core/tools";
import { afterEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import {
  CODE_MODE_LIMITS,
  type CodeModeLimits,
  createEngentyCodeMode,
} from "../../../../ai/tools/engenty-tools/code-mode.js";
import { engentyToolsRunAls } from "../../../../ai/tools/engenty-tools/lib/run-context.js";

interface Outcome {
  error?: { message: string };
  notice?: string;
  result?: unknown;
  success: boolean;
}

/** Doubles a number; remembers how many calls ran and how many at once. */
function doubler() {
  const seen = { calls: 0, most: 0, running: 0 };
  const tool = createTool({
    id: "double",
    description: "Doubles a number.",
    inputSchema: z.object({ n: z.number() }),
    execute: async ({ n }) => {
      seen.calls += 1;
      seen.running += 1;
      seen.most = Math.max(seen.most, seen.running);
      await new Promise((resolve) => setTimeout(resolve, 5));
      seen.running -= 1;
      return { value: n * 2 };
    },
  });
  return { seen, tools: { double: tool } as ToolsInput };
}

function codeMode(tools?: ToolsInput, limits: Partial<CodeModeLimits> = {}) {
  const { tool } = createEngentyCodeMode(tools, {
    ...CODE_MODE_LIMITS,
    ...limits,
  });
  return (code: string) =>
    tool.execute?.({ code }, {} as never) as Promise<Outcome>;
}

/** Counts the calls that went through; a refused call is caught, not fatal. */
const TEN_CALLS = `let ok = 0;
for (let n = 0; n < 10; n++) {
  try { await external_double({ n }); ok++; } catch {}
}
return ok;`;

describe("Code Mode on QuickJS", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("loops over a tool and returns only the aggregate", async () => {
    const { seen, tools } = doubler();
    const outcome = await codeMode(tools)(
      `const all = await Promise.all([1, 2, 3, 4, 5, 6].map((n) => external_double({ n })));
       return all.reduce((sum, r) => sum + r.value, 0);`
    );
    expect(outcome).toMatchObject({ result: 42, success: true });
    expect(seen.calls).toBe(6);
  });

  it("gives the program no process, network, modules or timers", async () => {
    const outcome = await codeMode(doubler().tools)(
      "return [typeof process, typeof fetch, typeof require, typeof setTimeout];"
    );
    expect(outcome.result).toEqual([
      "undefined",
      "undefined",
      "undefined",
      "undefined",
    ]);
  });

  it("caps the calls of one program", async () => {
    const outcome = await codeMode(doubler().tools, { maxCalls: 4 })(TEN_CALLS);
    expect(outcome.result).toBe(4);
  });

  it("caps the calls of all programs in one run, not across runs", async () => {
    const { tools } = doubler();
    const run = codeMode(tools, { runCalls: 13 });
    const [first, second] = await engentyToolsRunAls.run({}, async () => [
      await run(TEN_CALLS),
      await run(TEN_CALLS),
    ]);
    expect(first?.result).toBe(10);
    expect(second?.result).toBe(3);
    const nextRun = await engentyToolsRunAls.run({}, () => run(TEN_CALLS));
    expect(nextRun.result).toBe(10);
  });

  it("runs at most maxParallel calls at once", async () => {
    const { seen, tools } = doubler();
    await codeMode(tools, { maxParallel: 3 })(
      "await Promise.all(Array.from({ length: 12 }, (_, n) => external_double({ n }))); return 1;"
    );
    expect(seen.most).toBe(3);
    expect(seen.calls).toBe(12);
  });

  it("ends an endless loop at the timeout", async () => {
    const outcome = await codeMode(doubler().tools, { timeoutMs: 300 })(
      "while (true) {}"
    );
    expect(outcome.success).toBe(false);
  });

  it("keeps an oversized tool answer out of the program", async () => {
    const big = createTool({
      id: "big",
      description: "Answers a lot.",
      execute: async () => ({ text: "x".repeat(5000) }),
    });
    const outcome = await codeMode({ big } as ToolsInput, {
      answerChars: 1000,
    })(
      `try { await external_big({}); return "entered"; } catch { return "refused"; }`
    );
    expect(outcome.result).toBe("refused");
  });

  it("caps the value a program returns to the conversation", async () => {
    const outcome = await codeMode(doubler().tools)(
      'return "x".repeat(50_000);'
    );
    expect(outcome.success).toBe(true);
    expect(outcome.notice).toBeTruthy();
    expect(JSON.stringify(outcome.result).length).toBeLessThan(20_000);
  });

  it("refuses a gated write without a grant, inside the program", async () => {
    vi.stubEnv("ENGENTY_CORE_BASE_URL", "https://api.engenty.localhost");
    const invoked: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string | URL) => {
        if (String(url).includes("/invoke")) {
          invoked.push(String(url));
          return Response.json({ data: { done: true }, ok: true });
        }
        return Response.json({
          data: {
            auth: { requiresApproval: true, riskLevel: "medium" },
            description: "Delete a project",
            moduleId: "projects",
            operationId: "projects_delete",
            pluginId: "projects",
            readOnly: false,
            summary: "Delete a project",
            toolId: "projects_delete",
          },
          ok: true,
        });
      })
    );
    const outcome = await engentyToolsRunAls.run(
      { accessToken: "user-token" },
      () =>
        codeMode()(
          `return await external_engenty_tool_execute({ id: "projects_delete", input: { id: "p1" } });`
        )
    );
    expect(outcome).toMatchObject({
      result: { error: "approval_required", ok: false },
      success: true,
    });
    expect(invoked).toEqual([]);
  });
});
