/**
 * @vitest-environment happy-dom
 */
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CopilotHostMessageHandoff } from "./copilot-host-message-handoff.js";

const mocks = vi.hoisted(() => ({
  clear: vi.fn(),
  navigate: vi.fn(),
}));

vi.mock("@engenty/ai-ui", () => ({
  clearPendingHostMessage: mocks.clear,
  ENGENTY_COPILOT_HOST_KEY: "engenty:copilot",
  PendingHostMessageSubmit: (props: { onConsumed?: () => void }) => (
    <button onClick={props.onConsumed} type="button">
      Mark delivered
    </button>
  ),
  resolvePendingHostMessage: () => "  exact message  ",
  useCopilotSelectedThread: () => ({
    binding: {
      activeThreadId: "221230c5-01c1-4b59-a3d1-1ee418a33b61",
      resolveSessionPath: (threadId: string) =>
        `/s/company/copilot/chat/${threadId}`,
    },
    isLoadingSelectedSessionMessages: false,
  }),
}));

vi.mock("react-router-dom", () => ({
  useLocation: () => ({
    pathname: "/s/company/copilot/chat/new",
    state: { pendingHostMessage: "  exact message  " },
  }),
  useNavigate: () => mocks.navigate,
}));

describe("CopilotHostMessageHandoff", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    root.unmount();
    container.remove();
    vi.clearAllMocks();
  });

  it("clears the park and binds the created thread URL after delivery", () => {
    act(() => {
      root.render(<CopilotHostMessageHandoff />);
    });

    const button = container.querySelector("button");
    expect(button?.textContent).toBe("Mark delivered");
    act(() => button?.click());

    expect(mocks.clear).toHaveBeenCalledWith("engenty:copilot");
    expect(mocks.navigate).toHaveBeenCalledWith(
      "/s/company/copilot/chat/221230c5-01c1-4b59-a3d1-1ee418a33b61",
      { replace: true, state: {} }
    );
  });
});
