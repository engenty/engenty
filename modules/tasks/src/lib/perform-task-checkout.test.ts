import { describe, expect, it, vi } from "vitest";
import { taskWorkspaceKeepObjectKey } from "./ensure-task-workspace-prefix.js";
import { performTaskCheckout } from "./perform-task-checkout.js";

const TENANT_ID = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const SPACE_ID = "55555555-5555-4555-8555-555555555555";
const RUN_ID = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

describe("performTaskCheckout", () => {
  it("prefers the task-row Space over the auth/default Space for workspace bytes", async () => {
    const taskSpace = "11111111-1111-4111-8111-111111111111";
    const checkoutTask = vi.fn(async () => ({
      id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
      identifier: "ENG-142",
      checkout_run_id: RUN_ID,
      space_id: taskSpace,
    }));
    const exists = vi.fn(async () => false);
    const upload = vi.fn(async () => undefined);

    await performTaskCheckout(
      {
        repo: { checkoutTask } as never,
        spaceId: SPACE_ID,
        storage: {
          exists,
          upload,
          download: vi.fn(),
          getUrl: vi.fn(),
        },
        tenantId: TENANT_ID,
      },
      "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
      {
        agent_session_run_id: RUN_ID,
        agent_type_key: "tasks-assist",
      }
    );

    expect(upload).toHaveBeenCalledWith(
      taskWorkspaceKeepObjectKey(TENANT_ID, taskSpace, "ENG-142"),
      expect.any(Uint8Array),
      expect.objectContaining({ upsert: false })
    );
    expect(upload).not.toHaveBeenCalledWith(
      taskWorkspaceKeepObjectKey(TENANT_ID, SPACE_ID, "ENG-142"),
      expect.anything(),
      expect.anything()
    );
  });

  it("still returns checkout when storage is unavailable", async () => {
    const task = {
      id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
      identifier: "ENG-142",
      checkout_run_id: RUN_ID,
    };
    const checkoutTask = vi.fn(async () => task);

    const result = await performTaskCheckout(
      {
        repo: { checkoutTask } as never,
        spaceId: SPACE_ID,
        storage: null,
        tenantId: TENANT_ID,
      },
      task.id,
      {
        agent_session_run_id: RUN_ID,
        agent_type_key: "tasks-assist",
      }
    );

    expect(result).toBe(task);
  });
});
