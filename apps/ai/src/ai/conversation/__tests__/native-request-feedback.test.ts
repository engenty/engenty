import { readDecisionResumeAnswer } from "@engenty/ai-core";
import { afterEach, describe, expect, it, vi } from "vitest";
import { resetFrontendToolSuspendSlotsForTests } from "../../../../ai/frontend-tools/frontend-tool-suspend-lock.js";
import { engentyToolsRunAls } from "../../../../ai/tools/engenty-tools/lib/run-context.js";
import { createNativeRequestDecisionTool } from "../../../../ai/tools/request-decision/native-request-decision.js";
import { createNativeRequestFeedbackTool } from "../../../../ai/tools/request-feedback/native-request-feedback.js";

afterEach(() => {
  resetFrontendToolSuspendSlotsForTests();
});

const INPUT = {
  body: "Was soll ich ändern?",
  placeholder: "Deine Antwort…",
  title: "Feedback zum Entwurf",
};

function runExecute(
  tool: { execute?: unknown },
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

describe("requestFeedback suspends natively", () => {
  it("suspends with the feedback card instead of returning it", async () => {
    const tool = createNativeRequestFeedbackTool();
    const suspend = vi.fn(async (_payload: unknown) => undefined);

    const result = await engentyToolsRunAls.run(INTERACTIVE, () =>
      runExecute(tool, INPUT, { suspend })
    );

    expect(suspend).toHaveBeenCalledTimes(1);
    const payload = suspend.mock.calls[0]?.[0] as {
      artifact_type?: string;
      body?: string;
      interrupt_id?: string;
      title?: string;
    };
    expect(payload.artifact_type).toBe("feedback");
    expect(payload.title).toBe(INPUT.title);
    expect(payload.body).toBe(INPUT.body);
    // The interrupt id is what the resume route matches the answer against.
    expect(payload.interrupt_id).toBeTruthy();
    // Nothing comes back as the call's result: not the card, and not a
    // suspend-payload validation error from the tool's own suspendSchema.
    expect(result).toBeUndefined();
  });

  it("returns the typed answer to the model on resume, readable back from storage", async () => {
    // The result sentence is all that survives of the answer once the run
    // resumes; the transcript reads the answer back out of it.
    const tool = createNativeRequestFeedbackTool();
    const result = await engentyToolsRunAls.run(INTERACTIVE, () =>
      runExecute(tool, INPUT, { resumeData: { feedback: "Kürzer, bitte." } })
    );

    expect(readDecisionResumeAnswer(result)).toBe("Kürzer, bitte.");
  });

  it("does NOT suspend a run with no human channel, and says nobody was asked", async () => {
    const tool = createNativeRequestFeedbackTool();
    const suspend = vi.fn(async () => undefined);

    const result = await engentyToolsRunAls.run(
      { orchestratorThreadId: "thread-headless", runId: "run-2" },
      () => runExecute(tool, INPUT, { suspend })
    );

    expect(suspend).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      artifact_type: "feedback_unavailable",
      question: INPUT.title,
      reason: "no_human_channel",
    });
  });

  it("queues behind a chooser suspended in the same step", async () => {
    // Two tools suspending in ONE step wedge Mastra's resumeStream; feedback
    // shares requestDecision's per-thread lock so it waits instead.
    const decision = createNativeRequestDecisionTool();
    const feedback = createNativeRequestFeedbackTool();
    const hold = async () => {
      await new Promise(() => undefined);
    };
    const decisionSuspend = vi.fn(hold);
    const feedbackSuspend = vi.fn(hold);
    const decisionInput = {
      choices: [{ id: "a", label: "A" }],
      title: "Welche Variante?",
    };

    await engentyToolsRunAls.run(INTERACTIVE, async () => {
      void runExecute(decision, decisionInput, { suspend: decisionSuspend });
      await Promise.resolve();
      await Promise.resolve();
      expect(decisionSuspend).toHaveBeenCalledTimes(1);

      void runExecute(feedback, INPUT, { suspend: feedbackSuspend });
      await Promise.resolve();
      await Promise.resolve();
      expect(feedbackSuspend).not.toHaveBeenCalled();

      await runExecute(decision, decisionInput, {
        resumeData: { choice_id: "a", choice_label: "A" },
      });
      await Promise.resolve();
      await Promise.resolve();
      expect(feedbackSuspend).toHaveBeenCalledTimes(1);
    });
  });
});
