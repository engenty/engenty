import { describe, expect, it } from "vitest";
import { isAttention } from "./contracts.js";

const open = { status: "pending" } as const;

describe("isAttention", () => {
  it("takes open decisions, alerts and todos at any priority", () => {
    expect(isAttention({ ...open, class: "decision", priority: "low" })).toBe(
      true
    );
    expect(isAttention({ ...open, class: "alert", priority: "medium" })).toBe(
      true
    );
    expect(isAttention({ ...open, class: "todo", priority: "high" })).toBe(
      true
    );
  });

  it("takes an update only when priority is high or urgent", () => {
    expect(isAttention({ ...open, class: "update", priority: "low" })).toBe(
      false
    );
    expect(isAttention({ ...open, class: "update", priority: "medium" })).toBe(
      false
    );
    expect(isAttention({ ...open, class: "update", priority: "high" })).toBe(
      true
    );
    expect(isAttention({ ...open, class: "update", priority: "urgent" })).toBe(
      true
    );
  });

  it("drops a record once it is resolved or dismissed", () => {
    expect(
      isAttention({ class: "decision", priority: "high", status: "resolved" })
    ).toBe(false);
    expect(
      isAttention({ class: "update", priority: "urgent", status: "dismissed" })
    ).toBe(false);
  });
});
