/** @vitest-environment happy-dom */
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  ListToolbar,
  ListToolbarActions,
  ListToolbarBulkActions,
  ListToolbarFilterRow,
  ListToolbarFilterToggle,
  ListToolbarIdleControls,
  ListToolbarMainArea,
  ListToolbarOverflowItem,
  ListToolbarSearch,
  ListToolbarSummary,
  useListToolbar,
} from "./list-toolbar-shell.js";
import { ListSearchInput } from "./list-toolbar.js";

afterEach(() => {
  cleanup();
});

function OverflowProbe() {
  const { overflowPlacement } = useListToolbar();
  return <span>placement:{overflowPlacement}</span>;
}

describe("ListToolbar", () => {
  it("renders search, summary, and idle controls when nothing is selected", () => {
    const { container } = render(
      <ListToolbar>
        <ListToolbarMainArea>
          <ListToolbarSearch>
            <ListSearchInput aria-label="Search" placeholder="Search" />
          </ListToolbarSearch>
          <ListToolbarSummary>12 items</ListToolbarSummary>
        </ListToolbarMainArea>
        <ListToolbarActions>
          <ListToolbarIdleControls>
            <button type="button">View</button>
          </ListToolbarIdleControls>
        </ListToolbarActions>
      </ListToolbar>
    );

    expect(screen.getByRole("textbox", { name: "Search" })).toBeTruthy();
    expect(screen.getByText("12 items")).toBeTruthy();
    expect(screen.getByRole("button", { name: "View" })).toBeTruthy();

    const search = container.querySelector('[data-slot="list-toolbar-search"]');
    expect(search?.className).toContain("max-w-[14rem]");
    expect(search?.className).toContain("focus-within:max-w-md");
    expect(search?.className).not.toMatch(/(?:^|\s)sm:flex-1(?:\s|$)/);
  });

  it("swaps idle controls for bulk actions when selectedCount > 0", () => {
    render(
      <ListToolbar selectedCount={2}>
        <ListToolbarMainArea>
          <ListToolbarSummary>2 selected</ListToolbarSummary>
        </ListToolbarMainArea>
        <ListToolbarActions moreLabel="More options">
          <ListToolbarIdleControls>
            <button type="button">View</button>
            <ListToolbarOverflowItem>
              <button type="button">Display</button>
            </ListToolbarOverflowItem>
          </ListToolbarIdleControls>
          <ListToolbarBulkActions
            clearSelectionLabel="Clear"
            onClearSelection={() => {}}
          >
            <button type="button">Delete</button>
          </ListToolbarBulkActions>
        </ListToolbarActions>
      </ListToolbar>
    );

    expect(screen.queryByRole("button", { name: "View" })).toBeNull();
    expect(screen.getByRole("button", { name: "Delete" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Clear" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "More options" })).toBeTruthy();
  });

  it("moves overflow items into the more menu with menu placement", async () => {
    const user = userEvent.setup();

    render(
      <ListToolbar selectedCount={1}>
        <ListToolbarMainArea>
          <ListToolbarSummary>1 selected</ListToolbarSummary>
        </ListToolbarMainArea>
        <ListToolbarActions moreLabel="More">
          <ListToolbarIdleControls>
            <ListToolbarOverflowItem>
              <OverflowProbe />
            </ListToolbarOverflowItem>
          </ListToolbarIdleControls>
          <ListToolbarBulkActions
            clearSelectionLabel="Clear"
            onClearSelection={() => {}}
          />
        </ListToolbarActions>
      </ListToolbar>
    );

    expect(screen.queryByText("placement:menu")).toBeNull();
    await user.click(screen.getByRole("button", { name: "More" }));
    expect(screen.getByText("placement:menu")).toBeTruthy();
  });

  it("renders filter toggle with active dot and filter row", () => {
    const onToggle = vi.fn();

    render(
      <ListToolbar>
        <ListToolbarMainArea>
          <ListToolbarSearch>
            <ListSearchInput
              aria-label="Search"
              className="pr-10"
              placeholder="Search"
            />
            <ListToolbarFilterToggle
              active
              aria-label="Filters"
              aria-pressed
              onClick={onToggle}
              showDot
            />
          </ListToolbarSearch>
        </ListToolbarMainArea>
        <ListToolbarFilterRow>
          <span>chip-row</span>
        </ListToolbarFilterRow>
      </ListToolbar>
    );

    expect(screen.getByRole("button", { name: "Filters" })).toBeTruthy();
    expect(screen.getByText("chip-row")).toBeTruthy();
  });

  it("does not take focus on mouse press, so the first click opens the filters", async () => {
    // The toggle sits at the right edge of a search field that widens on
    // focus-within. If pressing it moved focus there, the button would slide
    // out from under the cursor mid-press and the browser would never
    // synthesize a click — the first press would only expand the field.
    const user = userEvent.setup();
    const onToggle = vi.fn();

    render(
      <ListToolbar>
        <ListToolbarMainArea>
          <ListToolbarSearch>
            <ListSearchInput aria-label="Search" placeholder="Search" />
            <ListToolbarFilterToggle
              aria-label="Filters"
              onClick={onToggle}
            />
          </ListToolbarSearch>
        </ListToolbarMainArea>
      </ListToolbar>
    );

    const toggle = screen.getByRole("button", { name: "Filters" });
    await user.click(toggle);

    expect(onToggle).toHaveBeenCalledTimes(1);
    expect(document.activeElement).not.toBe(toggle);
  });

  it("calls onClearSelection from bulk clear button", async () => {
    const user = userEvent.setup();
    const onClear = vi.fn();

    render(
      <ListToolbar selectedCount={3}>
        <ListToolbarActions>
          <ListToolbarBulkActions
            clearSelectionLabel="Clear selection"
            onClearSelection={onClear}
          />
        </ListToolbarActions>
      </ListToolbar>
    );

    await user.click(screen.getByRole("button", { name: "Clear selection" }));
    expect(onClear).toHaveBeenCalledTimes(1);
  });
});
