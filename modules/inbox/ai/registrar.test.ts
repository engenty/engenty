import { unregisterAiRegistration } from "@engenty/ai-core";
import { afterEach, describe, expect, it, vi } from "vitest";
import { inboxAiRegistration, inboxDynamicAiCapability } from "./registrar.js";

const noopInvokeInboxOperation = vi.fn(async () => null);

describe("inboxAiRegistration", () => {
  afterEach(() => {
    unregisterAiRegistration("inbox");
  });

  it("exposes inbox.assist with triage/connect/reply skills and Phase-1 tools", () => {
    const registration = inboxAiRegistration({
      invokeInboxOperation: noopInvokeInboxOperation,
    });
    const agent = registration.dynamic?.agent_configs?.find(
      (item) => item.id === "inbox.assist"
    );

    expect(registration.module_id).toBe("inbox");
    expect(agent).toBeTruthy();
    expect(agent?.skillIds).toEqual(
      expect.arrayContaining([
        "inbox-triage",
        "inbox-connect-account",
        "inbox-reply-and-send",
      ])
    );

    const skillNames = new Set(registration.skills?.map((skill) => skill.name));
    expect(skillNames.has("inbox-triage")).toBe(true);
    expect(skillNames.has("inbox-connect-account")).toBe(true);
    expect(skillNames.has("inbox-reply-and-send")).toBe(true);

    const capability = inboxDynamicAiCapability({
      invokeInboxOperation: noopInvokeInboxOperation,
    });
    expect(capability.tools).toHaveProperty("inbox_list_threads");
    expect(capability.tools).toHaveProperty("inbox_get_thread");
    expect(capability.tools).toHaveProperty("inbox_set_status");
    expect(capability.tools).toHaveProperty("inbox_list_accounts");
    expect(capability.tools).toHaveProperty("inbox_sync_now");
    expect(capability.tools).toHaveProperty("inbox_update_sync_settings");
  });

  it("tool execute delegates to inbox operations with the right payloads", async () => {
    const invokeInboxOperation = vi.fn(async (name: string, input: unknown) => {
      if (name === "inbox_set_status") {
        expect(input).toEqual({
          ids: ["msg-1", "msg-2"],
          status: "archived",
        });
        return { updated: 2 };
      }
      if (name === "inbox_sync_run") {
        return { connections: [] };
      }
      if (name === "inbox_threads_list") {
        expect(input).toEqual({ status: "new", limit: 10 });
        return { threads: [], total: 0 };
      }
      return null;
    });

    const capability = inboxDynamicAiCapability({ invokeInboxOperation });
    const tools = capability.tools as Record<
      string,
      { execute: (input: unknown) => Promise<unknown> }
    >;

    await expect(
      tools.inbox_set_status.execute({
        ids: ["msg-1", "msg-2"],
        status: "archived",
      })
    ).resolves.toEqual({ updated: 2 });

    await expect(tools.inbox_sync_now.execute({})).resolves.toEqual({
      connections: [],
    });
    expect(invokeInboxOperation).toHaveBeenCalledWith("inbox_sync_run", {});

    await expect(
      tools.inbox_sync_now.execute({ connection_id: "conn-1" })
    ).resolves.toEqual({ connections: [] });
    expect(invokeInboxOperation).toHaveBeenCalledWith("inbox_sync_run", {
      connection_id: "conn-1",
    });

    await expect(
      tools.inbox_list_threads.execute({ status: "new", limit: 10 })
    ).resolves.toEqual({ threads: [], total: 0 });
  });
});
