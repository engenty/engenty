/** @vitest-environment happy-dom */
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CopilotMessageQueueSurface } from "./copilot-message-queue-surface.js";

afterEach(cleanup);

const labels = {
  drag: "Drag to reorder",
  edit: "Edit",
  remove: "Delete",
  sendNow: "Send now",
  title: "Queued",
};

function renderSurface() {
  const handlers = {
    onEdit: vi.fn(),
    onRemove: vi.fn(),
    onReorder: vi.fn(),
    onSendNow: vi.fn(),
  };
  render(
    <CopilotMessageQueueSurface
      labels={labels}
      queued={[
        { id: "a", text: "first" },
        { id: "b", text: "second" },
      ]}
      {...handlers}
    />
  );
  return handlers;
}

describe("CopilotMessageQueueSurface", () => {
  it("wires edit, send-now, and delete per row", () => {
    const h = renderSurface();
    fireEvent.click(screen.getAllByLabelText("Edit")[0]!);
    expect(h.onEdit).toHaveBeenCalledWith("a");
    fireEvent.click(screen.getAllByLabelText("Send now")[0]!);
    expect(h.onSendNow).toHaveBeenCalledWith("a");
    fireEvent.click(screen.getAllByLabelText("Delete")[1]!);
    expect(h.onRemove).toHaveBeenCalledWith("b");
  });
});
