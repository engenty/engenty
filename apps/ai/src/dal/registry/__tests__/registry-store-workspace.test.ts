/**
 * What a REGISTERED specialist's workspace declaration is.
 *
 * There is no workspace column on `ai.engenty_ai_agents`, so this default is
 * the only thing standing between an agent created through `agent_propose` and
 * having no files or no computer at all. It is asserted here because it is a
 * capability decision, not a mapping detail: dropping the sandbox from it once
 * meant no specialist could run a line of code, in chat or in a routine.
 */
import type { AgentConfig } from "@engenty/ai-core";
import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";
import {
  createRegistryStore,
  type RegistryAgentRow,
} from "../registry-store.js";

const TENANT_ID = "00000000-0000-4000-8000-000000000001";

function storeReturning(
  scope: "personal" | "shared",
  sandbox?: Record<string, unknown> | null
): SupabaseClient {
  const row: RegistryAgentRow = {
    agent_id: "contacts.daily-summary",
    agent_scope: scope,
    created_at: "2026-08-28T00:00:00.000Z",
    description: null,
    guardrails: null,
    id: "row-1",
    instructions: "",
    model: "openai/gpt-5-mini",
    name: "Daily Contact Summarizer",
    sandbox: sandbox ?? null,
    skill_ids: [],
    sub_agents: [],
    tenant_id: TENANT_ID,
    tool_ids: [],
    updated_at: "2026-08-28T00:00:00.000Z",
  } as RegistryAgentRow;

  const chain = {
    eq: () => chain,
    maybeSingle: async () => ({ data: row, error: null }),
  };
  return {
    schema: () => ({ from: () => ({ select: () => chain }) }),
  } as unknown as SupabaseClient;
}

async function workspaceFor(
  scope: "personal" | "shared",
  sandbox?: Record<string, unknown> | null
): Promise<NonNullable<AgentConfig["workspace"]>> {
  const config = await createRegistryStore(
    storeReturning(scope, sandbox)
  ).getAgentConfig(TENANT_ID, "contacts.daily-summary");
  const workspace = config?.workspace;
  if (!workspace) {
    throw new Error("registered agent resolved without a workspace");
  }
  return workspace;
}

describe("a registered specialist's workspace", () => {
  it("gives a shared agent the staff desk and a personal one the assistant desk", async () => {
    expect(await workspaceFor("shared")).toMatchObject({
      enabled: true,
      preset: "staff",
    });
    expect(await workspaceFor("personal")).toMatchObject({
      enabled: true,
      preset: "assistant",
    });
  });

  it("gives it a computer, gated and off the network", async () => {
    // Lazy: the container is created on the first `execute_command`, so an
    // agent that never runs one never costs anything. Gated and network-less
    // by default — a routine that needs either says so with a standing grant.
    for (const scope of ["shared", "personal"] as const) {
      expect(await workspaceFor(scope)).toMatchObject({
        sandbox: {
          enabled: true,
          lifecycle: "run",
          network: "none",
          requireApproval: true,
        },
      });
    }
  });

  it("lets a row declare the network tier it needs", async () => {
    // The gap this column exists for: a specialist that installs a package or
    // calls an API had no way to ask for the wire, because there was no
    // declaration surface at all for a registered agent.
    const workspace = await workspaceFor("shared", {
      enabled: true,
      lifecycle: "run",
      network: "egress",
    });
    expect(workspace.sandbox).toMatchObject({
      enabled: true,
      network: "egress",
    });
  });

  it("keeps the default for anything the row does not mention", async () => {
    const workspace = await workspaceFor("shared", { network: "egress" });
    expect(workspace.sandbox).toMatchObject({
      lifecycle: "run",
      mountPath: "/sandbox",
      network: "egress",
    });
  });

  it("refuses to let a row turn its own approval gate off", async () => {
    // An agent describes itself through `agent_propose`. If that description
    // could clear `requireApproval`, asking for unattended command execution
    // would be a matter of writing it down. Unattended execution is a grant
    // against a routine, decided per job by a person.
    const workspace = await workspaceFor("shared", {
      enabled: true,
      requireApproval: false,
    });
    expect(workspace.sandbox?.requireApproval).toBe(true);
  });

  it("falls back to the default when the row holds nonsense", async () => {
    const workspace = await workspaceFor("shared", {
      network: "carrier-pigeon",
    });
    expect(workspace.sandbox).toMatchObject({
      enabled: true,
      network: "none",
      requireApproval: true,
    });
  });
});
