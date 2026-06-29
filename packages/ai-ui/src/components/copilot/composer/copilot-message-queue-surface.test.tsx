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

function renderSurface(overrides: Record<string, unknown> = {}) {
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
      {...overrides}
    />
  );
  return handlers;
}

describe("CopilotMessageQueueSurface", () => {
  it("renders queued messages and the count", () => {
    renderSurface();
    expect(screen.getByText("first")).toBeTruthy();
    expect(screen.getByText("second")).toBeTruthy();
    expect(screen.getByText("Queued · 2")).toBeTruthy();
  });

  it("wires edit, send-now, and delete per row", () => {
    const h = renderSurface();
    fireEvent.click(screen.getAllByLabelText("Edit")[0]!);
    expect(h.onEdit).toHaveBeenCalledWith("a");
    fireEvent.click(screen.getAllByLabelText("Send now")[0]!);
    expect(h.onSendNow).toHaveBeenCalledWith("a");
    fireEvent.click(screen.getAllByLabelText("Delete")[1]!);
    expect(h.onRemove).toHaveBeenCalledWith("b");
  });

  it("renders a drag handle per row (sortable; reorder covered by the hook)", () => {
    renderSurface();
    expect(screen.getAllByLabelText("Drag to reorder")).toHaveLength(2);
  });

  it("renders nothing when the queue is empty", () => {
    const { container } = render(
      <CopilotMessageQueueSurface
        labels={labels}
        onEdit={vi.fn()}
        onRemove={vi.fn()}
        onReorder={vi.fn()}
        onSendNow={vi.fn()}
        queued={[]}
      />
    );
    expect(container.firstChild).toBeNull();
  });
});
