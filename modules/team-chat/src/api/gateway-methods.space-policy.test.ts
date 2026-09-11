import type {
  PluginServerApi,
  PluginServerOperation,
} from "@engenty/plugin-sdk";
import { describe, expect, it } from "vitest";
import { registerTeamChatGatewayMethods } from "./gateway-methods.js";

describe("registerTeamChatGatewayMethods spacePolicy", () => {
  it("declares tenant_shared channel operations without inventing space_id", () => {
    const serverOperations: PluginServerOperation[] = [];
    const api = {
      registerOperation: (operation: PluginServerOperation) => {
        serverOperations.push(operation);
      },
    } as PluginServerApi;

    registerTeamChatGatewayMethods(api, {
      repoForAuth: () => ({}) as never,
    });

    expect(
      serverOperations.find(
        (op) => op.operationId === "team_chat_conversations_list"
      )?.spacePolicy
    ).toEqual({ kind: "tenant_shared" });
    expect(
      serverOperations.find(
        (op) => op.operationId === "team_chat_search_messages"
      )?.spacePolicy
    ).toEqual({ kind: "tenant_shared" });
  });
});
