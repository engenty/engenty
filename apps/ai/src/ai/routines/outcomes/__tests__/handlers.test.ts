import { describe, expect, it, vi } from "vitest";
import type { RoutineOutcomeRow } from "../../../../dal/routines/routine-outcome-store.js";
import type { RoutineRow } from "../../../../dal/routines/routine-store.js";
import type { OutcomeEnvelope } from "../envelope.js";
import { BUILTIN_OUTCOME_HANDLERS } from "../handlers.js";

const TENANT = "11111111-1111-4111-8111-111111111111";

function routine(): RoutineRow {
  return {
    agent_id: "mail.watch",
    approval_grants: [],
    created_at: "",
    created_by_user_id: "user-1",
    declaration_id: null,
    description: null,
    enabled: true,
    id: "33333333-3333-4333-8333-333333333333",
    last_fired_at: null,
    last_result: null,
    module_id: null,
    name: "Mail watch",
    outcome: null,
    quiet_hours: null,
    report: "desk_card",
    source: "custom",
    space_id: "44444444-4444-4444-8444-444444444444",
    tenant_id: TENANT,
    updated_at: "",
    workflow_id: "55555555-5555-4555-8555-555555555555",
    workflow_input: {},
  };
}

function envelope(): OutcomeEnvelope {
  return {
    agent_id: "mail.watch",
    artifact: { id: "art-1", title: "Brief" },
    awaiting_review: false,
    body: "hello",
    outcome: "ok",
    reason: null,
    routine_id: routine().id,
    routine_name: "Mail watch",
    run_id: "22222222-2222-4222-8222-222222222222",
    space_id: routine().space_id,
    status: "completed",
    summary: "hello",
  };
}

function binding(
  providerId: string,
  config: Record<string, unknown> = {}
): RoutineOutcomeRow {
  return {
    config,
    created_at: "",
    enabled: true,
    id: "66666666-6666-4666-8666-666666666666",
    mode: "always",
    provider_id: providerId,
    routine_id: routine().id,
    tenant_id: TENANT,
    updated_at: "",
  };
}

describe("builtin outcome handlers", () => {
  it("webhook POSTs envelope + payload and sends the secret header", async () => {
    const fetchImpl = vi.fn<typeof fetch>(
      async () => new Response(null, { status: 204 })
    );
    await BUILTIN_OUTCOME_HANDLERS.webhook?.({
      artifacts: null,
      binding: binding("webhook", {
        secret: "s3cret",
        url: "https://hooks.example.test/r",
      }),
      envelope: envelope(),
      fetchImpl,
      invoke: async () => null,
      payload: { extra: 1 },
      requestId: envelope().run_id,
      routine: routine(),
      threadStore: null,
      workflowRuns: null,
    });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const init = fetchImpl.mock.calls[0]?.[1];
    expect(init?.method).toBe("POST");
    const headers = new Headers(init?.headers);
    expect(headers.get("x-engenty-webhook-secret")).toBe("s3cret");
    const body = JSON.parse(String(init?.body)) as {
      envelope: { routine_id: string };
      payload: { extra: number };
    };
    expect(body.envelope.routine_id).toBe(routine().id);
    expect(body.payload.extra).toBe(1);
  });

  it("artifact.pointer records the artifact on the fire", async () => {
    const setArtifactPointer = vi.fn(async () => undefined);
    const ctxEnvelope = envelope();
    ctxEnvelope.artifact = null;
    await BUILTIN_OUTCOME_HANDLERS["artifact.pointer"]?.({
      artifacts: {
        get: async () =>
          ({
            artifact: { title: "From store" },
          }) as never,
      },
      binding: binding("artifact.pointer", { location: "Drive" }),
      envelope: ctxEnvelope,
      invoke: async () => null,
      payload: { artifact_id: "art-9" },
      requestId: "req-1",
      routine: routine(),
      threadStore: null,
      workflowRuns: { setArtifactPointer },
    });
    expect(setArtifactPointer).toHaveBeenCalledWith({
      id: "req-1",
      pointer: { id: "art-9", title: "From store" },
      tenantId: TENANT,
    });
    expect(ctxEnvelope.artifact).toEqual({ id: "art-9", title: "From store" });
  });

  it("email sends through gmail_send_message after listing accounts", async () => {
    const invoke = vi.fn(async (operationId: string) => {
      if (operationId === "connections_list_accounts") {
        return { accounts: [{ connection_id: "c1" }] };
      }
      return { sent: true };
    });
    await BUILTIN_OUTCOME_HANDLERS.email?.({
      artifacts: null,
      binding: binding("email", { to: "ops@example.test" }),
      envelope: envelope(),
      invoke,
      payload: { subject: "Mail watch" },
      requestId: envelope().run_id,
      routine: routine(),
      threadStore: null,
      workflowRuns: null,
    });
    expect(invoke).toHaveBeenCalledWith("gmail_send_message", {
      body_text: "hello",
      subject: "Mail watch",
      to: ["ops@example.test"],
    });
  });
});
