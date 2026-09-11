// Regression for the 2026-08-22 double-execution on goal 01a02926: approving a
// parked `tasks_create` ran it twice — once un-attributed, once by the resumed
// model re-issuing it. The approved call must execute exactly once, and the
// resumed model turn must be handed the result instead of the bare brief.
import { afterEach, describe, expect, it, vi } from "vitest";
import { executeEngentyTool } from "../../../../ai/tools/engenty-tools/index.js";
import { engentyToolsRunAls } from "../../../../ai/tools/engenty-tools/lib/run-context.js";
import { replayApprovedCalls } from "../replay-approved-calls.js";

describe("replayApprovedCalls", () => {
  it("executes each recorded call exactly once and briefs the result", async () => {
    const execute = vi.fn(async () => ({
      data: { id: "t-1", identifier: "ENG-22" },
      ok: true,
    }));

    const outcome = await replayApprovedCalls(
      [
        {
          input: { title: "Glossar erstellen" },
          operation_id: "tasks_create",
          title: "Create task",
        },
      ],
      { execute }
    );

    expect(execute).toHaveBeenCalledTimes(1);
    expect(execute).toHaveBeenCalledWith("tasks_create", {
      title: "Glossar erstellen",
    });
    expect(outcome.replayed).toHaveLength(1);
    // The brief section is the contract with the model: it must carry the
    // result and forbid re-running the call.
    expect(outcome.briefSection).toContain("ENG-22");
    expect(outcome.briefSection).toContain("tasks_create");
    expect(outcome.briefSection).toContain("Do NOT run these calls again");
  });

  it("skips calls with no recorded input (pre-change parks, bulk cards)", async () => {
    const execute = vi.fn(async () => ({ ok: true }));

    const outcome = await replayApprovedCalls(
      [{ operation_id: "tasks_create" }],
      { execute }
    );

    expect(execute).not.toHaveBeenCalled();
    expect(outcome.briefSection).toBeNull();
    expect(outcome.replayed).toHaveLength(0);
  });

  it("returns nothing for an empty or absent list", async () => {
    const execute = vi.fn(async () => ({ ok: true }));
    expect(
      (await replayApprovedCalls(undefined, { execute })).briefSection
    ).toBeNull();
    expect(
      (await replayApprovedCalls([], { execute })).briefSection
    ).toBeNull();
    expect(execute).not.toHaveBeenCalled();
  });

  it("reports a throwing replay as a failed result instead of crashing the run", async () => {
    const execute = vi.fn(async () => {
      throw new Error("core unreachable");
    });

    const outcome = await replayApprovedCalls(
      [{ input: { title: "x" }, operation_id: "tasks_create" }],
      { execute }
    );

    expect(outcome.replayed).toHaveLength(1);
    expect(outcome.briefSection).toContain("replay_failed");
    expect(outcome.briefSection).toContain("core unreachable");
  });

  it("replays multiple approved calls in order, once each", async () => {
    const seen: string[] = [];
    const execute = vi.fn(async (operationId: string) => {
      seen.push(operationId);
      return { ok: true };
    });

    await replayApprovedCalls(
      [
        { input: { a: 1 }, operation_id: "tasks_create" },
        { input: { b: 2 }, operation_id: "kb_article_create" },
      ],
      { execute }
    );

    expect(seen).toEqual(["tasks_create", "kb_article_create"]);
    expect(execute).toHaveBeenCalledTimes(2);
  });

  // Regression for 2026-08-22 in space wiener-bauordnung: an approved
  // `kb_source_create` executed twice with identical arguments (kb_sources
  // 01a029dd-3985… + 01a029dd-c4ce…). With the run's dedupe map in the ALS —
  // exactly how delegate-run seeds it — a replayed call registers its
  // invocation key through the REAL execute tool, so the resumed model
  // re-issuing the same call despite the brief gets the first result back
  // instead of inserting a second record.
  describe("replay through the real execute tool arms the dedupe map", () => {
    afterEach(() => {
      vi.restoreAllMocks();
      vi.unstubAllEnvs();
      vi.unstubAllGlobals();
    });

    it("a model re-issue of a replayed call is refused with the replay's result", async () => {
      vi.stubEnv("ENGENTY_CORE_BASE_URL", "https://api.engenty.localhost");
      const contract = () =>
        Response.json({
          ok: true,
          data: {
            auth: {
              requiredCapabilities: [],
              requiredPermissions: [],
              requiredScopes: [],
              requiresApproval: true,
              riskLevel: "high",
            },
            inputSchema: { type: "zod" },
            moduleId: "knowledge-base",
            pluginId: "knowledge-base",
            readOnly: false,
            summary: "Create a KB Source",
            toolId: "kb_source_create",
          },
        });
      const fetchMock = vi
        .fn()
        .mockResolvedValueOnce(contract())
        .mockResolvedValueOnce(
          Response.json({ ok: true, data: { id: "src-1" } })
        )
        // The model's re-issue: describe again, but never a second invoke.
        .mockResolvedValueOnce(contract());
      vi.stubGlobal("fetch", fetchMock);
      const input = {
        adapter_id: "url",
        name: "RIS – Bauordnung für Wien (konsolidierte Fassung)",
        settings: { url: "https://www.ris.bka.gv.at/…/LWI40000225.html" },
      };
      const runContext = {
        accessToken: "user-token",
        approvalGrants: ["kb_source_create"],
        approvalPolicy: "request" as const,
        executedWriteCalls: new Map<string, unknown>(),
      };

      const outcome = await engentyToolsRunAls.run(runContext, () =>
        replayApprovedCalls([{ input, operation_id: "kb_source_create" }])
      );
      const reissued = (await engentyToolsRunAls.run(runContext, () =>
        executeEngentyTool(
          { id: "kb_source_create", input: JSON.stringify(input) },
          undefined
        )
      )) as { error?: string; previous_result?: { data?: unknown } };

      expect(outcome.replayed).toHaveLength(1);
      expect(outcome.briefSection).toContain("src-1");
      expect(reissued.error).toBe("duplicate_call");
      expect(reissued.previous_result?.data).toEqual({ id: "src-1" });
      expect(fetchMock).toHaveBeenCalledTimes(3);
    });
  });
});
