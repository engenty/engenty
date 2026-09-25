import { describe, expect, it, vi } from "vitest";
import type { RoutineOutcomeDeliveryStore } from "../../../../dal/routines/routine-outcome-delivery-store.js";
import type { RoutineOutcomeRow } from "../../../../dal/routines/routine-outcome-store.js";
import type { RoutineRow } from "../../../../dal/routines/routine-store.js";
import {
  deliverOutcome,
  dispatchSettleOutcomes,
  needsFailureFloor,
} from "../dispatch.js";
import type { OutcomeEnvelope } from "../envelope.js";
import { NOTIFICATION_HIGH_PROVIDER_ID } from "../ids.js";

const TENANT = "11111111-1111-4111-8111-111111111111";
const RUN = "22222222-2222-4222-8222-222222222222";
const ROUTINE = "33333333-3333-4333-8333-333333333333";

function routine(patch: Partial<RoutineRow> = {}): RoutineRow {
  return {
    agent_id: "mail.watch",
    approval_grants: [],
    created_at: "",
    created_by_user_id: "user-1",
    declaration_id: null,
    description: null,
    enabled: true,
    id: ROUTINE,
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
    ...patch,
  };
}

function binding(patch: Partial<RoutineOutcomeRow> = {}): RoutineOutcomeRow {
  return {
    config: {},
    created_at: "",
    enabled: true,
    id: "66666666-6666-4666-8666-666666666666",
    mode: "always",
    provider_id: "webhook",
    routine_id: ROUTINE,
    tenant_id: TENANT,
    updated_at: "",
    ...patch,
  };
}

function envelope(patch: Partial<OutcomeEnvelope> = {}): OutcomeEnvelope {
  return {
    agent_id: "mail.watch",
    artifact: null,
    awaiting_review: false,
    body: "done",
    outcome: "ok",
    reason: null,
    routine_id: ROUTINE,
    routine_name: "Mail watch",
    run_id: RUN,
    space_id: "44444444-4444-4444-8444-444444444444",
    status: "completed",
    summary: "done",
    ...patch,
  };
}

function memoryDeliveries(): RoutineOutcomeDeliveryStore {
  const rows: {
    error: string | null;
    id: string;
    idempotency_key: string;
    outcome_id: string;
    run_id: string;
    status: "pending" | "sent" | "failed";
    tenant_id: string;
  }[] = [];
  let n = 0;
  return {
    async claim(input) {
      const existing = rows.find(
        (row) =>
          row.run_id === input.runId &&
          row.outcome_id === input.outcomeId &&
          row.idempotency_key === input.idempotencyKey
      );
      if (existing) {
        return { created: false, row: existing as never };
      }
      n += 1;
      const row = {
        created_at: "",
        error: null,
        id: `d${n}`,
        idempotency_key: input.idempotencyKey,
        outcome_id: input.outcomeId,
        run_id: input.runId,
        status: "pending" as const,
        tenant_id: input.tenantId,
        updated_at: "",
      };
      rows.push(row);
      return { created: true, row };
    },
    async listForRun(input) {
      return rows.filter((row) => row.run_id === input.runId) as never;
    },
    async mark(input) {
      const row = rows.find((item) => item.id === input.id);
      if (!row) {
        throw new Error("missing");
      }
      row.status = input.status;
      row.error = input.error ?? null;
      return row as never;
    },
  };
}

const webhookProvider = {
  configSchema: { type: "object" },
  description: "hook",
  id: "webhook",
  label: "Webhook",
  moduleId: "ai",
  payloadSchema: { type: "object" },
};

describe("needsFailureFloor", () => {
  it("covers crash and bad work verdicts", () => {
    expect(needsFailureFloor({ status: "failed" })).toBe(true);
    expect(
      needsFailureFloor({ outcome: "rejected", status: "completed" })
    ).toBe(true);
    expect(needsFailureFloor({ outcome: "ok", status: "completed" })).toBe(
      false
    );
  });
});

describe("deliverOutcome", () => {
  it("is idempotent on the same key after a successful send", async () => {
    const deliveries = memoryDeliveries();
    const handler = vi.fn(async () => undefined);
    const first = await deliverOutcome({
      binding: binding(),
      deliveries,
      envelope: envelope(),
      handlers: { webhook: handler },
      idempotencyKey: "settle",
      invoke: async () => null,
      provider: webhookProvider,
      requestId: RUN,
      routine: routine(),
      threadStore: null,
      artifacts: null,
      workflowRuns: null,
    });
    const second = await deliverOutcome({
      binding: binding(),
      deliveries,
      envelope: envelope(),
      handlers: { webhook: handler },
      idempotencyKey: "settle",
      invoke: async () => null,
      provider: webhookProvider,
      requestId: RUN,
      routine: routine(),
      threadStore: null,
      artifacts: null,
      workflowRuns: null,
    });
    expect(first).toEqual({ already: false, ok: true });
    expect(second).toEqual({ already: true, ok: true });
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it("retries a failed claim with the same key", async () => {
    const deliveries = memoryDeliveries();
    const handler = vi
      .fn()
      .mockRejectedValueOnce(new Error("boom"))
      .mockResolvedValueOnce(undefined);
    const first = await deliverOutcome({
      artifacts: null,
      binding: binding(),
      deliveries,
      envelope: envelope(),
      handlers: { webhook: handler },
      idempotencyKey: "settle",
      invoke: async () => null,
      provider: webhookProvider,
      requestId: RUN,
      routine: routine(),
      threadStore: null,
      workflowRuns: null,
    });
    const second = await deliverOutcome({
      artifacts: null,
      binding: binding(),
      deliveries,
      envelope: envelope(),
      handlers: { webhook: handler },
      idempotencyKey: "settle",
      invoke: async () => null,
      provider: webhookProvider,
      requestId: RUN,
      routine: routine(),
      threadStore: null,
      workflowRuns: null,
    });
    expect(first).toMatchObject({ already: false, ok: false, error: "boom" });
    expect(second).toEqual({ already: false, ok: true });
    expect(handler).toHaveBeenCalledTimes(2);
  });

  it("plugin providers invoke operationId instead of an in-process handler", async () => {
    const invoke = vi.fn(async () => ({ ok: true }));
    const result = await deliverOutcome({
      artifacts: null,
      binding: binding({ provider_id: "remote.whatsapp" }),
      deliveries: memoryDeliveries(),
      envelope: envelope(),
      idempotencyKey: "settle",
      invoke,
      provider: {
        configSchema: { type: "object" },
        description: "wa",
        id: "remote.whatsapp",
        label: "WhatsApp",
        moduleId: "remote",
        operationId: "remote_enqueue_outbound",
        payloadSchema: { type: "object" },
      },
      requestId: RUN,
      routine: routine(),
      threadStore: null,
      workflowRuns: null,
    });
    expect(result).toEqual({ already: false, ok: true });
    expect(invoke).toHaveBeenCalledWith(
      "remote_enqueue_outbound",
      expect.objectContaining({
        config: {},
        payload: {},
      })
    );
  });
});

describe("dispatchSettleOutcomes", () => {
  it("fires always bindings and skips agent-mode ones", async () => {
    const deliveries = memoryDeliveries();
    const always = vi.fn(async () => undefined);
    const agent = vi.fn(async () => undefined);
    const alwaysRow = binding({
      id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      mode: "always",
      provider_id: "desk.chat",
    });
    const agentRow = binding({
      id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
      mode: "agent",
      provider_id: "notification.high",
    });
    const result = await dispatchSettleOutcomes({
      bindings: [alwaysRow, agentRow],
      deliveries,
      envelope: envelope(),
      handlers: {
        "desk.chat": always,
        "notification.high": agent,
      },
      invoke: async () => null,
      requestId: RUN,
      routine: routine(),
      threadStore: null,
      artifacts: null,
      workflowRuns: null,
    });
    expect(always).toHaveBeenCalledTimes(1);
    expect(agent).not.toHaveBeenCalled();
    expect(result.needsLegacyDeskFloor).toBe(false);
  });

  it("failure floor fires notification.high when the agent called nothing", async () => {
    const deliveries = memoryDeliveries();
    const high = vi.fn(async () => undefined);
    const highRow = binding({
      mode: "agent",
      provider_id: NOTIFICATION_HIGH_PROVIDER_ID,
    });
    const result = await dispatchSettleOutcomes({
      bindings: [highRow],
      deliveries,
      envelope: envelope({ outcome: "needs_attention", status: "completed" }),
      handlers: { [NOTIFICATION_HIGH_PROVIDER_ID]: high },
      invoke: async () => null,
      requestId: RUN,
      routine: routine(),
      threadStore: null,
      artifacts: null,
      workflowRuns: null,
    });
    expect(high).toHaveBeenCalledTimes(1);
    expect(result.needsLegacyDeskFloor).toBe(false);
  });

  it("asks for a legacy desk post when the floor hits and there is no high binding", async () => {
    const deliveries = memoryDeliveries();
    const result = await dispatchSettleOutcomes({
      bindings: [
        binding({ mode: "agent", provider_id: "notification.update" }),
      ],
      deliveries,
      envelope: envelope({ outcome: "failed", status: "completed" }),
      handlers: { "notification.update": async () => undefined },
      invoke: async () => null,
      requestId: RUN,
      routine: routine(),
      threadStore: null,
      artifacts: null,
      workflowRuns: null,
    });
    expect(result.needsLegacyDeskFloor).toBe(true);
  });
});
