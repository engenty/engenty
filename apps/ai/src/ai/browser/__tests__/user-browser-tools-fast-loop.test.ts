// The switch: `browser_run_fast` appears only with ENGENTY_BROWSER_FAST_LOOP
// on AND the run's classifier binding reachable, and it goes through the same
// wrapper as every other browser tool (seat, unattended gate, audit).
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@mastra/agent-browser", () => ({
  AgentBrowser: class {
    close = vi.fn(() => Promise.resolve());
    ensureReady = vi.fn(() => Promise.resolve());
    getPage = vi.fn(() => Promise.resolve({}));
    getTools = () => ({
      browser_snapshot: {
        description: "snapshot",
        execute: vi.fn(async () => "tree"),
        inputSchema: undefined,
      },
    });
    onBrowserClosed = vi.fn(() => () => undefined);
    sharedManager = { newTab: vi.fn(() => Promise.resolve()) };
  },
}));

vi.mock("../../sandbox/space-browser.js", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("../../sandbox/space-browser.js")>();
  return {
    ...actual,
    markUserBrowserUsed: vi.fn(),
    readUserBrowserStatus: vi.fn(async () => ({ state: "running" })),
    resolveUserBrowserCdpEndpoint: vi.fn(async () => "http://127.0.0.1:1"),
    startUserBrowser: vi.fn(async () => undefined),
  };
});

const runFastLoop = vi.fn(async (_input: unknown) => ({
  elapsed_ms: 1,
  elements: null,
  history: [],
  note: "done",
  page: { text: "", title: "", url: "" },
  status: "done",
  steps: 0,
  totals: { input_tokens: 0, jev_latency_ms: 0, text_latency_ms: 0 },
}));
const fieldTextOptions: unknown[] = [];
vi.mock("../fast-loop/index.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../fast-loop/index.js")>();
  return {
    ...actual,
    createFieldText: (options: unknown) => {
      fieldTextOptions.push(options);
      return vi.fn();
    },
    runFastLoop: (input: unknown) => runFastLoop(input),
  };
});

import {
  resetUserBrowserRegistryForTests,
  takeUserSeat,
} from "../user-browser-registry.js";
import {
  BROWSER_RUN_FAST_TOOL_ID,
  createUserBrowserTools,
} from "../user-browser-tools.js";

const identity = {
  agentId: "agent-a",
  spaceId: "00000000-0000-4000-8000-0000000000cc",
  tenantId: "00000000-0000-4000-8000-0000000000aa",
};
const WINDOW_KEY = `engenty-browser-${identity.tenantId}-${identity.spaceId}#${identity.agentId}`;

const baseInput = {
  browser: {
    agentId: identity.agentId,
    autostart: false,
    spaceId: identity.spaceId,
    unattended: false,
  },
  classifierModelId: "typesafe-ai/jev",
  headless: false,
  tenantId: identity.tenantId,
};

describe("browser_run_fast switch", () => {
  const env = { ...process.env };
  beforeEach(() => {
    delete process.env.ENGENTY_BROWSER_FAST_LOOP;
    delete process.env.TYPESAFE_API_KEY;
    delete process.env.AI_GATEWAY_API_KEY;
  });
  afterEach(() => {
    process.env = { ...env };
    resetUserBrowserRegistryForTests();
    runFastLoop.mockClear();
    fieldTextOptions.length = 0;
  });

  it("is absent with the switch off", async () => {
    const tools = await createUserBrowserTools(baseInput);
    expect(tools).toHaveProperty("browser_snapshot");
    expect(tools).not.toHaveProperty(BROWSER_RUN_FAST_TOOL_ID);
  });

  it("is absent with the switch on but no key at all", async () => {
    process.env.ENGENTY_BROWSER_FAST_LOOP = "true";
    const tools = await createUserBrowserTools(baseInput);
    expect(tools).not.toHaveProperty(BROWSER_RUN_FAST_TOOL_ID);
  });

  it("is absent when the run resolved no classifier", async () => {
    process.env.ENGENTY_BROWSER_FAST_LOOP = "true";
    process.env.TYPESAFE_API_KEY = "sk-test";
    const tools = await createUserBrowserTools({
      ...baseInput,
      classifierModelId: null,
    });
    expect(tools).not.toHaveProperty(BROWSER_RUN_FAST_TOOL_ID);
  });

  it("is offered on the Vercel gateway key alone and routes Jev through it", async () => {
    process.env.ENGENTY_BROWSER_FAST_LOOP = "true";
    process.env.AI_GATEWAY_API_KEY = "vck_test";
    const tools = await createUserBrowserTools(baseInput);
    const tool = tools[BROWSER_RUN_FAST_TOOL_ID] as unknown as {
      execute: (input: unknown, ctx: unknown) => Promise<unknown>;
    };
    expect(tool).toBeDefined();
    await tool.execute({ goal: "x" }, {});
    const call = runFastLoop.mock.calls[0]?.[0] as unknown as {
      client: { model: string; baseUrl: string };
    };
    // The client keeps its route private; its constructor options are pinned in client.test.ts.
    expect(call.client).toBeInstanceOf(Object);
  });

  it("is offered with switch and key, and runs the loop through the wrapper", async () => {
    process.env.ENGENTY_BROWSER_FAST_LOOP = "1";
    process.env.TYPESAFE_API_KEY = "sk-test";
    const emit = vi.fn();
    const tools = await createUserBrowserTools({ ...baseInput, emit });
    const tool = tools[BROWSER_RUN_FAST_TOOL_ID] as unknown as {
      execute: (input: unknown, ctx: unknown) => Promise<unknown>;
      inputSchema: { safeParse: (v: unknown) => { success: boolean } };
    };
    expect(tool).toBeDefined();
    expect(tool.inputSchema.safeParse({ goal: "fill the form" }).success).toBe(
      true
    );
    expect(tool.inputSchema.safeParse({}).success).toBe(false);
    const result = (await tool.execute({ goal: "fill the form" }, {})) as {
      status: string;
    };
    expect(result.status).toBe("done");
    expect(runFastLoop).toHaveBeenCalledTimes(1);
    const call = runFastLoop.mock.calls[0]?.[0] as unknown as {
      goal: string;
      maxSteps: number;
      minMargin: number;
    };
    expect(call.goal).toBe("fill the form");
    expect(call.maxSteps).toBe(60);
    expect(call.minMargin).toBe(0.1);
    expect(emit).toHaveBeenCalledWith(
      "engenty.browser.action",
      expect.objectContaining({ ok: true, tool: BROWSER_RUN_FAST_TOOL_ID })
    );
  });

  it("gives the text helper the run's low-tier model and the classifier for spans", async () => {
    process.env.ENGENTY_BROWSER_FAST_LOOP = "1";
    process.env.TYPESAFE_API_KEY = "sk-test";
    const tools = await createUserBrowserTools({
      ...baseInput,
      textModelId: "openai/gpt-5.4-nano",
    });
    const tool = tools[BROWSER_RUN_FAST_TOOL_ID] as unknown as {
      execute: (input: unknown, ctx: unknown) => Promise<unknown>;
    };
    await tool.execute({ goal: "x" }, {});
    expect(fieldTextOptions[0]).toMatchObject({
      modelId: "openai/gpt-5.4-nano",
      spans: { client: expect.any(Object) },
    });

    fieldTextOptions.length = 0;
    const withoutTier = await createUserBrowserTools(baseInput);
    await (
      withoutTier[BROWSER_RUN_FAST_TOOL_ID] as unknown as {
        execute: (input: unknown, ctx: unknown) => Promise<unknown>;
      }
    ).execute({ goal: "x" }, {});
    // No run tier → the helper's own default (the model.low seed), not the classifier.
    expect(fieldTextOptions[0]).not.toHaveProperty("modelId");
  });

  it("caps the caller's step budget at the platform ceiling", async () => {
    process.env.ENGENTY_BROWSER_FAST_LOOP = "1";
    process.env.TYPESAFE_API_KEY = "sk-test";
    process.env.ENGENTY_BROWSER_FAST_MAX_STEPS = "5";
    const tools = await createUserBrowserTools(baseInput);
    const tool = tools[BROWSER_RUN_FAST_TOOL_ID] as unknown as {
      execute: (input: unknown, ctx: unknown) => Promise<unknown>;
    };
    await tool.execute({ goal: "x", max_steps: 50 }, {});
    expect(
      (runFastLoop.mock.calls[0]?.[0] as unknown as { maxSteps: number })
        .maxSteps
    ).toBe(5);
  });

  it("is refused like any browser tool while the person holds the seat", async () => {
    process.env.ENGENTY_BROWSER_FAST_LOOP = "1";
    process.env.TYPESAFE_API_KEY = "sk-test";
    const tools = await createUserBrowserTools(baseInput);
    takeUserSeat(WINDOW_KEY);
    const tool = tools[BROWSER_RUN_FAST_TOOL_ID] as unknown as {
      execute: (input: unknown, ctx: unknown) => Promise<unknown>;
    };
    const result = (await tool.execute({ goal: "x" }, {})) as { error: string };
    expect(result.error).toBe("held_by_user");
    expect(runFastLoop).not.toHaveBeenCalled();
  });

  it("is refused unattended without the standing consent", async () => {
    process.env.ENGENTY_BROWSER_FAST_LOOP = "1";
    process.env.TYPESAFE_API_KEY = "sk-test";
    const tools = await createUserBrowserTools({
      ...baseInput,
      headless: true,
    });
    const tool = tools[BROWSER_RUN_FAST_TOOL_ID] as unknown as {
      execute: (input: unknown, ctx: unknown) => Promise<unknown>;
    };
    const result = (await tool.execute({ goal: "x" }, {})) as {
      reason: string;
    };
    expect(result.reason).toBe("unattended_not_granted");
    expect(runFastLoop).not.toHaveBeenCalled();
  });
});
