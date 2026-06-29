import { afterEach, describe, expect, it, vi } from "vitest";
import {
  executeOpenAiRealtimeVoiceBackendTool,
  isOpenAiRealtimeVoiceBackendToolName,
  OPENAI_REALTIME_VOICE_ENGENTY_BACKEND_TOOLS,
  parseRealtimeVoiceToolApproval,
} from "./realtime-voice-backend-tools.js";

describe("parseRealtimeVoiceToolApproval", () => {
  it("detects a tool-approval decision artifact and decodes the operation id", () => {
    const approval = parseRealtimeVoiceToolApproval({
      artifact_id: "tool-approval|contacts_contact_create",
      artifact_type: "decision",
      body: "This action requires your approval before it runs.",
      choices: [
        { id: "approve_once", label: "Approve once" },
        { id: "approve_always", label: "Approve always (this chat)" },
        { id: "deny", label: "Deny" },
      ],
      interrupt_id: "tool-approval|contacts_contact_create",
      title: "Approve Create contact?",
    });
    expect(approval).toEqual({
      artifactId: "tool-approval|contacts_contact_create",
      body: "This action requires your approval before it runs.",
      choices: [
        { id: "approve_once", label: "Approve once" },
        { id: "approve_always", label: "Approve always (this chat)" },
        { id: "deny", label: "Deny" },
      ],
      interruptId: "tool-approval|contacts_contact_create",
      operationId: "contacts_contact_create",
      title: "Approve Create contact?",
    });
  });

  it("returns null for a normal tool result", () => {
    expect(parseRealtimeVoiceToolApproval({ ok: true, data: {} })).toBeNull();
    expect(
      parseRealtimeVoiceToolApproval({
        artifact_type: "decision",
        artifact_id: "feedback|something",
      })
    ).toBeNull();
  });
});

describe("realtime voice backend tools", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("exposes Engenty backend tools as OpenAI function definitions", () => {
    expect(
      OPENAI_REALTIME_VOICE_ENGENTY_BACKEND_TOOLS.map((tool) => tool.name)
    ).toEqual([
      "engenty_tools_context",
      "engenty_tools_modules",
      "engenty_tools_search",
      "engenty_tool_describe",
      "engenty_tool_execute",
    ]);
    expect(isOpenAiRealtimeVoiceBackendToolName("engenty_tool_execute")).toBe(
      true
    );
    expect(isOpenAiRealtimeVoiceBackendToolName("app.navigate")).toBe(false);
  });

  it("posts realtime tool execution requests to apps/ai", async () => {
    const fetchMock = vi.fn(async () =>
      Response.json({
        result: {
          ok: true,
          matches: [{ name: "contacts_list" }],
        },
      })
    );
    vi.stubGlobal("fetch", fetchMock);

    const result = await executeOpenAiRealtimeVoiceBackendTool({
      baseUrl: "https://ai.engenty_localhost/",
      headers: { Authorization: "Bearer user-token" },
      request: {
        arguments: { moduleId: "contacts", query: "list" },
        callId: "call_1",
        name: "engenty_tools_search",
      },
      threadId: "00000000-0000-4000-8000-000000000001",
    });

    expect(result).toEqual({
      ok: true,
      matches: [{ name: "contacts_list" }],
    });
    expect(fetchMock).toHaveBeenCalledWith(
      "https://ai.engenty_localhost/ai/v1/realtime/tools/execute",
      expect.objectContaining({
        body: JSON.stringify({
          arguments: { moduleId: "contacts", query: "list" },
          call_id: "call_1",
          name: "engenty_tools_search",
          thread_id: "00000000-0000-4000-8000-000000000001",
        }),
        headers: {
          Authorization: "Bearer user-token",
          "content-type": "application/json",
        },
        method: "POST",
      })
    );
  });
});
