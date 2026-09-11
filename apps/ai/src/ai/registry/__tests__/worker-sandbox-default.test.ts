import {
  agentConfigSchema,
  applyWorkerSandboxDefault,
  WORKER_SANDBOX_DEFAULT,
} from "@engenty/ai-core";
import { describe, expect, it } from "vitest";

import { CompositeAiRegistry } from "../composite-ai-registry.js";
import type { AgentConfig, AiRegistryProvider } from "../types.js";

// Input shape (pre-parse): declarations write partial workspaces; the schema
// fills the defaults, exactly as agent.json does.
function config(
  overrides: Record<string, unknown> & { id: string }
): AgentConfig {
  return agentConfigSchema.parse({
    instructions: "do the work",
    model: "openai/gpt-4.1-mini",
    name: overrides.id,
    ...overrides,
  });
}

describe("applyWorkerSandboxDefault", () => {
  it("gives a declared workspace with no sandbox the Worker default", () => {
    // The module-specialist shape: `{preset:"staff"}` and nothing about
    // execution. This is the accident P1 removes — the DB lane always had
    // this default, the code lane never did.
    const specialist = config({
      id: "inbox.assist",
      workspace: { preset: "staff" },
    });
    const resolved = applyWorkerSandboxDefault(specialist);
    expect(resolved.workspace?.sandbox).toEqual(WORKER_SANDBOX_DEFAULT);
    // Everything else rides through untouched.
    expect(resolved.workspace?.preset).toBe("staff");
  });

  it("never touches a declared sandbox — in either direction", () => {
    const optedOut = config({
      id: "engenty.coordinator",
      workspace: { preset: "staff", sandbox: { enabled: false } },
    });
    expect(applyWorkerSandboxDefault(optedOut)).toBe(optedOut);

    const cli = config({
      id: "engenty.cli",
      workspace: {
        preset: "code_execution",
        sandbox: { enabled: true, lifecycle: "session", network: "egress" },
      },
    });
    expect(applyWorkerSandboxDefault(cli)).toBe(cli);
  });

  it("leaves agents without a declaration exactly as they are", () => {
    // File Analyst / App Coder: no workspace at all. No declaration, no
    // default — headless staff fallback stays execution-free.
    const undeclared = config({ id: "engenty.file-analyst" });
    expect(applyWorkerSandboxDefault(undeclared)).toBe(undeclared);

    const disabled = config({
      id: "knowledge-base.answers",
      workspace: { enabled: false },
    });
    expect(applyWorkerSandboxDefault(disabled)).toBe(disabled);
  });
});

describe("CompositeAiRegistry — the read seam applies the default", () => {
  const specialist = config({
    id: "tasks.assist",
    workspace: { preset: "staff" },
  });
  const provider: AiRegistryProvider & {
    listAgentConfigs: () => Promise<AgentConfig[]>;
  } = {
    getAgentConfig: (id: string) =>
      Promise.resolve(id === specialist.id ? specialist : undefined),
    getTool: () => Promise.resolve(undefined),
    listAgentConfigs: () => Promise.resolve([specialist]),
    providerId: "test",
  };

  it("normalizes getAgentConfig and listAgentConfigs identically", async () => {
    const registry = new CompositeAiRegistry([provider]);
    const one = await registry.getAgentConfig("tasks.assist");
    const listed = (await registry.listAgentConfigs())[0];
    expect(one?.workspace?.sandbox).toEqual(WORKER_SANDBOX_DEFAULT);
    expect(listed.workspace?.sandbox).toEqual(WORKER_SANDBOX_DEFAULT);
  });
});
