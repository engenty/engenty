import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Importing ../action-job-steps.js pulls in the heavy Mastra module graph (warm
// ~1.6s, but transform-bound and able to balloon past the runner's default on a
// loaded CI box). Pin a generous per-file timeout so the first dynamic import
// doesn't surface as "Test timed out", regardless of which vitest config runs it.
vi.setConfig({ testTimeout: 30_000, hookTimeout: 30_000 });

// These steps are pure unit tests: the resume branch returns before any agent runs,
// and the apply step is mocked below. Nothing here should ever touch the network, so
// fail loudly on any outbound fetch (e.g. a signed file URL) instead of letting it
// hit real DNS and flake on the network round-trip.
const realFetch = globalThis.fetch;
beforeEach(() => {
  // Reject (don't throw synchronously) so this behaves like a real fetch failure
  // for both `await fetch(...)` and `fetch(...).catch(...)` call sites.
  vi.stubGlobal("fetch", (input: unknown) =>
    Promise.reject(
      new Error(
        `Unexpected network fetch in action-job-steps test: ${String(
          input instanceof Request ? input.url : input
        )}`
      )
    )
  );
});
afterEach(() => {
  vi.stubGlobal("fetch", realFetch);
});

// The apply step writes through this — mock it to assert the patch + isolate the
// step logic from the core gateway.
const applyApprovedFieldUpdates = vi.fn(async () => ({ applied: 1 }));
vi.mock("../apply-field-updates.js", () => ({
  applyApprovedFieldUpdates,
  moduleUpdateOperationForContextType: (t: string) =>
    t ? `${t.split(".")[0]}_update` : null,
}));
vi.mock("../task-job-scope.js", () => ({
  resolveTaskJobServiceScope: vi.fn(async () => ({
    tenantId: "t1",
    userId: "u1",
  })),
}));

const baseInput = {
  action_id: "contacts.enhance-contact",
  agent_id: "contacts.manager",
  brief: "do it",
  context_id: "c-1",
  context_type: "contacts.person",
  request_id: "00000000-0000-4000-8000-000000000001",
  tenant_id: "00000000-0000-4000-8000-000000000002",
  thread_id: "00000000-0000-4000-8000-000000000003",
};

describe("runActionSpecialistStep resume branch", () => {
  it("passes the approved patch downstream without re-running the agent", async () => {
    const { runActionSpecialistStep } = await import("../action-job-steps.js");
    const suspend = vi.fn();
    const out = await runActionSpecialistStep.execute({
      inputData: baseInput,
      resumeData: { approved: [{ field: "email", value: "a@b.co" }] },
      runId: baseInput.request_id,
      suspend,
    } as never);
    expect(suspend).not.toHaveBeenCalled();
    expect(out).toMatchObject({
      approved: [{ field: "email", value: "a@b.co" }],
      context_id: "c-1",
      context_type: "contacts.person",
      status: "completed",
    });
  });

  it("drops the patch when the user rejected", async () => {
    const { runActionSpecialistStep } = await import("../action-job-steps.js");
    const out = (await runActionSpecialistStep.execute({
      inputData: baseInput,
      resumeData: {
        approved: [{ field: "email", value: "a@b.co" }],
        rejected: true,
      },
      runId: baseInput.request_id,
      suspend: vi.fn(),
    } as never)) as { approved: unknown[]; status: string };
    expect(out.approved).toEqual([]);
    expect(out.status).toBe("completed");
  });
});

describe("applyApprovedUpdatesStep", () => {
  const out = (over: Record<string, unknown>) => ({
    approved: [],
    context_id: "c-1",
    context_type: "contacts.person",
    request_id: baseInput.request_id,
    status: "completed" as const,
    tenant_id: baseInput.tenant_id,
    ...over,
  });

  it("writes the approved fields as a patch via the generic apply", async () => {
    applyApprovedFieldUpdates.mockClear();
    const { applyApprovedUpdatesStep } = await import("../action-job-steps.js");
    const result = await applyApprovedUpdatesStep.execute({
      inputData: out({
        approved: [
          { field: "email", value: "a@b.co" },
          { field: "phone", value: null },
        ],
      }),
    } as never);
    expect(applyApprovedFieldUpdates).toHaveBeenCalledWith(
      expect.objectContaining({
        contextId: "c-1",
        contextType: "contacts.person",
        patch: { email: "a@b.co", phone: null },
      })
    );
    expect((result as { status: string }).status).toBe("completed");
  });

  it("no-ops when nothing was approved", async () => {
    applyApprovedFieldUpdates.mockClear();
    const { applyApprovedUpdatesStep } = await import("../action-job-steps.js");
    await applyApprovedUpdatesStep.execute({
      inputData: out({ approved: [] }),
    } as never);
    expect(applyApprovedFieldUpdates).not.toHaveBeenCalled();
  });

  it("no-ops when the run already failed", async () => {
    applyApprovedFieldUpdates.mockClear();
    const { applyApprovedUpdatesStep } = await import("../action-job-steps.js");
    await applyApprovedUpdatesStep.execute({
      inputData: out({
        approved: [{ field: "email", value: "x" }],
        status: "failed",
      }),
    } as never);
    expect(applyApprovedFieldUpdates).not.toHaveBeenCalled();
  });

  it("marks the run failed if the write throws", async () => {
    applyApprovedFieldUpdates.mockClear();
    applyApprovedFieldUpdates.mockRejectedValueOnce(new Error("boom"));
    const { applyApprovedUpdatesStep } = await import("../action-job-steps.js");
    const result = (await applyApprovedUpdatesStep.execute({
      inputData: out({ approved: [{ field: "email", value: "x" }] }),
    } as never)) as { reason?: string; status: string };
    expect(result.status).toBe("failed");
    expect(result.reason).toMatch(/boom/);
  });
});
