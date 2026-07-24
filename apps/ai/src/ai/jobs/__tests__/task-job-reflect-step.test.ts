// Reflect step contract: env-gated off by default, pass-through on skip,
// fail-open when the delegated run cannot even be constructed, and a
// save-averse reflection prompt.

import { afterEach, describe, expect, it, vi } from "vitest";
import {
  buildReflectionPrompt,
  isMemoryReflectionEnabled,
  reflectStep,
  runReflectStep,
} from "../task-job-reflect-step.js";

const envelope = {
  agent_type_key: "contacts.manager",
  brief: "# Task T-1: Do the thing",
  result_text: "Done.",
  status: "ran" as const,
  task_id: "11111111-1111-4111-8111-111111111111",
  tenant_id: "22222222-2222-4222-8222-222222222222",
};

afterEach(() => {
  delete process.env.ENGENTY_AI_MEMORY_REFLECTION;
});

describe("reflect step", () => {
  it("is disabled unless ENGENTY_AI_MEMORY_REFLECTION=true", () => {
    expect(isMemoryReflectionEnabled()).toBe(false);
    process.env.ENGENTY_AI_MEMORY_REFLECTION = "false";
    expect(isMemoryReflectionEnabled()).toBe(false);
    process.env.ENGENTY_AI_MEMORY_REFLECTION = "true";
    expect(isMemoryReflectionEnabled()).toBe(true);
  });

  it("passes the envelope through untouched when disabled", async () => {
    const result = await reflectStep.execute({
      inputData: envelope,
      runId: "run-1",
    } as never);
    expect(result).toEqual(envelope);
  });

  it("passes through skipped envelopes without reflecting", async () => {
    process.env.ENGENTY_AI_MEMORY_REFLECTION = "true";
    const skipped = { ...envelope, status: "skipped" as const };
    const result = await reflectStep.execute({
      inputData: skipped,
      runId: "run-1",
    } as never);
    expect(result).toEqual(skipped);
  });

  it("fails open when the runtime is not configured", async () => {
    process.env.ENGENTY_AI_MEMORY_REFLECTION = "true";
    // No agent-session store / core env in the test process: the step must
    // swallow the setup failure and return the envelope unchanged.
    const result = await reflectStep.execute({
      inputData: envelope,
      runId: "run-1",
    } as never);
    expect(result).toEqual(envelope);
  });
});

describe("runReflectStep — delegated reflection run (B: wiring)", () => {
  /** Injectable deps that make a reflection run succeed without any runtime. */
  function fakeDeps(overrides: Record<string, unknown> = {}) {
    return {
      isEnabled: () => true,
      createStore: () => ({}) as never,
      resolveScope: vi.fn(
        async () => ({ tenantId: envelope.tenant_id }) as never
      ),
      createRegistry: vi.fn(() => ({}) as never),
      runConversation: vi.fn(async () => ({}) as never),
      ...overrides,
    };
  }

  it("delegates a run with ONLY the memory tools, deny policy, and the task's agent", async () => {
    const deps = fakeDeps();
    const result = await runReflectStep(envelope, "run-9", deps);

    // Envelope always passes through untouched (learning is a side effect).
    expect(result).toEqual(envelope);
    expect(deps.runConversation).toHaveBeenCalledTimes(1);

    const call = (deps.runConversation as ReturnType<typeof vi.fn>).mock
      .calls[0][0];
    expect(call.allowedToolIds).toEqual([
      "memory_save",
      "memory_record_search",
    ]);
    expect(call.approvalPolicy).toBe("deny");
    expect(call.childAgentId).toBe(envelope.agent_type_key);
    // Reflection is attributed to the task's run id, in its own thread.
    expect(call.childRunId).toBe("run-9");
    expect(call.childThreadId).not.toBe("run-9");
    expect(call.brief).toContain("worth remembering");
    expect(deps.createRegistry).toHaveBeenCalledWith(envelope.tenant_id);
  });

  it("does not delegate when disabled or the envelope is skipped", async () => {
    const disabled = fakeDeps({ isEnabled: () => false });
    await runReflectStep(envelope, "run-9", disabled);
    expect(disabled.runConversation).not.toHaveBeenCalled();

    const skipped = fakeDeps();
    await runReflectStep(
      { ...envelope, status: "skipped" as const },
      "run-9",
      skipped
    );
    expect(skipped.runConversation).not.toHaveBeenCalled();
  });

  it("does not delegate when no session store is configured", async () => {
    const noStore = fakeDeps({ createStore: () => null });
    await runReflectStep(envelope, "run-9", noStore);
    expect(noStore.runConversation).not.toHaveBeenCalled();
  });

  it("stays fail-open when the delegated run throws", async () => {
    const throwing = fakeDeps({
      runConversation: vi.fn(async () => {
        throw new Error("model unavailable");
      }),
    });
    const result = await runReflectStep(envelope, "run-9", throwing);
    expect(result).toEqual(envelope);
  });
});

describe("buildReflectionPrompt", () => {
  it("carries brief + outcome and biases against saving", () => {
    const prompt = buildReflectionPrompt(envelope);
    expect(prompt).toContain("outcome: completed");
    expect(prompt).toContain("Do the thing");
    expect(prompt).toContain("NOTHING");
    expect(prompt).toContain("source_kind 'reflection'");
  });

  it("marks failed runs as FAILED", () => {
    const prompt = buildReflectionPrompt({ ...envelope, status: "failed" });
    expect(prompt).toContain("outcome: FAILED");
  });

  it("truncates oversized briefs", () => {
    const prompt = buildReflectionPrompt({
      ...envelope,
      brief: "y".repeat(10_000),
      result_text: "z".repeat(10_000),
    });
    expect(prompt.length).toBeLessThan(5000);
  });

  it("includes routine entity scope when trigger_id is set", () => {
    const prompt = buildReflectionPrompt({
      ...envelope,
      trigger_id: "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee",
    });
    expect(prompt).toContain(
      "scope_ref 'tasks.routine:aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee'"
    );
  });

  it("omits routine scope line without trigger_id", () => {
    const prompt = buildReflectionPrompt(envelope);
    expect(prompt).not.toContain("tasks.routine:");
  });
});

describe("runReflectStep — quiet disposition", () => {
  it("skips reflection for quiet routine runs", async () => {
    const deps = {
      isEnabled: () => true,
      createStore: () => ({}) as never,
      resolveScope: vi.fn(async () => ({}) as never),
      createRegistry: vi.fn(() => ({}) as never),
      runConversation: vi.fn(async () => ({}) as never),
    };
    await runReflectStep(
      {
        ...envelope,
        run_disposition: "quiet",
        trigger_id: "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee",
      },
      "run-9",
      deps
    );
    expect(deps.runConversation).not.toHaveBeenCalled();
  });
});
