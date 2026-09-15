import { describe, expect, it } from "vitest";
import type { AiAgentRunSummary } from "../../lib/admin/ai-runtime-types.js";
import type { EngentyAgUiMessage } from "../conversation.js";
import {
  buildTerminalRunFailureNotice,
  runErrorNoticeId,
} from "./apps-ai-run-failure-notice.js";

function runSummary(
  partial: Partial<AiAgentRunSummary> & Pick<AiAgentRunSummary, "id" | "status">
): AiAgentRunSummary {
  return {
    workflow_id: null,
    agent_id: "engenty.copilot",
    created_at: "2026-09-15T10:00:00.000Z",
    error: null,
    finished_at: null,
    request_id: null,
    started_at: "2026-09-15T10:00:00.000Z",
    summary: null,
    tenant_id: "t1",
    thread_id: "thread-1",
    trigger: "message",
    ...partial,
  };
}

const user = (id: string, createdAt?: string): EngentyAgUiMessage => ({
  id,
  role: "user",
  content: "zeige mir den entwurf",
  ...(createdAt ? { metadata: { created_at: createdAt } } : {}),
});

const toolOnlyAssistant: EngentyAgUiMessage = {
  id: "a-tools",
  role: "assistant",
  content: "",
  toolCalls: [
    {
      id: "call-1",
      type: "function",
      function: { name: "artifact_read", arguments: "{}" },
    },
  ],
} as EngentyAgUiMessage;

const failed = runSummary({
  id: "run-9",
  status: "failed",
  error: "Process restarted while run was in progress",
});

describe("buildTerminalRunFailureNotice", () => {
  it("appends a readable notice when the failed turn has only tool cards", () => {
    const notice = buildTerminalRunFailureNotice({
      messages: [user("u1"), toolOnlyAssistant],
      run: failed,
    });
    expect(notice).toMatchObject({
      id: runErrorNoticeId("run-9"),
      role: "assistant",
    });
    expect(notice?.content).toContain("restarted");
    expect(notice?.content).not.toContain("Process restarted while run");
  });

  it("appends a notice when the turn ends on the user's prompt", () => {
    expect(
      buildTerminalRunFailureNotice({ messages: [user("u1")], run: failed })
    ).not.toBeNull();
  });

  it("stays quiet when the turn already ends in assistant text", () => {
    expect(
      buildTerminalRunFailureNotice({
        messages: [
          user("u1"),
          { id: "a1", role: "assistant", content: "Hier ist der Entwurf…" },
        ],
        run: failed,
      })
    ).toBeNull();
  });

  it("stays quiet for cancelled and succeeded runs and for runs without an error", () => {
    const messages = [user("u1"), toolOnlyAssistant];
    expect(
      buildTerminalRunFailureNotice({
        messages,
        run: runSummary({ id: "r", status: "cancelled", error: "cancelled" }),
      })
    ).toBeNull();
    expect(
      buildTerminalRunFailureNotice({
        messages,
        run: runSummary({ id: "r", status: "succeeded" }),
      })
    ).toBeNull();
    expect(
      buildTerminalRunFailureNotice({
        messages,
        run: runSummary({ id: "r", status: "failed", error: "  " }),
      })
    ).toBeNull();
  });

  it("does not resurface a failure from an earlier turn", () => {
    expect(
      buildTerminalRunFailureNotice({
        messages: [user("u2", "2026-09-15T11:00:00.000Z")],
        run: failed,
      })
    ).toBeNull();
  });

  it("tolerates the prompt row being persisted just after the run row", () => {
    expect(
      buildTerminalRunFailureNotice({
        messages: [user("u1", "2026-09-15T10:00:02.000Z")],
        run: failed,
      })
    ).not.toBeNull();
  });

  it("does not duplicate a notice the lane already carries", () => {
    expect(
      buildTerminalRunFailureNotice({
        messages: [
          user("u1"),
          { id: runErrorNoticeId("run-9"), role: "assistant", content: "x" },
        ],
        run: failed,
      })
    ).toBeNull();
  });

  it("turns a provider content-filter blob into the content-filter copy", () => {
    const notice = buildTerminalRunFailureNotice({
      messages: [user("u1"), toolOnlyAssistant],
      run: runSummary({
        id: "run-cf",
        status: "failed",
        error:
          '{"name":"AI_APICallError","message":"<400> InternalError.Algo.DataInspectionFailed: Output data may contain inappropriate content.","code":"data_inspection_failed"}',
      }),
    });
    expect(notice?.content).toContain("content filter");
    expect(notice?.content).not.toContain("{");
  });
});
