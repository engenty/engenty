import { describe, expect, it } from "vitest";
import { sanitizeSvgMarkup } from "../../ai/tools/agent-look-generate.js";
import {
  clearAgentLookPreviewsForTests,
  putAgentLookPreview,
} from "../../ai/tools/agent-look-preview.js";
import {
  AGENT_LOOK_TOOL_ID,
  createAgentLookTools,
} from "../../ai/tools/agent-look-tool.js";
import { engentyToolsRunAls } from "../../ai/tools/engenty-tools/lib/run-context.js";
import { testToolContext } from "./helpers/tool-context.js";

const AGENT_ID = "studio.looksmith";
const TENANT_ID = "00000000-0000-4000-8000-000000000001";
const TINY_PNG = Uint8Array.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
]);

function storedAgent(overrides: Record<string, unknown> = {}) {
  return {
    id: AGENT_ID,
    agentScope: "shared",
    description: "Helps Engenties find a face.",
    engenty: "sprout",
    instructions: "You are Looksmith. Talk first, then catalog, then wear.",
    kind: "specialist",
    model: "openai/gpt-5",
    name: "Looksmith",
    skillIds: ["space-data"],
    source: "database",
    toolIds: ["engenty_tool_execute", "agent_look"],
    ...overrides,
  };
}

function runTool(
  action: Record<string, unknown>,
  input: {
    agent: Record<string, unknown>;
    calls: { body?: unknown; path: string }[];
  }
) {
  const fetchImpl = (async (url: string, init?: RequestInit) => {
    const path = new URL(url).pathname;
    input.calls.push({
      path,
      ...(init?.body ? { body: JSON.parse(String(init.body)) } : {}),
    });
    if (path.endsWith(`/${encodeURIComponent(AGENT_ID)}`)) {
      return Response.json({ agent: input.agent });
    }
    if (path.endsWith("/propose")) {
      return Response.json({
        record: { proposed_config: {}, status: "active" },
      });
    }
    return Response.json({ agent: { id: AGENT_ID } });
  }) as unknown as typeof fetch;

  const tool = createAgentLookTools({
    generatePng: async () => ({
      bytes: TINY_PNG,
      format: "png",
      prompt: "test",
    }),
  })[AGENT_LOOK_TOOL_ID];

  return engentyToolsRunAls.run(
    {
      accessToken: "token-look",
      agentId: "00000000-0000-4000-8000-0000000000aa",
      agentTypeKey: AGENT_ID,
      coreBaseUrl: "http://core.local",
      fetchImpl,
      orchestratorThreadId: "thread-1",
      tenantId: TENANT_ID,
    },
    () =>
      tool.execute?.(action as never, testToolContext() as never) as Promise<
        Record<string, unknown>
      >
  );
}

describe(AGENT_LOOK_TOOL_ID, () => {
  it("stores a generated preview without sending the image to the model", async () => {
    const output = await runTool(
      { action: "generate", brief: "a little more mischievous", format: "png" },
      { agent: storedAgent(), calls: [] }
    );
    expect(output.ok).toBe(true);
    const stripped = createAgentLookTools()[AGENT_LOOK_TOOL_ID].toModelOutput?.(
      output
    ) as { value?: string } | undefined;
    expect(stripped?.value).not.toContain("data:image");
    expect(stripped?.value).toContain("preview_id");
  });

  it("proposes the whole config when wearing a blob", async () => {
    // Approving a partial body would wipe every field it left out.
    const calls: { body?: unknown; path: string }[] = [];
    const output = await runTool(
      {
        action: "wear",
        engenty: "sprout",
        name: "Looksmith",
        description: "Helps Engenties find a face that fits the job.",
        summary: "Wear sprout and keep the name",
      },
      { agent: storedAgent(), calls }
    );
    expect(output.status).toBe("proposed");
    const propose = calls.find((call) => call.path.endsWith("/propose"));
    const body = propose?.body as Record<string, unknown>;
    expect(body.engenty).toBe("sprout");
    expect(body.name).toBe("Looksmith");
    expect(body.avatarUrl).toBeNull();
    expect(body.toolIds).toEqual(["engenty_tool_execute", "agent_look"]);
  });

  it("refuses a module-shipped face", async () => {
    const calls: { body?: unknown; path: string }[] = [];
    const output = await runTool(
      { action: "wear", engenty: "round", summary: "try round" },
      { agent: storedAgent({ source: "module" }), calls }
    );
    expect(output.ok).toBe(false);
    expect(output.code).toBe("not_revisable");
    expect(calls.some((call) => call.path.endsWith("/propose"))).toBe(false);
  });

  it("refuses to wear a preview generated for another agent", async () => {
    clearAgentLookPreviewsForTests();
    const previewId = putAgentLookPreview({
      agentId: "studio.other",
      bytes: TINY_PNG,
      contentType: "image/png",
      createdAt: Date.now(),
      format: "png",
      tenantId: TENANT_ID,
    });
    const calls: { body?: unknown; path: string }[] = [];
    const output = await runTool(
      { action: "wear", preview_id: previewId, summary: "Wear it" },
      { agent: storedAgent(), calls }
    );
    expect(output.code).toBe("preview_missing");
    expect(calls.some((call) => call.path.endsWith("/propose"))).toBe(false);
  });
});

describe("sanitizeSvgMarkup", () => {
  it("keeps a plain blob svg and rejects script", () => {
    const ok =
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120"></svg>';
    expect(sanitizeSvgMarkup(ok)).toBe(ok);
    expect(
      sanitizeSvgMarkup(
        '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>'
      )
    ).toBeNull();
  });
});
