/**
 * @vitest-environment happy-dom
 */
import { describe, expect, it } from "vitest";
import { isCopilotWindowMoveTarget } from "./copilot-window-move-target";

function mount(html: string): HTMLElement {
  document.body.innerHTML = html;
  const root = document.body.firstElementChild;
  if (!(root instanceof HTMLElement)) {
    throw new Error("expected a root element");
  }
  return root;
}

describe("isCopilotWindowMoveTarget", () => {
  it("allows dragging from empty title-bar space and the grip", () => {
    const root = mount(
      `<div data-copilot-window-titlebar>
         <span data-grip>grip</span>
         <button type="button">Close</button>
       </div>`
    );
    const grip = root.querySelector("[data-grip]");
    expect(isCopilotWindowMoveTarget(root)).toBe(true);
    expect(isCopilotWindowMoveTarget(grip)).toBe(true);
  });

  it("does not drag from header buttons", () => {
    const root = mount(
      `<div data-copilot-window-titlebar>
         <button type="button">Close</button>
       </div>`
    );
    expect(isCopilotWindowMoveTarget(root.querySelector("button"))).toBe(false);
  });

  it("ignores pointer-downs outside the title bar", () => {
    const root = mount("<div><p>transcript</p></div>");
    expect(isCopilotWindowMoveTarget(root.querySelector("p"))).toBe(false);
  });
});
