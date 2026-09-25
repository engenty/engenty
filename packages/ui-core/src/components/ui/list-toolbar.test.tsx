/** @vitest-environment happy-dom */
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Building2, User } from "lucide-react";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  ListFilterChip,
  ListIconSegmentToggle,
  ListSearchInput,
} from "./list-toolbar.js";

afterEach(() => {
  cleanup();
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
});

describe("ListFilterChip", () => {
  it("lets several checkbox values stay selected", async () => {
    const user = userEvent.setup();

    function Harness() {
      const [values, setValues] = useState<string[]>([]);
      return (
        <ListFilterChip
          ariaLabel="Provider"
          clearLabel="Clear filter"
          isActive={values.length > 0}
          label="All providers"
          multiple
          onClear={() => setValues([])}
          onValuesChange={setValues}
          options={[
            { value: "openai", label: "openai" },
            { value: "anthropic", label: "anthropic" },
          ]}
          values={values}
        />
      );
    }

    render(<Harness />);

    await user.click(screen.getByLabelText("Provider"));
    await user.click(
      await screen.findByRole("menuitemcheckbox", { name: "openai" })
    );
    await user.click(
      await screen.findByRole("menuitemcheckbox", { name: "anthropic" })
    );

    expect(
      screen.getByRole("menuitemcheckbox", { name: "openai" }).getAttribute("aria-checked")
    ).toBe("true");
    expect(
      screen.getByRole("menuitemcheckbox", { name: "anthropic" }).getAttribute("aria-checked")
    ).toBe("true");
  });
});
