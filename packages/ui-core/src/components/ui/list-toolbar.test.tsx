/** @vitest-environment happy-dom */
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Building2, User } from "lucide-react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ListIconSegmentToggle, ListSearchInput } from "./list-toolbar.js";

afterEach(() => {
  cleanup();
});

describe("ListSearchInput", () => {
  it("renders a ghosted leading search icon with inset padding", () => {
    const { container } = render(
      <ListSearchInput aria-label="Search contacts" placeholder="Search" />
    );

    const icon = container.querySelector("svg.lucide-search");
    expect(icon).not.toBeNull();
    expect(icon?.getAttribute("aria-hidden")).toBe("true");
    expect(icon?.className).toContain("text-muted-foreground");
    expect(icon?.className).toContain("left-2.5");

    const input = screen.getByRole("textbox", { name: "Search contacts" });
    expect(input.className).toContain("pl-8");
    expect(input.className).toContain("rounded-full");
  });
});

describe("ListIconSegmentToggle", () => {
  it("toggles active segment and supports deselect", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();

    const { rerender } = render(
      <ListIconSegmentToggle
        allowDeselect
        aria-label="Filter by type"
        onChange={onChange}
        segments={[
          { value: "organisation", label: "Organisations", icon: Building2 },
          { value: "person", label: "People", icon: User },
        ]}
        value=""
      />
    );

    await user.click(screen.getByRole("button", { name: "Organisations" }));
    expect(onChange).toHaveBeenCalledWith("organisation");

    onChange.mockClear();
    rerender(
      <ListIconSegmentToggle
        allowDeselect
        aria-label="Filter by type"
        onChange={onChange}
        segments={[
          { value: "organisation", label: "Organisations", icon: Building2 },
          { value: "person", label: "People", icon: User },
        ]}
        value="organisation"
      />
    );

    await user.click(screen.getByRole("button", { name: "Organisations" }));
    expect(onChange).toHaveBeenCalledWith("");
  });

  it("renders a rounded white pill shell", () => {
    const { container } = render(
      <ListIconSegmentToggle
        aria-label="Filter by type"
        onChange={() => {}}
        segments={[
          { value: "organisation", label: "Organisations", icon: Building2 },
        ]}
        value=""
      />
    );

    const shell = container.querySelector('[role="group"]');
    expect(shell?.className).toContain("rounded-full");
    expect(shell?.className).toContain("bg-card");
  });
});
