/** @vitest-environment happy-dom */
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { CopilotThreadChooser } from "../copilot-thread-chooser.js";

const THREAD_A = "019e24a1-3ecf-7aa8-bc8e-30081b003458";
const THREAD_B = "019e24a1-3ecf-7aa8-bc8e-30081b003459";

describe("CopilotThreadChooser", () => {
  it("calls onSelectThread when a thread row is chosen", async () => {
    const onSelectThread = vi.fn();
    const user = userEvent.setup();
    render(
      <CopilotThreadChooser
        activeThreadId={null}
        composeNewLabel="New chat"
        emptyThreadsLabel="No threads"
        newThreadLabel="New chat"
        onNewThread={() => {}}
        onSelectThread={onSelectThread}
        threads={[
          {
            id: THREAD_A,
            title: "First thread",
            last_message_at: new Date().toISOString(),
          },
          { id: THREAD_B, title: "Second thread" },
        ]}
        threadsSectionLabel="Threads"
      />
    );
    await user.click(screen.getByRole("button"));
    await user.click(screen.getByText("First thread"));
    expect(onSelectThread).toHaveBeenCalledWith(
      expect.objectContaining({ id: THREAD_A })
    );
  });
});
