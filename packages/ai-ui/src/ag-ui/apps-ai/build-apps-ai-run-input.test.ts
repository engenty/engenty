import {
  createFrontendToolDefinition,
  RunAgentInputSchema,
} from "@engenty/ag-ui-bridge";
import { describe, expect, it } from "vitest";
import {
  buildAppsAiResumeRunInput,
  buildAppsAiRunInput,
} from "./build-apps-ai-run-input.js";

const navigateTool = createFrontendToolDefinition({
  availability: "enabled",
  description: "Navigate inside Engenty.",
  name: "navigate",
  parameters: {
    properties: { to: { type: "string" } },
    required: ["to"],
    type: "object",
  },
  title: "Navigate",
});

const routeContext = {
  moduleId: "engenty-copilot",
  pathname: "/mdl/engenty-copilot/chat/new",
  routeKey: "chat",
};

describe("buildAppsAiRunInput", () => {
  it("builds an official RunAgentInput for apps/ai session runs", () => {
    const input = buildAppsAiRunInput({
      frontendTools: [navigateTool],
      message: { id: "user-1", role: "user", content: "Hello" },
      modelId: "openai/gpt-5.1",
      pathname: "/mdl/engenty-copilot/chat/new",
      routeContext,
      threadId: "session-1",
      state: {},
    });

    expect(RunAgentInputSchema.parse(input)).toEqual(input);
    expect(input.threadId).toBe("session-1");
    expect(input.runId).toEqual(expect.any(String));
    expect(input.forwardedProps).toEqual({
      engenty: { model_id: "openai/gpt-5.1" },
    });
    expect(input.messages).toEqual([
      { id: "user-1", role: "user", content: "Hello" },
    ]);
    expect(input.state).toMatchObject({
      route: {
        module_id: "engenty-copilot",
        pathname: "/mdl/engenty-copilot/chat/new",
        route_key: "chat",
      },
      version: 1,
    });
  });

  it("carries the effort pick alongside a pinned model id", () => {
    const input = buildAppsAiRunInput({
      effort: "high",
      frontendTools: [],
      message: { id: "user-1", role: "user", content: "Hello" },
      modelId: "openai/gpt-5.1",
      pathname: "/mdl/engenty-copilot/chat/new",
      routeContext,
      threadId: "session-1",
      state: {},
    });

    expect(RunAgentInputSchema.parse(input)).toEqual(input);
    expect(input.forwardedProps).toEqual({
      engenty: { effort: "high", model_id: "openai/gpt-5.1" },
    });
  });

  it("omits effort when the lane has no explicit pick", () => {
    const input = buildAppsAiRunInput({
      frontendTools: [],
      message: { id: "user-1", role: "user", content: "Hello" },
      modelId: null,
      pathname: "/mdl/engenty-copilot/chat/new",
      routeContext,
      threadId: "session-1",
      state: {},
    });

    expect(input.forwardedProps).toEqual({ engenty: {} });
  });

  it("passes route scope in forwardedProps when present", () => {
    const input = buildAppsAiRunInput({
      frontendTools: [],
      message: { id: "user-1", role: "user", content: "Hello" },
      modelId: null,
      pathname: "/mdl/engenty-copilot/chat/new",
      routeContext: {
        ...routeContext,
        scope: { kb_id: "kb-1" },
      },
      threadId: "session-1",
      state: {},
    });

    expect(input.forwardedProps).toEqual({
      engenty: { scope: { kb_id: "kb-1" } },
    });
  });

  it("uses the provided app-shell state snapshot", () => {
    const state = {
      observed_at: "2026-05-19T00:00:00.000Z",
      permissions: { frontend_tools: {} },
      route: {
        module_id: "contacts",
        pathname: "/mdl/contacts/1",
        route_key: "detail",
      },
      sequence: 7,
      shell: { copilot_open: true },
      snapshot_id: "snapshot-1",
      version: 1 as const,
    };

    const input = buildAppsAiRunInput({
      frontendTools: [],
      message: { id: "user-1", role: "user", content: "Hello" },
      pathname: "/mdl/contacts/1",
      routeContext: {
        moduleId: "contacts",
        pathname: "/mdl/contacts/1",
        routeKey: "detail",
      },
      threadId: "session-1",
      state,
    });

    expect(input.state).toMatchObject(state);
    expect(RunAgentInputSchema.parse(input)).toEqual(input);
  });

  it("pathname change mid-session: live snapshot route overrides thread origin routeContext", () => {
    // Chat was started on /mdl/contacts/c-1; user navigated to /mdl/tasks/t-1 mid-session.
    // The live app-shell snapshot already reflects the new route — the next run must use it.
    const state = {
      observed_at: "2026-05-19T00:00:00.000Z",
      permissions: { frontend_tools: {} },
      route: {
        module_id: "tasks",
        pathname: "/mdl/tasks/t-1",
        route_key: "detail",
      },
      sequence: 8,
      shell: { copilot_open: true },
      snapshot_id: "snapshot-2",
      version: 1 as const,
    };

    const input = buildAppsAiRunInput({
      frontendTools: [],
      message: { id: "user-1", role: "user", content: "what is this task?" },
      pathname: "/mdl/tasks/t-1",
      routeContext: {
        moduleId: "contacts",
        pathname: "/mdl/contacts/c-1",
        routeKey: "detail",
      },
      threadId: "session-1",
      state,
    });

    expect(input.state).toMatchObject({
      route: { module_id: "tasks", pathname: "/mdl/tasks/t-1" },
    });
    expect(RunAgentInputSchema.parse(input)).toEqual(input);
  });
});

describe("buildAppsAiResumeRunInput", () => {
  it("builds RunAgentInput with official resume entries only", () => {
    const input = buildAppsAiResumeRunInput({
      effort: "low",
      frontendTools: [],
      modelId: "openai/gpt-4.1-mini",
      pathname: "/mdl/engenty-copilot/chat/session-1",
      resume: [
        {
          interruptId: "int-abc123",
          payload: {
            artifact_id: "artifact-1",
            choice_id: "approve",
            choice_label: "Approve",
          },
          status: "resolved",
        },
      ],
      routeContext,
      threadId: "session-1",
      state: {},
    });

    expect(RunAgentInputSchema.parse(input)).toEqual(input);
    expect(input.messages).toEqual([]);
    expect(input.forwardedProps).toEqual({
      engenty: { effort: "low", model_id: "openai/gpt-4.1-mini" },
    });
    expect(input.resume).toEqual([
      {
        interruptId: "int-abc123",
        payload: {
          artifact_id: "artifact-1",
          choice_id: "approve",
          choice_label: "Approve",
        },
        status: "resolved",
      },
    ]);
  });
});
