import { describe, expect, it, vi } from "vitest";
import { EngentyCoreHttpError } from "../core-http-client.js";
import { mountAgentOnSpaces } from "../space-mount-agent.js";

describe("mountAgentOnSpaces", () => {
  it("mounts each unique space as an agent resource", async () => {
    const putSpaceMount = vi.fn().mockResolvedValue({});
    const results = await mountAgentOnSpaces(
      { putSpaceMount },
      "sales.researcher",
      [
        "00000000-0000-4000-8000-000000000001",
        "00000000-0000-4000-8000-000000000001",
        "00000000-0000-4000-8000-000000000002",
      ]
    );
    expect(putSpaceMount).toHaveBeenCalledTimes(2);
    expect(putSpaceMount).toHaveBeenCalledWith(
      "00000000-0000-4000-8000-000000000001",
      { resource_key: "sales.researcher", resource_type: "agent" }
    );
    expect(results.every((row) => row.ok)).toBe(true);
  });

  it("keeps the agent id and reports a failed space instead of throwing", async () => {
    const putSpaceMount = vi.fn(async (spaceId: string) => {
      if (spaceId.endsWith("2")) {
        throw new EngentyCoreHttpError("forbidden", 403, "forbidden");
      }
    });
    const results = await mountAgentOnSpaces(
      { putSpaceMount },
      "sales.researcher",
      [
        "00000000-0000-4000-8000-000000000001",
        "00000000-0000-4000-8000-000000000002",
      ]
    );
    expect(results).toEqual([
      { ok: true, spaceId: "00000000-0000-4000-8000-000000000001" },
      {
        error: "forbidden",
        ok: false,
        spaceId: "00000000-0000-4000-8000-000000000002",
      },
    ]);
  });
});
