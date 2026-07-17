/**
 * @vitest-environment happy-dom
 */
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, useLocation } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ObjectDisplayIntentProvider } from "./object-display-intent.js";
import { ObjectListRow } from "./object-list.js";

const contactRef = { module: "contacts", entity: "contact", id: "c-1" };

function LocationProbe() {
  return <span data-testid="pathname">{useLocation().pathname}</span>;
}

function renderRow(
  intent: Parameters<typeof ObjectDisplayIntentProvider>[0]["value"],
  onOpenInPanel?: (ref: typeof contactRef) => void
) {
  return render(
    <MemoryRouter initialEntries={["/mdl/engenty-copilot/chat"]}>
      <ObjectDisplayIntentProvider value={intent}>
        <ObjectListRow
          href="/mdl/contacts/c-1"
          objectRef={contactRef}
          onOpenInPanel={onOpenInPanel}
          title="Ada Lovelace"
        />
      </ObjectDisplayIntentProvider>
      <LocationProbe />
    </MemoryRouter>
  );
}

describe("ObjectListRow primary action by surface", () => {
  afterEach(() => {
    cleanup();
  });

  // Full-page chat owns a pane: clicking a record opens it beside the
  // conversation rather than navigating the chat away.
  it("opens the panel instead of navigating when the surface has a pane", () => {
    const onOpenInPanel = vi.fn();
    renderRow({ openInPanel: vi.fn() }, onOpenInPanel);

    fireEvent.click(screen.getByRole("link", { name: /Ada Lovelace/ }));

    expect(onOpenInPanel).toHaveBeenCalledWith(contactRef);
    // The conversation stays put — that is the whole point of the pane.
    expect(screen.getByTestId("pathname").textContent).toBe(
      "/mdl/engenty-copilot/chat"
    );
  });

  // The drawer sits on top of the workspace — there is no pane to open into,
  // so a row behaves like any link.
  it("navigates normally when the surface provides no pane", () => {
    renderRow({});

    const link = screen.getByRole("link", { name: /Ada Lovelace/ });
    expect(link.getAttribute("href")).toBe("/mdl/contacts/c-1");

    fireEvent.click(link);
    expect(screen.getByTestId("pathname").textContent).toBe(
      "/mdl/contacts/c-1"
    );
  });

  it("hands navigation to the surface when it wants to keep the chat", () => {
    const navigateFromChat = vi.fn();
    renderRow({ navigateFromChat });

    const link = screen.getByRole("link", { name: /Ada Lovelace/ });
    fireEvent(
      link,
      new MouseEvent("click", { bubbles: true, cancelable: true })
    );

    expect(navigateFromChat).toHaveBeenCalledWith("/mdl/contacts/c-1");
  });

  // Modified clicks belong to the browser (new tab / new window).
  it("leaves cmd-click to the browser", () => {
    const onOpenInPanel = vi.fn();
    renderRow({ openInPanel: vi.fn() }, onOpenInPanel);

    const link = screen.getByRole("link", { name: /Ada Lovelace/ });
    fireEvent(
      link,
      new MouseEvent("click", {
        bubbles: true,
        cancelable: true,
        metaKey: true,
      })
    );

    expect(onOpenInPanel).not.toHaveBeenCalled();
  });

  it("drops the pane action from the row menu without a pane", () => {
    renderRow({});
    fireEvent.click(screen.getByRole("button", { name: "Actions" }));
    expect(screen.queryByText("Open in side panel")).toBeNull();
    expect(screen.getByText("Copy link")).toBeTruthy();
  });
});
