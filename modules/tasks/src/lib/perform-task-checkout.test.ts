import { describe, expect, it, vi } from "vitest";
import { performTaskCheckout } from "./perform-task-checkout.js";

const TENANT_ID = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const RUN_ID = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

describe("performTaskCheckout", () => {
  it("ensures workspace prefix after successful checkout", async () => {
    const checkoutTask = vi.fn(async () => ({
      id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
      identifier: "ENG-142",
      checkout_run_id: RUN_ID,
    }));
    const exists = vi.fn(async () => false);
    const upload = vi.fn(async () => undefined);

    await performTaskCheckout(
      {
        repo: { checkoutTask } as never,
        storage: { exists, upload },
        tenantId: TENANT_ID,
      },
      "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
      {
        agent_session_run_id: RUN_ID,
        agent_type_key: "tasks-assist",
      }
    );

    expect(checkoutTask).toHaveBeenCalledOnce();
    expect(upload).toHaveBeenCalledOnce();
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
