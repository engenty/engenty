/** @vitest-environment happy-dom */
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ListViewModeToggle } from "./list-view-mode-toggle";

const labels = {
  group: "View layout",
  table: "List view",
  cards: "Cards view",
};

describe("ListViewModeToggle", () => {
  afterEach(() => {
    cleanup();
  });

  it("calls onChange when switching segments", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();

    render(
      <ListViewModeToggle labels={labels} onChange={onChange} value="cards" />
    );

    await user.click(screen.getByRole("button", { name: labels.table }));
    expect(onChange).toHaveBeenCalledWith("table");

    await user.click(screen.getByRole("button", { name: labels.cards }));
    expect(onChange).toHaveBeenCalledWith("cards");
  });

  it("marks the active segment with aria-pressed", () => {
    render(
      <ListViewModeToggle labels={labels} onChange={() => {}} value="table" />
    );

    expect(
      screen
        .getByRole("button", { name: labels.table })
        .getAttribute("aria-pressed")
    ).toBe("true");
    expect(
      screen
        .getByRole("button", { name: labels.cards })
        .getAttribute("aria-pressed")
    ).toBe("false");
  });
});
