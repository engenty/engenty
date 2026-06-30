import { describe, expect, it, vi } from "vitest";
import { resolveTaskSaveErrorMessage } from "./task-lifecycle-ui.js";

describe("task-lifecycle-ui", () => {
  const translate = vi.fn((key: string) => `translated:${key}`);

  it("maps known task error codes to translated copy", () => {
    expect(
      resolveTaskSaveErrorMessage(
        new Error("task_terminal_immutable"),
        translate,
        "edit.saveFailed"
      )
    ).toBe("translated:errors.taskTerminalImmutable");
    expect(
      resolveTaskSaveErrorMessage(
        new Error("task_status_transition_denied"),
        translate,
        "edit.saveFailed"
      )
    ).toBe("translated:errors.taskStatusTransitionDenied");
  });

  it("falls back for unknown task codes and non-error values", () => {
    expect(
      resolveTaskSaveErrorMessage(
        new Error("task_unknown_code"),
        translate,
        "edit.saveFailed"
      )
    ).toBe("translated:edit.saveFailed");
    expect(
      resolveTaskSaveErrorMessage("nope", translate, "edit.saveFailed")
    ).toBe("translated:edit.saveFailed");
  });

  it("keeps human-readable non-task error messages", () => {
    expect(
      resolveTaskSaveErrorMessage(
        new Error("Network request failed"),
        translate,
        "edit.saveFailed"
      )
    ).toBe("Network request failed");
  });
});
