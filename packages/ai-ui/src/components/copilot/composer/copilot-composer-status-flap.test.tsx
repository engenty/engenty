/** @vitest-environment happy-dom */
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { CopilotComposerStatusFlap } from "./copilot-composer-status-flap.js";

afterEach(cleanup);

const markdownReply =
  "Here are the tasks:\n\n| Task | Hours |\n|------|-------|\n| Design | 22 |";

function renderFlap(overrides: Record<string, unknown> = {}) {
  return render(
    <CopilotComposerStatusFlap
      chatStatus="ready"
      closing={false}
      messages={[]}
      replyText={markdownReply}
      {...overrides}
    />
  );
}

describe("CopilotComposerStatusFlap", () => {
  it("does not auto-expand content when autoExpand is false (threaded surfaces)", async () => {
    // Threaded surfaces already show the reply in the transcript above; the
    // flap must stay collapsed instead of showing it twice.
    const { rerender } = render(
      <CopilotComposerStatusFlap
        autoExpand={false}
        chatStatus="streaming"
        closing={false}
        messages={[]}
        replyText={markdownReply}
      />
    );
    rerender(
      <CopilotComposerStatusFlap
        autoExpand={false}
        chatStatus="ready"
        closing={false}
        messages={[]}
        replyText={markdownReply}
      />
    );
    await waitFor(() => {
      expect(screen.queryByRole("table")).toBeNull();
    });
  });

  it("prefers the live status ticker over the idle preview while running", () => {
    // A running turn must show progress, not the previous reply.
    renderFlap({
      chatStatus: "streaming",
      idlePreviewText: "Old reply that must not show while running.",
      labels: { waiting: "Wartet…" },
    });
    expect(screen.getByText("Wartet…")).toBeTruthy();
    expect(
      screen.queryByText("Old reply that must not show while running.")
    ).toBeNull();
  });

  it("renders the reply as markdown (a table), not raw pipe text, when expanded", async () => {
    // Compact surfaces have no transcript: a finished run expands the flap and
    // renders the reply through the same markdown component.
    const { rerender } = renderFlap({ chatStatus: "streaming" });
    rerender(
      <CopilotComposerStatusFlap
        chatStatus="ready"
        closing={false}
        messages={[]}
        replyText={markdownReply}
      />
    );
    await waitFor(
      () => {
        expect(screen.getByRole("table")).toBeTruthy();
      },
      { timeout: 10_000 }
    );
    expect(screen.getByText("Design")).toBeTruthy();
    expect(screen.queryByText(/\| Task \| Hours \|/)).toBeNull();
  }, 15_000);
});
