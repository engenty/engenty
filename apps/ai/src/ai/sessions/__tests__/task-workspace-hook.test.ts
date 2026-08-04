import { describe, expect, it, vi } from "vitest";

import { EngentyCoreHttpError } from "../../core-http-client.js";
import type { AiSessionError } from "../../errors.js";
import {
  extractTaskRouteFields,
  prepareTaskWorkspaceForRun,
  resolveTaskBinding,
} from "../task-workspace-hook.js";

const tenantId = "00000000-0000-4000-8000-000000000001";
const taskId = "11111111-1111-4111-8111-111111111111";
const runId = "22222222-2222-4222-8222-222222222222";
const threadId = "33333333-3333-4333-8333-333333333333";

describe("task-workspace-hook", () => {
  it("resolves binding from nested copilot scope", () => {
    const binding = resolveTaskBinding({
      routeContext: {
        moduleId: "tasks",
        routeKey: "detail",
        scope: {
          entity_id: taskId,
          task_identifier: "ENG-142",
        },
      },
    });

    expect(binding).toEqual({
      identifier: "ENG-142",
      taskId,
      workspaceKey: "task:ENG-142",
    });
  });

  it("extracts task fields from flat and scoped route context", () => {
    expect(
      extractTaskRouteFields({
        scope: {
          entity_id: taskId,
          task_identifier: "ENG-9",
        },
      })
    ).toEqual({
      identifier: "ENG-9",
      taskId,
    });
  });

  it("auto-checkouts, updates session, and returns the resolved binding", async () => {
    const invokeOperation = vi.fn(async (operationId: string) => {
      if (operationId === "tasks_checkout") {
        return { id: taskId, identifier: "ENG-142" };
      }
      throw new Error(`unexpected operation ${operationId}`);
    });
    const updateSession = vi.fn(async () => undefined);

    const result = await prepareTaskWorkspaceForRun({
      agentId: "engenty.copilot",
      invokeOperation,
      routeContext: {
        moduleId: "tasks",
        routeKey: "detail",
        scope: {
          entity_id: taskId,
          task_identifier: "ENG-142",
        },
      },
      runId,
      scope: {
        tenantId,
        credential: { kind: "user", token: "token" },
        userId: "44444444-4444-4444-8444-444444444444",
      },
      threadId,
      updateSession,
      workspaceKey: null,
    });

    expect(invokeOperation).toHaveBeenCalledWith("tasks_checkout", {
      agent_run_id: runId,
      agent_id: "engenty.copilot",
      id: taskId,
    });
    expect(updateSession).toHaveBeenCalledWith({
      routeContext: expect.objectContaining({
        task_id: taskId,
        task_identifier: "ENG-142",
        scope: expect.objectContaining({
          task_id: taskId,
          task_identifier: "ENG-142",
        }),
      }),
      workspaceKey: "task:ENG-142",
    });
    expect(result.binding).toEqual({
      identifier: "ENG-142",
      taskId,
      workspaceKey: "task:ENG-142",
    });
  });

  it("surfaces checkout conflict as AiSessionError", async () => {
    const invokeOperation = vi.fn(async (operationId: string) => {
      if (operationId === "tasks_checkout") {
        throw new EngentyCoreHttpError(
          "task_checkout_conflict",
          409,
          "task_checkout_conflict",
          { checkout_run_id: "55555555-5555-4555-8555-555555555555" }
        );
      }
      throw new Error(`unexpected operation ${operationId}`);
    });

    await expect(
      prepareTaskWorkspaceForRun({
        agentId: "engenty.copilot",
        invokeOperation,
        routeContext: {
          scope: {
            entity_id: taskId,
            task_identifier: "ENG-142",
          },
        },
        runId,
        scope: {
          tenantId,
          credential: { kind: "user", token: "token" },
          userId: "44444444-4444-4444-8444-444444444444",
        },
        threadId,
        updateSession: vi.fn(async () => undefined),
        workspaceKey: null,
      })
    ).rejects.toMatchObject({
      code: "agent_threads.taskCheckoutConflict",
    } satisfies Partial<AiSessionError>);
  });
});
