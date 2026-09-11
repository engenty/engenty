import type {
  PluginServerApi,
  PluginServerOperation,
} from "@engenty/plugin-sdk";
import { describe, expect, it } from "vitest";
import { registerConnectionsOperations } from "./operations.js";

function collectOperations() {
  const operations: PluginServerOperation[] = [];
  const api = {
    registerOperation: (operation: PluginServerOperation) => {
      operations.push(operation);
    },
  } as Pick<PluginServerApi, "registerOperation">;
  registerConnectionsOperations(
    api as PluginServerApi,
    () => {
      throw new Error("repo unused at registration");
    },
    {
      onApprovalDecided: async () => undefined,
      settings: { clientEnv: () => async () => undefined },
    }
  );
  return operations;
}

describe("connections operations spacePolicy", () => {
  it("declares account_mounted on every operation", () => {
    const operations = collectOperations();
    expect(operations.length).toBeGreaterThan(0);
    expect(
      operations.every((op) => op.spacePolicy?.kind === "account_mounted")
    ).toBe(true);
  });

  it("keys the mount check off connection_id when the input names one", () => {
    const byId = Object.fromEntries(
      collectOperations().map((op) => [op.operationId, op.spacePolicy])
    );
    expect(byId.connections_files_write).toEqual({
      connectionInputKey: "connection_id",
      kind: "account_mounted",
    });
    expect(byId.connections_disconnect).toEqual(byId.connections_files_write);
    expect(byId.connections_update_settings).toEqual({
      kind: "account_mounted",
    });
    expect(byId.connections_set_policy).toEqual({
      kind: "account_mounted",
    });
    expect(byId.connections_agent_grant_set).toEqual(
      byId.connections_files_write
    );
    expect(byId.connections_catalog).toEqual({ kind: "account_mounted" });
    expect(byId.connections_list_accounts).toEqual({
      kind: "account_mounted",
    });
  });
});
