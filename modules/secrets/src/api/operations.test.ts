import type {
  PluginServerApi,
  PluginServerOperation,
} from "@engenty/plugin-sdk";
import { describe, expect, it } from "vitest";
import { registerSecretsOperations } from "./operations.js";

describe("secrets operations spacePolicy", () => {
  it("classifies every vault operation as user_owned", () => {
    const operations: PluginServerOperation[] = [];
    registerSecretsOperations(
      {
        registerOperation: (operation: PluginServerOperation) => {
          operations.push(operation);
        },
      } as PluginServerApi,
      (_auth) => {
        throw new Error("db unused at registration");
      }
    );

    expect(operations.map((op) => op.operationId)).toEqual([
      "secrets_list",
      "secrets_create",
      "secrets_reveal",
      "secrets_update",
      "secrets_delete",
      "secrets_move",
    ]);
    expect(
      operations.every((op) => op.spacePolicy?.kind === "user_owned")
    ).toBe(true);
  });
});
