/** @vitest-environment happy-dom */
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import {
  CopilotComposerStatusFlap,
  getLastUserMessageText,
} from "./copilot-composer-status-flap.js";

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
    // The drawer/full chat pass autoExpand={false} because the reply is already
    // in the transcript above — the flap must stay collapsed (status only), not
    // open over the thread. Drive a completed run (streaming → ready).
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
    // No reply content is shown — only the status ticker.
    await waitFor(() => {
      expect(screen.queryByRole("table")).toBeNull();
    });
  });

  it("extracts the last user message text for the sending preview", () => {
    expect(
      getLastUserMessageText([
        { role: "user", parts: [{ type: "text", text: "First" }] },
        { role: "assistant", parts: [{ type: "text", text: "Reply" }] },
        { role: "user", parts: [{ type: "text", text: "Ändere den Titel" }] },
      ] as never)
    ).toBe("Ändere den Titel");
    expect(
      getLastUserMessageText([
        { role: "user", content: "String content form" },
      ] as never)
    ).toBe("String content form");
    expect(getLastUserMessageText([])).toBe("");
  });

  it("renders pending HITL interrupt content (approval card) in the flap", () => {
    // The compact surfaces (bottom dock, floating launcher) have no transcript,
    // so a pending approval MUST render inside the flap or it is unanswerable.
    renderFlap({
      interruptContent: <button type="button">Approve once</button>,
    });
    expect(screen.getByRole("button", { name: "Approve once" })).toBeTruthy();
  });

  it("shows a one-line idle preview of the last reply when the thread has history", () => {
    // Idle with prior conversation: the flap shows a single-line preview of the
    // last assistant reply (compact surfaces have no transcript) instead of the
    // "Done" status ticker.
    renderFlap({ idlePreviewText: "Angebotstitel wurde aktualisiert." });
    expect(screen.getByText("Angebotstitel wurde aktualisiert.")).toBeTruthy();
  });

  it("prefers the live status ticker over the idle preview while running", () => {
    // A running turn must show progress, not the stale previous reply.
    renderFlap({
      chatStatus: "streaming",
      idlePreviewText: "Old reply that must not show while running.",
    });
    expect(
      screen.queryByText("Old reply that must not show while running.")
    ).toBeNull();
  });

  it("renders the reply as markdown (a table), not raw pipe text, when expanded", async () => {
    // Auto-expand path (compact launcher/popover): the reply must render through
    // the same markdown component as the transcript, not as raw source.
    const { rerender } = renderFlap({ chatStatus: "streaming" });
    rerender(
      <CopilotComposerStatusFlap
        chatStatus="ready"
        closing={false}
        messages={[]}
        replyText={markdownReply}
      />
    );
    await waitFor(() => {
      expect(screen.getByRole("table")).toBeTruthy();
    });
    // The cell value is rendered, and the raw "| Task |" source is not present.
    expect(screen.getByText("Design")).toBeTruthy();
    expect(screen.queryByText(/\| Task \| Hours \|/)).toBeNull();
  });
});
