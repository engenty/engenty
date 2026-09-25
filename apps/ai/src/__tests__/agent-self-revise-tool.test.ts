import { describe, expect, it } from "vitest";
import {
  AGENT_SELF_REVISE_TOOL_ID,
  agentSelfReviseTool,
} from "../../ai/tools/agent-self-revise-tool.js";
import { engentyToolsRunAls } from "../../ai/tools/engenty-tools/lib/run-context.js";
import { testToolContext } from "./helpers/tool-context.js";

const AGENT_ID = "lernen.deutsch-grammatik";
const NEW_INSTRUCTIONS =
  "Du bist ein Deutsch-Übungsassistent. Nenne die Zeitform nie vor der Antwort des Users.";

/** The row the registry hands back — richer than what the tool writes. */
function storedAgent(overrides: Record<string, unknown> = {}) {
  return {
    id: AGENT_ID,
    agentScope: "shared",
    description: "Grammatik-Drill",
    engenty: "sprout",
    instructions: "Alte Anweisungen, mindestens vierzig Zeichen lang.",
    kind: "specialist",
    model: "openai/gpt-5",
    name: "Deutsch Grammatik",
    skillIds: ["space-data"],
    source: "database",
    starters: [{ id: "s1", label: "Los geht's" }],
    toolIds: ["engenty_tool_execute", "show_ui"],
    workspace: { sandbox: { enabled: true } },
    ...overrides,
  };
}

function runTool(input: {
  agent?: Record<string, unknown> | null;
  calls: { body?: unknown; path: string }[];
  resume?: Record<string, unknown>;
}) {
  const fetchImpl = (async (url: string, init?: RequestInit) => {
    const path = new URL(url).pathname;
    input.calls.push({
      path,
      ...(init?.body ? { body: JSON.parse(String(init.body)) } : {}),
    });
    if (path.endsWith(`/${encodeURIComponent(AGENT_ID)}`)) {
      return input.agent
        ? Response.json({ agent: input.agent })
        : new Response("{}", { status: 404 });
    }
    if (path.endsWith("/propose")) {
      return Response.json({
        record: { proposed_config: {}, status: "active" },
      });
    }
    return Response.json({ agent: { id: AGENT_ID } });
  }) as unknown as typeof fetch;

  return engentyToolsRunAls.run(
    {
      accessToken: "token-self-revise",
      agentId: "00000000-0000-4000-8000-0000000000aa",
      agentTypeKey: AGENT_ID,
      coreBaseUrl: "http://core.local",
      fetchImpl,
      orchestratorThreadId: "thread-1",
    },
    () =>
      agentSelfReviseTool.execute?.(
        {
          instructions: NEW_INSTRUCTIONS,
          summary: "Zeitform nicht vorwegnehmen",
        },
        {
          ...(testToolContext() as Record<string, unknown>),
          ...(input.resume ? { agent: { resumeData: input.resume } } : {}),
        } as never
      ) as Promise<Record<string, unknown>>
  );
}

describe(AGENT_SELF_REVISE_TOOL_ID, () => {
  it("proposes the WHOLE current config with only the instructions changed", async () => {
    const calls: { body?: unknown; path: string }[] = [];
    const output = await runTool({ agent: storedAgent(), calls });

    expect(output.status).toBe("proposed");
    const propose = calls.find((call) => call.path.endsWith("/propose"));
    const body = propose?.body as Record<string, unknown>;
    expect(body.id).toBe(AGENT_ID);
    expect(body.instructions).toBe(NEW_INSTRUCTIONS);
    expect(body.proposed_by_agent).toBe(AGENT_ID);
    // Everything a partial body would have wiped on approve.
    expect(body.starters).toEqual([{ id: "s1", label: "Los geht's" }]);
    expect(body.skillIds).toEqual(["space-data"]);
    expect(body.toolIds).toEqual(["engenty_tool_execute", "show_ui"]);
    expect(body.workspace).toEqual({ sandbox: { enabled: true } });
    expect(body.model).toBe("openai/gpt-5");
  });

  it("refuses an agent whose instructions ship with a module", async () => {
    const calls: { body?: unknown; path: string }[] = [];
    const output = await runTool({
      agent: storedAgent({ source: "module" }),
      calls,
    });

    expect(output.ok).toBe(false);
    expect(output.code).toBe("not_revisable");
    expect(calls.some((call) => call.path.endsWith("/propose"))).toBe(false);
  });

  it("applies the pending revision only when the human approves", async () => {
    const calls: { body?: unknown; path: string }[] = [];
    const approved = await runTool({
      agent: storedAgent(),
      calls,
      resume: { choice_id: "approve" },
    });
    expect(approved.status).toBe("active");
    expect(calls.at(-1)?.path).toContain("/approve");

    const afterDismiss: { body?: unknown; path: string }[] = [];
    const dismissed = await runTool({
      agent: storedAgent(),
      calls: afterDismiss,
      resume: { cancelled: true },
    });
    expect(dismissed.status).toBe("proposed");
    expect(afterDismiss).toHaveLength(0);
  });
});
