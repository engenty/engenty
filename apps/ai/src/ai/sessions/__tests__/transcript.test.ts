import { describe, expect, it } from "vitest";
import {
  appendOrReplaceTranscriptToolPart,
  appendSubAgentProgressFromStreamChunk,
  appendSubAgentProgressToTranscriptParts,
  buildApprovalRequestedToolPart,
  formatSubAgentProgressLine,
  mastraToolStreamChunkToRunningToolPart,
  mergeDecisionChoiceIntoArtifactOutput,
  normalizeSandboxCommandToolOutput,
  patchDecisionResumeOntoMessageParts,
  readDecisionResumeChoice,
  resolveDecisionResumeChoice,
  toolResultPayloadToAssistantDynamicToolPart,
} from "../transcript.js";

const SANDBOX_EXECUTE_COMMAND_TOOL_NAME = "mastra_workspace_execute_command";

describe("transcript tool parts", () => {
  it("formats execute_command tool results for sub-agent progress lines", () => {
    expect(
      formatSubAgentProgressLine("tool-result", {
        args: { command: "date" },
        result: "Sun Jun 7 06:17:48 UTC 2026\n",
        toolCallId: "inner-call-1",
        toolName: SANDBOX_EXECUTE_COMMAND_TOOL_NAME,
      })
    ).toBe("$ date\nSun Jun 7 06:17:48 UTC 2026");
  });

  it("appends nested Mastra stream chunks to the active agent delegation", () => {
    const running = mastraToolStreamChunkToRunningToolPart("tool-call", {
      args: { task: "Run date" },
      toolCallId: "call_function_m36ypqjg1e5z_1",
      toolName: "agent-engenty_cli",
    });
    expect(running).not.toBeNull();
    const progress = appendSubAgentProgressFromStreamChunk([running!], {
      chunkType: "tool-call",
      delegationToolCallId: "call_function_m36ypqjg1e5z_1",
      payload: {
        args: { command: "date" },
        toolCallId: "inner-call-1",
        toolName: SANDBOX_EXECUTE_COMMAND_TOOL_NAME,
      },
    });
    expect(progress.line).toBe("$ date");
    expect(progress.parts[0]).toMatchObject({
      progressLines: ["$ date"],
      toolCallId: "call_function_m36ypqjg1e5z_1",
    });
  });

  it("appends sync sub-agent progress lines to the running tool part", () => {
    const running = mastraToolStreamChunkToRunningToolPart("tool-call", {
      args: { task: "Find contacts" },
      toolCallId: "agent-call-1",
      toolName: "agent-engenty_cli",
    });
    expect(running).not.toBeNull();
    const next = appendSubAgentProgressToTranscriptParts([running!], {
      text: "Searching catalog…",
      toolCallId: "agent-call-1",
    });
    expect(next[0]).toMatchObject({
      progressLines: ["Searching catalog…"],
      toolCallId: "agent-call-1",
    });
  });

  it("keeps sub-agent progressLines when tool-result replaces the running part", () => {
    const running = mastraToolStreamChunkToRunningToolPart("tool-call", {
      args: { task: "Summarize contacts" },
      toolCallId: "call_function_cvuuausam6wj_1",
      toolName: "agent-engenty_cli",
    });
    expect(running).not.toBeNull();
    const withProgress = appendSubAgentProgressToTranscriptParts([running!], {
      text: "Searching catalog…",
      toolCallId: "call_function_cvuuausam6wj_1",
    });
    const completed = toolResultPayloadToAssistantDynamicToolPart({
      args: { task: "Summarize contacts" },
      result: { ok: true, summary: "Done." },
      toolCallId: "call_function_cvuuausam6wj_1",
      toolName: "agent-engenty_cli",
    });
    const next = appendOrReplaceTranscriptToolPart(withProgress, completed);
    expect(next[0]).toMatchObject({
      progressLines: ["Searching catalog…"],
      state: "output-available",
      toolCallId: "call_function_cvuuausam6wj_1",
    });
  });

  it("maps Mastra tool-call chunks to running dynamic-tool parts", () => {
    expect(
      mastraToolStreamChunkToRunningToolPart("tool-call", {
        args: { query: "contacts" },
        toolCallId: "call-1",
        toolName: "agent-engenty_cli",
      })
    ).toEqual({
      input: { query: "contacts" },
      state: "input-streaming",
      toolCallId: "call-1",
      toolName: "agent-engenty_cli",
      type: "dynamic-tool",
    });
  });

  it("remaps invoke_frontend_tool rows to the browser dispatch call_id", () => {
    expect(
      toolResultPayloadToAssistantDynamicToolPart({
        args: {
          input: { to: "/mdl/projects/project-1" },
          tool_name: "navigate",
        },
        result: {
          call_id: "frontend-dispatch-id",
          output: { ok: true },
          run_id: "run-1",
          tool_name: "navigate",
        },
        toolCallId: "call_mastraWrapperId",
        toolName: "invoke_frontend_tool",
      })
    ).toMatchObject({
      toolCallId: "frontend-dispatch-id",
      toolName: "navigate",
      state: "output-available",
    });
  });

  it("remaps invoke_frontend_tool when Mastra result includes call_id on ok payload", () => {
    expect(
      toolResultPayloadToAssistantDynamicToolPart({
        args: {
          input: { to: "/mdl/contacts" },
          tool_name: "navigate",
        },
        result: {
          call_id: "ee1a9a8b-88e6-4db4-a6d8-555f42a10001",
          output: { ok: true },
          tool_name: "navigate",
        },
        toolCallId: "call_mastraWrapperId",
        toolName: "invoke_frontend_tool",
      })
    ).toMatchObject({
      toolCallId: "ee1a9a8b-88e6-4db4-a6d8-555f42a10001",
      toolName: "navigate",
      state: "output-available",
    });
  });

  it("persists toolCallId on requestDecision decision artifacts", () => {
    expect(
      toolResultPayloadToAssistantDynamicToolPart({
        toolCallId: "decision-tool-1",
        toolName: "requestDecision",
        result: {
          artifact_id: "artifact-1",
          artifact_type: "decision",
          choices: [{ id: "yes", label: "Yes" }],
          interrupt_id: "artifact-1",
          title: "Approve?",
        },
      })
    ).toMatchObject({
      type: "dynamic-tool",
      toolCallId: "decision-tool-1",
      toolName: "requestDecision",
      state: "output-available",
    });
  });

  it("merges decision resume choice into requestDecision tool output", () => {
    const output = {
      artifact_id: "artifact-1",
      artifact_type: "decision" as const,
      choices: [{ id: "64", label: "64" }],
      interrupt_id: "artifact-1",
      title: "Choose a number",
    };
    expect(
      mergeDecisionChoiceIntoArtifactOutput(output, {
        choiceId: "64",
        choiceLabel: "64",
      })
    ).toEqual({
      ...output,
      choice_id: "64",
      choice_label: "64",
    });
  });

  it("patches the matching requestDecision row on resume", () => {
    const parts = [
      {
        type: "dynamic-tool",
        toolCallId: "decision-tool-1",
        toolName: "requestDecision",
        state: "output-available",
        output: {
          artifact_id: "artifact-1",
          artifact_type: "decision",
          choices: [{ id: "64", label: "64" }],
          interrupt_id: "artifact-1",
          title: "Choose a number",
        },
      },
    ];
    const patched = patchDecisionResumeOntoMessageParts(
      parts,
      {
        artifact_id: "artifact-1",
        interrupt_id: "artifact-1",
        tool_call_id: "decision-tool-1",
      },
      { choiceId: "64", choiceLabel: "64" }
    );
    expect(patched.patched).toBe(true);
    expect(patched.parts).toEqual([
      {
        type: "dynamic-tool",
        toolCallId: "decision-tool-1",
        toolName: "requestDecision",
        state: "output-available",
        output: {
          artifact_id: "artifact-1",
          artifact_type: "decision",
          choices: [{ id: "64", label: "64" }],
          interrupt_id: "artifact-1",
          title: "Choose a number",
          choice_id: "64",
          choice_label: "64",
        },
      },
    ]);
  });

  it("normalizes a Mastra execute_command string result into structured stdout", () => {
    expect(
      normalizeSandboxCommandToolOutput(
        { command: "pwd && ls -la" },
        "/sandbox\ntotal 0\n"
      )
    ).toEqual({
      command: "pwd && ls -la",
      stdout: "/sandbox\ntotal 0\n",
    });
  });

  it("keeps structured execute_command fields when a provider returns an object", () => {
    expect(
      normalizeSandboxCommandToolOutput(
        { command: "false" },
        { exitCode: 1, stderr: "boom", stdout: "", timedOut: false }
      )
    ).toEqual({
      command: "false",
      exitCode: 1,
      stderr: "boom",
      stdout: "",
    });
  });

  it("persists execute_command stdout on the tool-result part (non-approval path)", () => {
    expect(
      toolResultPayloadToAssistantDynamicToolPart({
        args: { command: "pwd && ls -la" },
        result: "/sandbox\nnotes.md\n",
        toolCallId: "sandbox-call-1",
        toolName: SANDBOX_EXECUTE_COMMAND_TOOL_NAME,
      })
    ).toEqual({
      type: "dynamic-tool",
      toolName: SANDBOX_EXECUTE_COMMAND_TOOL_NAME,
      toolCallId: "sandbox-call-1",
      state: "output-available",
      input: { command: "pwd && ls -la" },
      output: { command: "pwd && ls -la", stdout: "/sandbox\nnotes.md\n" },
    });
  });

  it("replaces the approval-requested part with the command output on resume", () => {
    // Mirrors the HITL resume path: the suspended message holds the pending
    // approval part; the resumed tool-result must replace it in place (same
    // toolCallId) and carry the command stdout so the chat renders it.
    const pending = buildApprovalRequestedToolPart({
      input: { command: "pwd && ls -la" },
      toolCallId: "sandbox-call-1",
      toolName: SANDBOX_EXECUTE_COMMAND_TOOL_NAME,
    });
    const resolved = toolResultPayloadToAssistantDynamicToolPart({
      args: { command: "pwd && ls -la" },
      result: "/sandbox\nnotes.md\n",
      toolCallId: "sandbox-call-1",
      toolName: SANDBOX_EXECUTE_COMMAND_TOOL_NAME,
    });
    const next = appendOrReplaceTranscriptToolPart([pending], resolved);
    expect(next).toEqual([
      {
        type: "dynamic-tool",
        toolName: SANDBOX_EXECUTE_COMMAND_TOOL_NAME,
        toolCallId: "sandbox-call-1",
        state: "output-available",
        input: { command: "pwd && ls -la" },
        output: { command: "pwd && ls -la", stdout: "/sandbox\nnotes.md\n" },
      },
    ]);
  });

  it("reads decision resume choice payload", () => {
    expect(
      readDecisionResumeChoice({
        interruptId: "artifact-1",
        payload: {
          artifact_id: "artifact-1",
          choice_id: "64",
          choice_label: "64",
        },
        status: "resolved",
      })
    ).toEqual({ choiceId: "64", choiceLabel: "64" });
  });
});

// A decision resume used to need BOTH choice_id and choice_label, and the
// approval callers read a missing choice as "not approved" — so an id-only
// payload silently DENIED, indistinguishable from the user pressing Deny.
describe("resolveDecisionResumeChoice", () => {
  const CHOICES = [
    { id: "approve_once", label: "Approve once" },
    { id: "deny", label: "Deny" },
  ];

  function entry(
    payload: unknown,
    status: "resolved" | "cancelled" = "resolved"
  ) {
    return { interruptId: "artifact-1", payload, status } as never;
  }

  it("takes an id+label payload as-is", () => {
    expect(
      resolveDecisionResumeChoice(
        entry({ choice_id: "approve_once", choice_label: "Approve once" }),
        CHOICES
      )
    ).toEqual({
      choiceId: "approve_once",
      choiceLabel: "Approve once",
      kind: "choice",
    });
  });

  // The reported bug: this used to resolve to null and deny.
  it("recovers the label from the interrupt's own choices when only the id is sent", () => {
    expect(
      resolveDecisionResumeChoice(entry({ choice_id: "approve_once" }), CHOICES)
    ).toEqual({
      choiceId: "approve_once",
      choiceLabel: "Approve once",
      kind: "choice",
    });
  });

  it("reports an id it cannot resolve instead of guessing a direction", () => {
    expect(
      resolveDecisionResumeChoice(entry({ choice_id: "approve_all" }), CHOICES)
    ).toEqual({ choiceId: "approve_all", kind: "unresolved" });
    // Same when the caller has no choices to match against (e.g. a stale card).
    expect(
      resolveDecisionResumeChoice(entry({ choice_id: "approve_once" }))
    ).toEqual({ choiceId: "approve_once", kind: "unresolved" });
  });

  it("treats a cancelled entry as an explicit deny, not an error", () => {
    expect(
      resolveDecisionResumeChoice(entry({}, "cancelled"), CHOICES)
    ).toEqual({ kind: "cancelled" });
  });

  // Other resume shapes must keep their existing behaviour — only a payload
  // that NAMES a choice can be unresolvable.
  it("reports absent for payloads that name no choice at all", () => {
    for (const payload of [{}, { approved: false }, { rejected: true }, null]) {
      expect(resolveDecisionResumeChoice(entry(payload), CHOICES)).toEqual({
        kind: "absent",
      });
    }
  });
});
