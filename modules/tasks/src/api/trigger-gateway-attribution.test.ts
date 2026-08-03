// A trigger's `created_by_user_id` is a core.users FK — on the trigger row and
// on every task it materializes (20260702000100_plugin_tasks_triggers.sql:24,59).
// The scheduler drives exactly this path as the AI service principal, whose
// principalId is a core.service_credential id, so writing it raw makes the
// insert fail its FK and the fire records nothing.
//
// These pin the attribution for both principal kinds. If someone reverts to
// `auth.principalId ?? null`, the service cases fail here rather than silently
// in prod.

import type { PluginServerOperation } from "@engenty/plugin-sdk";
import { describe, expect, it, vi } from "vitest";
import { defaultAuth, makeMockApi } from "./test-helpers.js";
import { registerTriggerGatewayMethods } from "./trigger-gateway-methods.js";

const USER_ID = "00000000-0000-4000-8000-000000000002";
const CREDENTIAL_ID = "00000000-0000-4000-8000-0000000000ff";

function setup() {
  const createTaskTemplate = vi.fn(async () => ({ id: "tmpl-1" }));
  const createTrigger = vi.fn(async () => ({ id: "trg-1" }));
  const repo = {
    createTaskTemplate,
    createTrigger,
    // triggers_create re-reads the row it just wrote before returning.
    getTrigger: vi.fn(async () => ({ id: "trg-1", kind: "manual" })),
  } as unknown as ReturnType<
    Parameters<typeof registerTriggerGatewayMethods>[1]
  >;

  const { api, serverOperations } = makeMockApi();
  registerTriggerGatewayMethods(api, () => repo, {
    supabase: {} as never,
  } as never);

  const op = (id: string): PluginServerOperation => {
    const found = serverOperations.find((o) => o.operationId === id);
    if (!found) {
      throw new Error(`operation not registered: ${id}`);
    }
    return found;
  };
  return { createTaskTemplate, createTrigger, op };
}

function auth(principalType: "user" | "service") {
  return {
    ...defaultAuth,
    principalId: principalType === "user" ? USER_ID : CREDENTIAL_ID,
    principalType,
  };
}

const TEMPLATE_INPUT = {
  agent_type_key: "engenty.copilot",
  name: "nightly-digest",
  title: "Nightly digest",
};

describe("trigger gateway — creator attribution", () => {
  it("records the human who created a task template", async () => {
    const { createTaskTemplate, op } = setup();
    await op("task_templates_create").handler(TEMPLATE_INPUT, {
      auth: auth("user"),
    } as never);
    expect(createTaskTemplate).toHaveBeenCalledWith(expect.anything(), USER_ID);
  });

  it("records NO creator when the service principal creates one", async () => {
    // The credential id must never reach the column — null is the whole point.
    const { createTaskTemplate, op } = setup();
    await op("task_templates_create").handler(TEMPLATE_INPUT, {
      auth: auth("service"),
    } as never);
    expect(createTaskTemplate).toHaveBeenCalledWith(expect.anything(), null);
    expect(createTaskTemplate).not.toHaveBeenCalledWith(
      expect.anything(),
      CREDENTIAL_ID
    );
  });

  it("does the same for the trigger row itself", async () => {
    const { createTrigger, op } = setup();
    await op("triggers_create").handler(
      {
        kind: "manual",
        name: "Manual fire",
        task_template: TEMPLATE_INPUT,
      },
      { auth: auth("service") } as never
    );
    expect(createTrigger).toHaveBeenCalledWith(expect.anything(), null);
  });
});
