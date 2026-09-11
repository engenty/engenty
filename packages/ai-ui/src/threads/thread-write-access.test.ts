import { describe, expect, it } from "vitest";
import { isThreadWritableByViewer } from "./thread-write-access.js";

describe("isThreadWritableByViewer", () => {
  it("lets the owner write", () => {
    expect(
      isThreadWritableByViewer({ created_by_user_id: "user-1" }, "user-1")
    ).toBe(true);
  });

  it("keeps somebody else's Copilot thread read-only", () => {
    expect(
      isThreadWritableByViewer(
        {
          agent_id: "engenty.copilot",
          created_by_user_id: "user-2",
          space_id: "space-1",
        },
        "user-1"
      )
    ).toBe(false);
  });

  it("opens a task-bound thread for a task reader", () => {
    expect(
      isThreadWritableByViewer(
        {
          created_by_user_id: null,
          route_context: { task_id: "task-1" },
        },
        "user-1"
      )
    ).toBe(true);
  });

  it("opens a shared specialist thread in a space", () => {
    expect(
      isThreadWritableByViewer(
        {
          agent_id: "engenty.coordinator",
          created_by_user_id: "user-2",
          space_id: "space-1",
        },
        "user-1"
      )
    ).toBe(true);
  });

  it("does not treat an unknown viewer as the owner of an ownerless thread", () => {
    expect(isThreadWritableByViewer({ created_by_user_id: null }, null)).toBe(
      false
    );
    expect(
      isThreadWritableByViewer({ created_by_user_id: undefined }, undefined)
    ).toBe(false);
  });

  it("stays writable while nothing is loaded", () => {
    expect(isThreadWritableByViewer(null, "user-1")).toBe(true);
    expect(isThreadWritableByViewer(undefined, "user-1")).toBe(true);
  });
});
