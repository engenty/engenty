import type { FrontendToolCallRequest, JsonValue } from "@engenty/ag-ui-bridge";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  clearPendingVoiceConfirmation,
  getPendingVoiceConfirmation,
  resolvePendingVoiceConfirmation,
  setPendingVoiceConfirmation,
  subscribePendingVoiceConfirmation,
  type VoicePendingConfirmation,
} from "./voice-pending-confirmation.js";

function pending(callId = "call-1"): VoicePendingConfirmation {
  return {
    callId,
    input: { foo: "bar" },
    kind: "frontend_tool",
    request: { arguments: { foo: "bar" }, callId, name: "delete_record" },
    title: "Delete record",
    toolName: "delete_record",
  };
}

function backendPending(callId = "call-b"): VoicePendingConfirmation {
  return {
    artifactId: "tool-approval|contacts_contact_create",
    callId,
    choices: [
      { id: "approve_once", label: "Approve once" },
      { id: "approve_always", label: "Approve always (this chat)" },
      { id: "deny", label: "Deny" },
    ],
    input: { name: "Ada" },
    kind: "backend_approval",
    operationId: "contacts_contact_create",
    request: {
      arguments: { id: "contacts_contact_create", input: { name: "Ada" } },
      callId,
      name: "engenty_tool_execute",
    },
    threadId: "11111111-1111-1111-1111-111111111111",
    title: "Approve contacts_contact_create?",
  };
}

function fieldSuggestionsPending(callId = "call-f"): VoicePendingConfirmation {
  return {
    callId,
    contextId: "contact-1",
    contextType: "contacts.contact",
    input: {},
    kind: "field_suggestions",
    request: { arguments: {}, callId, name: "propose_updates" },
    suggestions: [
      { field: "address_zip", value: "8952" },
      { field: "address_city", value: "Irdning" },
    ],
    title: "Review suggested updates",
  };
}

describe("voice pending confirmation store", () => {
  afterEach(() => {
    clearPendingVoiceConfirmation();
  });

  it("sets, reads and notifies subscribers", () => {
    const listener = vi.fn();
    const unsubscribe = subscribePendingVoiceConfirmation(listener);
    setPendingVoiceConfirmation(pending());
    const current = getPendingVoiceConfirmation();
    expect(current?.kind).toBe("frontend_tool");
    expect(current?.title).toBe("Delete record");
    expect(listener).toHaveBeenCalledTimes(1);
    unsubscribe();
  });

  it("clear only matches when the callId matches", () => {
    setPendingVoiceConfirmation(pending("call-1"));
    expect(clearPendingVoiceConfirmation("other")).toBeNull();
    expect(getPendingVoiceConfirmation()).not.toBeNull();
    expect(clearPendingVoiceConfirmation("call-1")?.callId).toBe("call-1");
    expect(getPendingVoiceConfirmation()).toBeNull();
  });
});

describe("resolvePendingVoiceConfirmation", () => {
  afterEach(() => {
    clearPendingVoiceConfirmation();
  });

  it("executes the gated tool on approval", async () => {
    setPendingVoiceConfirmation(pending());
    const executeFrontendTool = vi.fn(
      (_request: FrontendToolCallRequest): JsonValue => ({ ok: true })
    );
    const outcome = await resolvePendingVoiceConfirmation({
      approved: true,
      executeFrontendTool,
      runId: "thread-1",
    });
    expect(executeFrontendTool).toHaveBeenCalledTimes(1);
    expect(outcome).toEqual({
      result: { ok: true },
      status: "approved",
      tool: "delete_record",
    });
    expect(getPendingVoiceConfirmation()).toBeNull();
  });

  it("does not execute on rejection", async () => {
    setPendingVoiceConfirmation(pending());
    const executeFrontendTool = vi.fn();
    const outcome = await resolvePendingVoiceConfirmation({
      approved: false,
      executeFrontendTool,
      runId: "thread-1",
    });
    expect(executeFrontendTool).not.toHaveBeenCalled();
    expect(outcome).toEqual({ status: "rejected", tool: "delete_record" });
  });

  it("returns no_pending when nothing is parked", async () => {
    const outcome = await resolvePendingVoiceConfirmation({
      approved: true,
      executeFrontendTool: vi.fn(),
      runId: "thread-1",
    });
    expect(outcome).toEqual({ status: "no_pending" });
  });

  it("is first-wins: a racing second resolve finds nothing", async () => {
    setPendingVoiceConfirmation(pending());
    const executeFrontendTool = vi.fn(
      (_request: FrontendToolCallRequest): JsonValue => ({ ok: true })
    );
    const [first, second] = await Promise.all([
      resolvePendingVoiceConfirmation({
        approved: true,
        executeFrontendTool,
        runId: "thread-1",
      }),
      resolvePendingVoiceConfirmation({
        approved: true,
        executeFrontendTool,
        runId: "thread-1",
      }),
    ]);
    expect(executeFrontendTool).toHaveBeenCalledTimes(1);
    const statuses = [first.status, second.status].sort();
    expect(statuses).toEqual(["approved", "no_pending"]);
  });
});

describe("resolvePendingVoiceConfirmation — backend approval", () => {
  afterEach(() => {
    clearPendingVoiceConfirmation();
  });

  it("persists an approve_once grant then re-invokes the op", async () => {
    setPendingVoiceConfirmation(backendPending());
    const approveBackendTool = vi.fn(async () => ({ granted: true }));
    const executeBackendTool = vi.fn(async () => ({ ok: true, data: {} }));
    const outcome = await resolvePendingVoiceConfirmation({
      approved: true,
      approveBackendTool,
      executeBackendTool,
      executeFrontendTool: vi.fn(),
      runId: "thread-1",
    });
    expect(approveBackendTool).toHaveBeenCalledWith({
      decision: "approve_once",
      operationId: "contacts_contact_create",
      threadId: "11111111-1111-1111-1111-111111111111",
    });
    expect(executeBackendTool).toHaveBeenCalledTimes(1);
    expect(outcome.status).toBe("approved");
  });

  it("uses approve_always when always is set", async () => {
    setPendingVoiceConfirmation(backendPending());
    const approveBackendTool = vi.fn(async () => ({ granted: true }));
    await resolvePendingVoiceConfirmation({
      always: true,
      approved: true,
      approveBackendTool,
      executeBackendTool: vi.fn(async () => ({})),
      executeFrontendTool: vi.fn(),
      runId: "thread-1",
    });
    expect(approveBackendTool).toHaveBeenCalledWith(
      expect.objectContaining({ decision: "approve_always" })
    );
  });

  it("denies without re-invoking the op", async () => {
    setPendingVoiceConfirmation(backendPending());
    const approveBackendTool = vi.fn(async () => ({ granted: false }));
    const executeBackendTool = vi.fn();
    const outcome = await resolvePendingVoiceConfirmation({
      approved: false,
      approveBackendTool,
      executeBackendTool,
      executeFrontendTool: vi.fn(),
      runId: "thread-1",
    });
    expect(approveBackendTool).toHaveBeenCalledWith(
      expect.objectContaining({ decision: "deny" })
    );
    expect(executeBackendTool).not.toHaveBeenCalled();
    expect(outcome.status).toBe("rejected");
  });
});

describe("resolvePendingVoiceConfirmation — field suggestions", () => {
  afterEach(() => {
    clearPendingVoiceConfirmation();
  });

  it("applies all suggestions when no explicit selection (voice approve)", async () => {
    setPendingVoiceConfirmation(fieldSuggestionsPending());
    const applyFieldUpdates = vi.fn(async () => ({ applied: 2 }));
    const outcome = await resolvePendingVoiceConfirmation({
      applyFieldUpdates,
      approved: true,
      executeFrontendTool: vi.fn(),
      runId: "thread-1",
    });
    expect(applyFieldUpdates).toHaveBeenCalledWith({
      approved: [
        { field: "address_zip", value: "8952" },
        { field: "address_city", value: "Irdning" },
      ],
      contextId: "contact-1",
      contextType: "contacts.contact",
    });
    expect(outcome.status).toBe("approved");
  });

  it("applies only the explicitly approved fields (click selection)", async () => {
    setPendingVoiceConfirmation(fieldSuggestionsPending());
    const applyFieldUpdates = vi.fn(async () => ({ applied: 1 }));
    await resolvePendingVoiceConfirmation({
      applyFieldUpdates,
      approved: true,
      approvedFields: [{ field: "address_zip", value: "8952" }],
      executeFrontendTool: vi.fn(),
      runId: "thread-1",
    });
    expect(applyFieldUpdates).toHaveBeenCalledWith(
      expect.objectContaining({
        approved: [{ field: "address_zip", value: "8952" }],
      })
    );
  });

  it("does not apply on rejection", async () => {
    setPendingVoiceConfirmation(fieldSuggestionsPending());
    const applyFieldUpdates = vi.fn();
    const outcome = await resolvePendingVoiceConfirmation({
      applyFieldUpdates,
      approved: false,
      executeFrontendTool: vi.fn(),
      runId: "thread-1",
    });
    expect(applyFieldUpdates).not.toHaveBeenCalled();
    expect(outcome.status).toBe("rejected");
  });
});
