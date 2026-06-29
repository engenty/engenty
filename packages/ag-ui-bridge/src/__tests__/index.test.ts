import { HttpAgent } from "@ag-ui/client";
import {
  type AGUIEvent,
  EventSchemas,
  EventType,
  type RunAgentInput,
  RunAgentInputSchema,
  type Tool,
  ToolSchema,
} from "@ag-ui/core";
import { EventEncoder } from "@ag-ui/encoder";
import { describe, expect, it } from "vitest";
import {
  type AgentUiRunContext,
  type AgentUiStateSnapshotV1,
  assertAgentUiStateSnapshotWithinLimit,
  createAgUiSseParser,
  createFrontendToolDefinition,
  encodeAgUiSseEvent,
  isAgentUiRunContext,
  isFrontendToolDefinition,
  parseAgUiSseChunk,
  toAgUiTool,
} from "../index.js";

function makeSnapshot(): AgentUiStateSnapshotV1 {
  return {
    observed_at: "2026-05-03T19:39:00.000Z",
    route: {
      module_id: "contacts",
      pathname: "/mdl/contacts/123",
      route_key: "detail",
    },
    sequence: 1,
    shell: {
      copilot_open: true,
      dock_mode: "floating",
    },
    snapshot_id: "snapshot-1",
    version: 1,
  };
}

describe("Agent UI protocol validators", () => {
  it("does not export Copilot-owned base frontend tools", async () => {
    const bridge = await import("../index.js");
    expect(["agentUi", "Base", "FrontendTools"].join("") in bridge).toBe(false);
  });

  it("accepts a valid run context", () => {
    const context: AgentUiRunContext = {
      frontend_tools: [
        createFrontendToolDefinition({
          availability: "enabled",
          description: "Navigate inside the app.",
          parameters: {
            properties: { to: { type: "string" } },
            required: ["to"],
            type: "object",
          },
          name: "navigate",
          owner_module_id: "contacts",
          safety: "safe",
        }),
      ],
      state_snapshot: makeSnapshot(),
    };

    expect(isAgentUiRunContext(context)).toBe(true);
  });

  it("rejects legacy frontend tool definitions", () => {
    expect(
      isAgentUiRunContext({
        frontend_tools: [
          {
            availability: "enabled",
            description: "Broken tool.",
            input_schema: { type: "object" },
            name: "broken",
            safety: "safe",
          },
        ],
        state_snapshot: makeSnapshot(),
      })
    ).toBe(false);
  });

  it("enforces the snapshot byte limit", () => {
    const snapshot = makeSnapshot();
    expect(() => assertAgentUiStateSnapshotWithinLimit(snapshot, 8)).toThrow(
      /too large/
    );
  });

  it("validates official RunAgentInput shape", () => {
    const frontendTool = createFrontendToolDefinition({
      availability: "enabled",
      description: "Navigate inside the app.",
      name: "navigate",
      parameters: {
        properties: { to: { type: "string" } },
        required: ["to"],
        type: "object",
      },
      safety: "safe",
    });
    const input: RunAgentInput = {
      context: [{ description: "Current route", value: "/mdl/contacts" }],
      forwardedProps: {
        engenty: {
          route_key: "detail",
        },
      },
      messages: [{ content: "Open the contact.", id: "m1", role: "user" }],
      runId: "run-1",
      state: {},
      threadId: "thread-1",
      tools: [toAgUiTool(frontendTool)],
    };

    expect(RunAgentInputSchema.parse(input)).toEqual(input);
    expect(new HttpAgent({ url: "https://example.invalid/ag-ui" }).url).toBe(
      "https://example.invalid/ag-ui"
    );
  });

  it("maps frontend tools to official AG-UI Tool metadata", () => {
    const frontendTool = createFrontendToolDefinition({
      availability: "remote",
      description: "Patch a contact draft.",
      name: "contacts.patchDraft",
      owner_module_id: "contacts",
      parameters: {
        properties: { name: { type: "string" } },
        type: "object",
      },
      safety: "requires_confirmation",
      title: "Patch contact",
    });

    expect(isFrontendToolDefinition(frontendTool)).toBe(true);
    expect(frontendTool).not.toHaveProperty("input_schema");
    expect(frontendTool.metadata.engenty).toEqual({
      availability: "remote",
      owner_module_id: "contacts",
      safety: "requires_confirmation",
      title: "Patch contact",
    });
    expect(ToolSchema.parse(frontendTool)).toEqual(frontendTool);

    const officialTool: Tool = toAgUiTool(frontendTool);
    expect(ToolSchema.parse(officialTool)).toEqual(officialTool);
  });

  it("validates RunAgentInput with official resume entries", () => {
    const input: RunAgentInput = {
      context: [],
      forwardedProps: {},
      messages: [],
      resume: [
        {
          interruptId: "int-abc123",
          payload: { approved: true },
          status: "resolved",
        },
      ],
      runId: "run-2",
      state: {},
      threadId: "thread-1",
      tools: [],
    };

    expect(RunAgentInputSchema.parse(input)).toEqual(input);
  });

  it("validates RUN_FINISHED with interrupt outcome", () => {
    const event: AGUIEvent = {
      outcome: {
        interrupts: [
          {
            id: "int-abc123",
            message: "Send email to a@b.com with subject 'Hi'?",
            reason: "tool_call",
            responseSchema: {
              properties: { approved: { type: "boolean" } },
              required: ["approved"],
              type: "object",
            },
            toolCallId: "tc-001",
          },
        ],
        type: "interrupt",
      },
      runId: "run-1",
      threadId: "thread-1",
      type: EventType.RUN_FINISHED,
    };

    expect(EventSchemas.parse(event)).toEqual(event);
    expect(encodeAgUiSseEvent(event)).toBe(new EventEncoder().encodeSSE(event));
    expect(parseAgUiSseChunk(encodeAgUiSseEvent(event))).toEqual([event]);
  });

  it("validates representative official AG-UI events", () => {
    const events: AGUIEvent[] = [
      { runId: "run-1", threadId: "thread-1", type: EventType.RUN_STARTED },
      {
        messageId: "message-1",
        role: "assistant",
        type: EventType.TEXT_MESSAGE_START,
      },
      {
        delta: "Hello",
        messageId: "message-1",
        type: EventType.TEXT_MESSAGE_CONTENT,
      },
      {
        toolCallId: "tool-call-1",
        toolCallName: "navigate",
        type: EventType.TOOL_CALL_START,
      },
      {
        delta: '{"to":"/mdl/contacts"}',
        toolCallId: "tool-call-1",
        type: EventType.TOOL_CALL_ARGS,
      },
      {
        type: EventType.TOOL_CALL_END,
        toolCallId: "tool-call-1",
      },
    ];

    for (const event of events) {
      expect(EventSchemas.parse(event)).toEqual(event);
    }
  });

  it("uses the official encoder for AG-UI SSE events", () => {
    const event: AGUIEvent = {
      runId: "run-1",
      threadId: "thread-1",
      type: EventType.RUN_FINISHED,
    };

    expect(encodeAgUiSseEvent(event)).toBe(new EventEncoder().encodeSSE(event));
    expect(parseAgUiSseChunk(encodeAgUiSseEvent(event))).toEqual([event]);
  });

  it("round trips AG-UI custom SSE events", () => {
    const encoded = [
      encodeAgUiSseEvent({
        runId: "run-1",
        threadId: "thread-1",
        type: EventType.RUN_STARTED,
      }),
      encodeAgUiSseEvent({
        name: "engenty.artifact.created",
        type: EventType.CUSTOM,
        value: {
          artifact_id: "decision-1",
          artifact_type: "decision",
          choices: [{ id: "yes", label: "Yes" }],
        },
      }),
    ].join("");

    expect(parseAgUiSseChunk(encoded)).toEqual([
      { runId: "run-1", threadId: "thread-1", type: "RUN_STARTED" },
      {
        name: "engenty.artifact.created",
        type: "CUSTOM",
        value: {
          artifact_id: "decision-1",
          artifact_type: "decision",
          choices: [{ id: "yes", label: "Yes" }],
        },
      },
    ]);
  });

  it("buffers split AG-UI SSE events across chunks", () => {
    const parser = createAgUiSseParser();
    const encoded = encodeAgUiSseEvent({
      runId: "run-1",
      threadId: "thread-1",
      type: EventType.RUN_STARTED,
    });
    const splitAt = encoded.indexOf('"runId"');

    expect(parser.push(encoded.slice(0, splitAt))).toEqual([]);
    expect(parser.push(encoded.slice(splitAt))).toEqual([
      { runId: "run-1", threadId: "thread-1", type: "RUN_STARTED" },
    ]);
    expect(parser.flush()).toEqual([]);
  });
});
