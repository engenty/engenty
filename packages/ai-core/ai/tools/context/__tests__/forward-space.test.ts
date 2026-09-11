import { describe, expect, it, vi } from "vitest";
import { forwardSpaceOnGatewayCall } from "../forward-space.js";
import type { ToolExecutionContext } from "../types.js";

describe("forwardSpaceOnGatewayCall", () => {
  it("forwards spaceId and spaceConfined on gateway calls", async () => {
    const call = vi.fn(async () => ({ ok: true }));
    const ctx: Pick<
      ToolExecutionContext,
      "callGatewayMethod" | "spaceConfined" | "spaceId"
    > = {
      callGatewayMethod: call,
      spaceConfined: true,
      spaceId: "019fe8ec-0000-0000-0000-000000000001",
    };
    const wrapped = forwardSpaceOnGatewayCall(ctx);
    await wrapped?.("projects_list", { page: 1 });
    expect(call).toHaveBeenCalledWith(
      "projects_list",
      { page: 1 },
      {
        auth: {
          spaceConfined: true,
          spaceId: "019fe8ec-0000-0000-0000-000000000001",
        },
      }
    );
  });

  it("does not invent a Space when the context is tenant-global", async () => {
    const call = vi.fn(async () => ({ ok: true }));
    const wrapped = forwardSpaceOnGatewayCall({
      callGatewayMethod: call,
      spaceId: null,
    });
    await wrapped?.("contacts_list", {});
    expect(call).toHaveBeenCalledWith("contacts_list", {});
  });

  it("reads spaceId from getters at call time, not at wrap time", async () => {
    const call = vi.fn(async () => ({ ok: true }));
    let spaceId: string | null = null;
    const wrapped = forwardSpaceOnGatewayCall({
      callGatewayMethod: call,
      get spaceId() {
        return spaceId;
      },
    });
    spaceId = "019fe8ec-0000-0000-0000-000000000001";
    await wrapped?.("projects_list", {});
    expect(call).toHaveBeenCalledWith(
      "projects_list",
      {},
      {
        auth: { spaceId },
      }
    );
  });
});
