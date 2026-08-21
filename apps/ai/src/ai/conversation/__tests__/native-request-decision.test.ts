import { afterEach, describe, expect, it, vi } from "vitest";
import { resetFrontendToolSuspendSlotsForTests } from "../../../../ai/frontend-tools/frontend-tool-suspend-lock.js";
import { engentyToolsRunAls } from "../../../../ai/tools/engenty-tools/lib/run-context.js";
import {
  createNativeRequestDecisionTool,
  formatDecisionResumeForModel,
} from "../../../../ai/tools/request-decision/native-request-decision.js";

afterEach(() => {
  resetFrontendToolSuspendSlotsForTests();
});

const INPUT = {
  choices: [
    { id: "report", label: "Report erstellen" },
    { id: "invoice", label: "Rechnungen erstellen" },
  ],
  title: "Nächster Schritt",
};

function runExecute(
  tool: ReturnType<typeof createNativeRequestDecisionTool>,
  input: unknown,
  agent: Record<string, unknown>
) {
  return (tool.execute as (i: unknown, c: unknown) => Promise<unknown>)(input, {
    agent,
  });
}

const INTERACTIVE = {
  canSuspendForInteraction: true,
  orchestratorThreadId: "thread-1",
  runId: "run-1",
};

describe("requestDecision suspends natively", () => {
  it("suspends with the decision artifact instead of returning it", async () => {
    const tool = createNativeRequestDecisionTool();
    const suspend = vi.fn(async (_payload: unknown) => {
      // Mastra never resumes the original await; hold like a real suspend.
      await new Promise(() => undefined);
    });

    await engentyToolsRunAls.run(INTERACTIVE, async () => {
      void runExecute(tool, INPUT, { suspend });
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(suspend).toHaveBeenCalledTimes(1);
    const payload = suspend.mock.calls[0]?.[0] as {
      artifact_type?: string;
      choices?: unknown[];
      interrupt_id?: string;
      title?: string;
    };
    expect(payload.artifact_type).toBe("decision");
    expect(payload.title).toBe("Nächster Schritt");
    expect(payload.choices).toHaveLength(2);
    // The interrupt id is what the resume route matches the answer against.
    expect(payload.interrupt_id).toBeTruthy();
  });

  it("returns the user's choice to the MODEL on resume", async () => {
    // The point of the cutover: the answer is this tool's own result, not a
    // synthetic user-message nudge after a re-run.
    const tool = createNativeRequestDecisionTool();
    const result = await engentyToolsRunAls.run(INTERACTIVE, () =>
      runExecute(tool, INPUT, {
        resumeData: { choice_id: "report", choice_label: "Report erstellen" },
      })
    );
    expect(result).toBe("The user selected: Report erstellen");
  });

  it("does NOT suspend a run with no human channel, and says nobody was asked", async () => {
    // Headless task jobs and delegated child runs have nobody to answer a
    // suspend — suspending there would hang the run forever. Returning the bare
    // artifact was almost as bad: it reads as "the chooser was shown", so the
    // model waits for a pick that cannot come or invents one.
    const tool = createNativeRequestDecisionTool();
    const suspend = vi.fn(async () => undefined);

    const result = await engentyToolsRunAls.run(
      { orchestratorThreadId: "thread-headless", runId: "run-2" },
      () => runExecute(tool, INPUT, { suspend })
    );

    expect(suspend).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      artifact_type: "decision_unavailable",
      reason: "no_human_channel",
    });
    expect((result as { note: string }).note).toContain("was NOT shown");
    // The question survives in the result so the run can report what it needed.
    expect((result as { question: string }).question).toBe(INPUT.title);
  });

  it("serializes a second suspend until the first is resumed", async () => {
    // Two tools suspending in ONE step wedge Mastra's resumeStream (the reason
    // approvals use the artifact policy). The shared per-thread lock is what
    // makes suspending here safe.
    const first = createNativeRequestDecisionTool();
    const second = createNativeRequestDecisionTool();
    const firstSuspend = vi.fn(async () => {
      await new Promise(() => undefined);
    });
    const secondSuspend = vi.fn(async () => {
      await new Promise(() => undefined);
    });

    await engentyToolsRunAls.run(INTERACTIVE, async () => {
      void runExecute(first, INPUT, { suspend: firstSuspend });
      await Promise.resolve();
      await Promise.resolve();
      expect(firstSuspend).toHaveBeenCalledTimes(1);

      void runExecute(second, INPUT, { suspend: secondSuspend });
      await Promise.resolve();
      await Promise.resolve();
      // Queued behind the first, not suspended alongside it.
      expect(secondSuspend).not.toHaveBeenCalled();

      // Resuming the first releases the slot; the second may now suspend.
      await runExecute(first, INPUT, {
        resumeData: { choice_id: "report", choice_label: "Report erstellen" },
      });
      await Promise.resolve();
      await Promise.resolve();
      expect(secondSuspend).toHaveBeenCalledTimes(1);
    });
  });
});

describe("formatDecisionResumeForModel", () => {
  it("names a single choice", () => {
    expect(
      formatDecisionResumeForModel({ choice_label: "Report erstellen" })
    ).toBe("The user selected: Report erstellen");
  });

  it("falls back from label to id", () => {
    expect(formatDecisionResumeForModel({ choice_id: "report" })).toBe(
      "The user selected: report"
    );
  });

  it("lists every choice in multi-select", () => {
    expect(
      formatDecisionResumeForModel({
        choices: [{ label: "A" }, { label: "B" }],
      })
    ).toBe("The user selected: A, B");
  });

  it("passes a free-form answer through", () => {
    expect(formatDecisionResumeForModel({ text: "etwas anderes" })).toBe(
      "The user answered: etwas anderes"
    );
  });

  it("reports a dismissal as a dismissal, not a selection", () => {
    expect(formatDecisionResumeForModel({ cancelled: true })).toContain(
      "dismissed"
    );
  });

  it("never reads as success when no answer can be parsed", () => {
    // Silently returning "" here would let the model act on a choice the user
    // never made — the same failure direction the resume-choice resolver guards.
    const text = formatDecisionResumeForModel({});
    expect(text).toContain("no choice could be read");
    expect(text).not.toContain("The user selected");
  });
});
