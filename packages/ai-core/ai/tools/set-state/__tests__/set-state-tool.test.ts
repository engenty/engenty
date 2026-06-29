import { describe, expect, it } from "vitest";
import { setStateToolDefinition } from "../set-state-tool.js";

describe("set_state tool", () => {
  it("echoes key+value so the harness can publish a STATE_DELTA", async () => {
    expect(setStateToolDefinition.id).toBe("set_state");
    await expect(
      setStateToolDefinition.execute({ key: "plan", value: { steps: ["a"] } })
    ).resolves.toEqual({ key: "plan", ok: true, value: { steps: ["a"] } });
  });
});
