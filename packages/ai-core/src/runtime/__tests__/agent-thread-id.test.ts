import { describe, expect, it } from "vitest";
import { isAgentThreadId } from "../agent-thread-id.js";

describe("isAgentThreadId", () => {
  it("accepts RFC UUID strings", () => {
    expect(isAgentThreadId("550e8400-e29b-41d4-a716-446655440000")).toBe(true);
    expect(isAgentThreadId("019e24a1-3ecf-7aa8-bc8e-30081b003458")).toBe(true);
  });

  it("trims surrounding whitespace", () => {
    expect(isAgentThreadId(" 550e8400-e29b-41d4-a716-446655440000 ")).toBe(
      true
    );
  });

  it("rejects non-uuid ids", () => {
    expect(isAgentThreadId("new")).toBe(false);
    expect(isAgentThreadId("not-a-uuid")).toBe(false);
    expect(isAgentThreadId("")).toBe(false);
  });
});
